/**
 * project-store.js
 * Project persistence — CRUD operations on localStorage
 */

import {
    MODELS_KEY,
    MODELS_QUARANTINE_KEY,
    MODELS_QUARANTINE_SEEN_KEY,
    corruptBackupKey
} from './storage-keys.js';
import { rehydrateProjects, PROJECT_SCHEMA_VERSION, DETAIL_MAX_LENGTH } from './project-schema.js';

/**
 * Bounds on the quarantine key. Two independent caps, because entries vary
 * enormously in size: a record carries makecodeProject with its _history, which
 * in a real project is tens of KB while a broken stub is a few bytes. Counting
 * entries alone would let twenty large records eat the origin's localStorage
 * quota — the same quota saveModels() then fails against, with a message
 * ("eliminá algún proyecto") that would not free the space, because nothing in
 * the UI deletes this key.
 */
const QUARANTINE_MAX_ENTRIES = 20;
// `JSON.stringify(...).length` cuenta unidades UTF-16, no bytes: Chrome
// contabiliza la cuota de localStorage a 2 bytes por unidad, así que el
// presupuesto real es del orden del doble. Los nombres dicen CHARS para que el
// número no se lea como algo que no es.
const QUARANTINE_MAX_CHARS = 64 * 1024;
const QUARANTINE_MAX_ENTRY_CHARS = 32 * 1024;

let lastQuarantinedCount = 0;
let lastQuarantinePersisted = true;
let lastQuarantineFingerprint = '';
let lastQuarantineAcknowledged = '';

/**
 * Fingerprint of the stored quarantine: entry count plus serialized length.
 *
 * The acknowledgement records CONTENT, not a count, and that is not a detail. A
 * count cannot work: the stored list is capped at QUARANTINE_MAX_ENTRIES while a
 * single load can reject any number of records, so the two are not comparable —
 * an acknowledgement taken on a large load lands above anything the count can
 * reach again and the notice goes deaf permanently. A fingerprint changes
 * whenever the quarantine gains something; a record that could NOT be stored is
 * reported through `persisted` instead, which outranks any acknowledgement.
 */
function fingerprintOf(list) {
    return `${list.length}:${JSON.stringify(list).length}`;
}

function readQuarantineSeen() {
    // Su propio try, igual que readQuarantine(): updateQuarantine() no puede
    // lanzar. No cubre el caso de un localStorage que falla al LEER en general —
    // el getItem(MODELS_KEY) que abre loadModels() sigue sin guarda, así que ahí
    // el home no renderizaría igual; ver el pendiente de la sección 7.
    try {
        return localStorage.getItem(MODELS_QUARANTINE_SEEN_KEY) ?? '';
    } catch (e) {
        return '';
    }
}

/**
 * Marks the current quarantine as seen. Does NOT delete anything: the quarantine
 * copy can be the only one left of a record.
 *
 * Refuses when the quarantine is not fully persisted. Acknowledging then would
 * silence the one notice that says data is at risk — and that data is gone for
 * good on the next mutation.
 *
 * Returns whether the acknowledgement was recorded.
 */
export function acknowledgeQuarantine() {
    if (!lastQuarantinePersisted) return false;
    try {
        localStorage.setItem(MODELS_QUARANTINE_SEEN_KEY, lastQuarantineFingerprint);
        lastQuarantineAcknowledged = lastQuarantineFingerprint;
        return true;
    } catch (e) {
        console.warn('[project-store] No se pudo guardar el acuse de la cuarentena:', e);
        return false;
    }
}

/**
 * State of the quarantine, for the UI notice.
 *
 * `needsNotice` is the whole rule, decided here so no consumer rebuilds it: show
 * the notice while something is set aside that the user has not acknowledged, or
 * whenever the copy is incomplete — a failed write or an entry that did not fit
 * always shows, acknowledgement or not.
 */
export function getQuarantineStatus() {
    const unacknowledged =
        lastQuarantinedCount > 0 && lastQuarantineFingerprint !== lastQuarantineAcknowledged;
    return {
        count: lastQuarantinedCount,
        needsNotice: unacknowledged || !lastQuarantinePersisted,
        persisted: lastQuarantinePersisted
    };
}

/**
 * Records the boundary set aside. Never rehydrated from.
 *
 * Exported deliberately, as a console API: when a teacher reports a project
 * that vanished, calling readQuarantine() from DevTools is how the record is
 * recovered. It is also the seed of the diagnostics half of the future export
 * feature. Anything that ever renders these values must use textContent —
 * `detail` carries text that came out of localStorage.
 */
export function readQuarantine() {
    try {
        const stored = localStorage.getItem(MODELS_QUARANTINE_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

/**
 * Keeps one entry inside its own budget. An entry too large to store whole is
 * reduced to what still allows diagnosing it; without this, a single oversized
 * record would either blow the total budget or push every other entry out.
 */
function shrinkEntry(entry) {
    let serialized;
    try {
        serialized = JSON.stringify(entry);
    } catch (e) {
        serialized = null;
    }
    if (serialized !== null && serialized.length <= QUARANTINE_MAX_ENTRY_CHARS) {
        return entry;
    }

    // `detail` se acota con la misma cota que aplica detailOf() en origen. Todo
    // lo que escribe esta app ya viene truncado; una entrada leída de disco —el
    // único caso que llega acá— puede traer cualquier cosa, y sin esto el
    // resumen conserva el bulto entero: la entrada sigue por encima del
    // presupuesto, y como el bucle de caracteres nunca saca la última, una sola
    // entrada mantiene la clave sobredimensionada para siempre.
    const detail =
        typeof entry.detail === 'string' ? entry.detail.slice(0, DETAIL_MAX_LENGTH) : entry.detail;

    // Una entrada que YA es un resumen no se vuelve a resumir: recalcular
    // recordId y recordBytes sobre un stub sin `record` la haría diferir de sí
    // misma y provocaría una escritura por carga hasta converger.
    if (entry.truncated === true) {
        return { ...entry, detail };
    }

    const record = entry.record;
    return {
        reason: entry.reason,
        detail,
        truncated: true,
        recordId:
            record !== null && typeof record === 'object'
                ? String(record.id).slice(0, DETAIL_MAX_LENGTH)
                : null,
        recordBytes: serialized === null ? -1 : serialized.length
    };
}

/**
 * How many incoming entries get the duplicate check before the cap decides.
 * Bounded so a corrupt ml-microbit-models with thousands of records cannot make
 * every render serialize all of them; beyond the budget nothing can be known
 * about them, so they count as not stored, which is the safe direction for an
 * honesty flag.
 */
const QUARANTINE_DEDUP_SCAN = QUARANTINE_MAX_ENTRIES * 2;

/**
 * Merges what this load rejected into what is already stored and applies both
 * caps. Returns {list, dropped}: `list` is what to write, or null when nothing
 * needs writing; `dropped` is how many incoming entries did not make it.
 *
 * The cap keeps the OLDEST entries. An old entry has already been overwritten
 * out of MODELS_KEY by some later mutation, so this copy is the only one left;
 * a recent one usually still exists in MODELS_KEY.
 */
function mergeQuarantine(previous, incoming) {
    const seen = new Set();
    for (const entry of previous) seen.add(JSON.stringify(entry));

    const merged = previous.slice();
    let dropped = 0;

    for (let i = 0; i < incoming.length; i++) {
        if (i >= QUARANTINE_DEDUP_SCAN) {
            dropped += incoming.length - i;
            break;
        }
        const shrunk = shrinkEntry(incoming[i]);
        const serialized = JSON.stringify(shrunk);
        // El duplicado se descarta ANTES de mirar la cota: una entrada que ya
        // está guardada no se perdió, y contarla como perdida es lo que volvía
        // permanente el mensaje de "no pudimos guardarlos".
        if (seen.has(serialized)) continue;
        if (merged.length >= QUARANTINE_MAX_ENTRIES) {
            dropped++;
            continue;
        }
        seen.add(serialized);
        merged.push(shrunk);
    }

    let capped = merged;
    while (capped.length > 1 && JSON.stringify(capped).length > QUARANTINE_MAX_CHARS) {
        capped = capped.slice(0, capped.length - 1);
    }
    dropped += merged.length - capped.length;

    // Comparación contra el RESULTADO ya recortado: con el tope lleno,
    // cualquier otra forma produciría una lista "nueva" en cada carga y
    // escribiría localStorage en cada render.
    if (JSON.stringify(capped) === JSON.stringify(previous)) {
        return { list: null, dropped };
    }
    return { list: capped, dropped };
}

/**
 * Nunca lanza y nunca borra la clave: la copia de la cuarentena puede ser la
 * única que queda de un registro, porque la próxima mutación reescribe
 * MODELS_KEY ya canonizado y el registro roto desaparece de ahí.
 */
function updateQuarantine(quarantined) {
    lastQuarantinePersisted = true;

    // Se acota EN LA LECTURA. `previous` sale de localStorage sin ninguna cota
    // propia, y el bucle de recorte re-serializa la lista entera por cada
    // entrada que saca: con miles de entradas guardadas —tampering, o una app
    // hermana del mismo origen— eso bloquea la pestaña varios segundos en cada
    // render, y un try/catch no atrapa un cuelgue.
    //
    // Se aplican las MISMAS tres cotas que el camino de mezcla, no solo la de
    // entradas: 20 entradas enormes quedarían por encima del presupuesto de
    // tamaño para siempre, porque en las cargas siguientes ya no habría nada
    // que recortar.
    const rawStored = readQuarantine();
    let stored = rawStored.slice(0, QUARANTINE_MAX_ENTRIES).map(shrinkEntry);
    while (stored.length > 1 && JSON.stringify(stored).length > QUARANTINE_MAX_CHARS) {
        stored = stored.slice(0, stored.length - 1);
    }

    const rawSerialized = JSON.stringify(rawStored);
    const repaired = JSON.stringify(stored);
    // Se compara por LARGO, no por diferencia: así "la reparación nunca escribe
    // algo más grande de lo que había" es un invariante estructural y no un
    // argumento sobre de dónde vino el dato. Con la clave vacía, rawSerialized
    // es "[]" y nada puede ser más corto, así que no hace falta otro guard.
    //
    // Y se compara contra rawStored SERIALIZADO, no contra el string crudo de
    // getItem(): los dos lados pasan entonces por el mismo round-trip de
    // JSON.parse, y una diferencia de formato (1.0 → 1, escapes, claves
    // repetidas) no puede disparar una reescritura en cada carga.
    if (repaired.length < rawSerialized.length) {
        console.warn(
            `[project-store] Cuarentena sobredimensionada reparada: ` +
            `${rawStored.length - stored.length} entrada(s) descartada(s).`
        );
        // try propio, y no marca la cuarentena como no persistida: un fallo deja
        // el contenido viejo intacto en disco, así que no pone nada en riesgo.
        try {
            localStorage.setItem(MODELS_QUARANTINE_KEY, repaired);
        } catch (e) {
            console.warn('[project-store] No se pudo recortar la cuarentena sobredimensionada:', e);
        }
    }

    // El try abarca la mezcla además del setItem: esta función existe para no
    // romper nunca ante dato roto, y shrinkEntry()/mergeQuarantine() corren
    // sobre valores que salieron de JSON.parse.
    try {
        if (quarantined.length > 0) {
            const { list, dropped } = mergeQuarantine(stored, quarantined);
            if (dropped > 0) {
                // Si algo no entró, el aviso no puede seguir diciendo que se
                // guardó todo — el mismo criterio que ante un fallo de escritura.
                console.warn(`[project-store] ${dropped} registro(s) no entraron en la cuarentena`);
                lastQuarantinePersisted = false;
            }
            if (list !== null) {
                localStorage.setItem(MODELS_QUARANTINE_KEY, JSON.stringify(list));
                stored = list;
            }
        }
    } catch (e) {
        console.warn('[project-store] No se pudo preservar la cuarentena:', e);
        lastQuarantinePersisted = false;
    }

    lastQuarantinedCount = Math.max(stored.length, quarantined.length);
    lastQuarantineFingerprint = fingerprintOf(stored);
    lastQuarantineAcknowledged = readQuarantineSeen();
}

export function loadModels() {
    const stored = localStorage.getItem(MODELS_KEY);
    if (!stored) {
        updateQuarantine([]);
        return [];
    }

    let parsed;
    try {
        parsed = JSON.parse(stored);
    } catch (e) {
        console.error('[project-store] localStorage corrupto, no se pudo parsear:', e);
        preserveCorruptData(stored);
        updateQuarantine([]);
        return [];
    }

    // JSON.parse('"foo"') o JSON.parse('123') no lanzan error pero no son arrays.
    if (!Array.isArray(parsed)) {
        console.error('[project-store] Formato inesperado, se esperaba un array.');
        preserveCorruptData(stored);
        updateQuarantine([]);
        return [];
    }

    // Frontera de rehidratación: canoniza lo reparable, aparta lo que no.
    // No se reescribe MODELS_KEY acá: la canonización se aplica en memoria en
    // cada carga y se persiste sola en la próxima mutación que llame a
    // saveModels(). Convertir una lectura en escritura es riesgo de cuota gratis.
    const { projects, quarantined } = rehydrateProjects(parsed);
    if (quarantined.length > 0) {
        console.warn(
            `[project-store] ${quarantined.length} registro(s) en cuarentena:`,
            quarantined.map((q) => q.reason)
        );
    }
    updateQuarantine(quarantined);

    return projects;
}

/**
 * Guarda el valor corrupto bajo una clave aparte antes de descartarlo,
 * para que los datos sean recuperables manualmente si hiciera falta.
 * Nunca lanza: si ni siquiera esto se puede escribir, se ignora.
 */
function preserveCorruptData(raw) {
    try {
        const backupKey = corruptBackupKey(Date.now());
        localStorage.setItem(backupKey, raw);
        console.warn(`[project-store] Datos corruptos preservados en "${backupKey}"`);
    } catch (e) {
        console.warn('[project-store] No se pudo preservar el backup:', e);
    }
}

/**
 * Error identificable para que la UI pueda mostrar un mensaje específico
 * en lugar de un fallo genérico.
 */
export class StorageQuotaError extends Error {
    constructor() {
        super('No hay espacio suficiente para guardar. Eliminá algún proyecto para liberar espacio.');
        this.name = 'StorageQuotaError';
    }
}

export function saveModels(models) {
    try {
        localStorage.setItem(MODELS_KEY, JSON.stringify(models));
    } catch (e) {
        // El nombre y el código varían entre navegadores.
        const isQuota =
            e.name === 'QuotaExceededError' ||
            e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
            e.code === 22 ||
            e.code === 1014;

        if (isQuota) {
            console.error('[project-store] Cuota de localStorage excedida:', e);
            throw new StorageQuotaError();
        }
        throw e;
    }
}

export function addProject(name, projectType) {
    const models = loadModels();
    const newModel = {
        schemaVersion: PROJECT_SCHEMA_VERSION,
        id: Date.now().toString(),
        name: name.trim(),
        projectType: projectType,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        makecodeProject: null,
    };
    models.unshift(newModel);
    saveModels(models);
    return newModel;
}

/**
 * Trainer that owns a project's data, chosen by projectType.
 *
 * Not by localModel.source: the samples live under a key built from the id
 * alone and have nothing to do with the model pointer, so a project whose
 * localModel the boundary discarded must still be able to delete them. The
 * rehydration boundary guarantees projectType is one of the three, and that it
 * agrees with source whenever a model survived.
 */
function trainerFor(projectType, trainerModules) {
    const { trainer, audioTrainer, poseTrainer } = trainerModules;
    if (projectType === 'audio') return audioTrainer;
    if (projectType === 'pose') return poseTrainer;
    return trainer;
}

/**
 * Deletes a project's samples, its weights when there are any, and the record.
 *
 * Returns {samplesDeleted}: the record always comes out of the list, but the
 * caller has to be able to tell a clean delete from one that left the samples
 * behind. Reporting "Proyecto eliminado" over a failed sample delete would be
 * false precisely in the case this function exists to prevent — in image and
 * pose those samples are webcam JPEG data URLs.
 */
export async function deleteProject(id, trainerModules) {
    const models = loadModels();
    const project = models.find(m => m.id === id);
    let samplesDeleted = true;

    if (project) {
        const owner = trainerFor(project.projectType, trainerModules);

        // Las muestras se borran SIEMPRE, por id, fuera de cualquier guard sobre
        // localModel. En imagen y pose son dataURLs JPEG de la webcam: dejarlas
        // atrás mientras la UI dice "Proyecto eliminado" es la peor combinación
        // posible en una máquina compartida de aula.
        //
        // Los fallos se registran y no se propagan: el registro tiene que salir
        // de la lista igual. Abortar acá dejaba el proyecto en su lugar sin
        // ningún error, y el único recurso del docente era borrar datos del
        // sitio, perdiendo también todos los demás proyectos.
        try {
            await owner.deleteSamplesDB(id);
        } catch (e) {
            samplesDeleted = false;
            console.error('[project-store] No se pudieron borrar las muestras:', e);
        }

        if (project.localModel?.storageKey) {
            try {
                await owner.deleteModel(project.localModel.storageKey);
            } catch (e) {
                console.error('[project-store] No se pudieron borrar los pesos:', e);
            }
        }
    }

    saveModels(models.filter(m => m.id !== id));
    return { samplesDeleted };
}

export function updateProjectMakeCode(id, makecodeProject) {
    const models = loadModels();
    const model = models.find(m => m.id === id);
    if (model) {
        model.makecodeProject = makecodeProject;
        model.lastUsed = new Date().toISOString();
        saveModels(models);
    }
}

export function updateProjectModel(id, localModelInfo) {
    const models = loadModels();
    const project = models.find(m => m.id === id);
    if (project) {
        project.localModel = localModelInfo;
        project.classNames = localModelInfo.classNames;
        saveModels(models);
        return project;
    }
    return null;
}
