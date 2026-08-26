// js/project-schema.js

/**
 * Rehydration boundary for the project list.
 *
 * Pure module: no browser APIs, no side effects, importable from node:test.
 * Same pattern as protocol.js, sanitize.js, class-name.js and storage-keys.js.
 *
 * localStorage is untrusted input in this project. Everything that comes out of
 * it crosses this module before any other code sees it, so that there is exactly
 * one place where a project record is decided to be usable, repairable or
 * broken — and one place a future migration hooks into.
 */

import {
    requireProjectId,
    imageModelKey,
    audioModelKey,
    poseModelKey
} from './storage-keys.js';

/**
 * Schema version stamped on every record this version of the app writes.
 *
 * A record without the field is a record written before versioning existed and
 * is v1 by definition. That fallback can only be spent once, which is why the
 * field is introduced before any teacher data exists.
 *
 * Bumping this is only ever correct together with a migration in
 * canonicalizeProject(), and only for an ADDITIVE change: a client that is
 * offline keeps its old Service Worker, so an older build of the app can read a
 * record written by a newer one. Renaming or repurposing a field breaks that
 * client with no way to roll back.
 */
export const PROJECT_SCHEMA_VERSION = 1;

/** The project types this version of the app knows how to open. */
export const PROJECT_TYPES = ['image', 'audio', 'pose'];

/**
 * Quarantine reason codes.
 *
 * Fixed strings, never interpolated with stored data: the offending value
 * travels separately in `detail`, truncated. Two reasons for the split. It
 * bounds what one bad record costs in the quarantine key — a `source` of a
 * megabyte would otherwise be copied into the reason as well as the record —
 * and it keeps a future diagnostics screen from turning a reason string into an
 * injection sink. Anything that renders `detail` must use textContent.
 */
export const QUARANTINE_REASON = {
    NOT_AN_OBJECT: 'registro-no-es-objeto',
    INVALID_ID: 'id-invalido',
    UNKNOWN_TYPE: 'tipo-desconocido',
    DUPLICATE_ID: 'id-duplicado'
};

export const DETAIL_MAX_LENGTH = 120;

/** Short, safe rendering of the value that caused a quarantine. */
function detailOf(value) {
    let text;
    try {
        text = typeof value === 'string' ? value : String(value);
    } catch (e) {
        text = '(no representable)';
    }
    return text.length > DETAIL_MAX_LENGTH
        ? `${text.slice(0, DETAIL_MAX_LENGTH)}…`
        : text;
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Dispatch maps with a null prototype. The key comes out of localStorage, so
 * nothing inherited from Object.prototype must be reachable through it: a
 * source of 'constructor' or 'toString' resolves to nothing here. The
 * hasOwnProperty guard below stays as the explicit statement of intent.
 *
 * localModel.source values keep their historical shape and carry no prefix:
 * they are internal vocabulary of the data, not origin-scoped names.
 */
const TYPE_BY_SOURCE = Object.assign(Object.create(null), {
    'local': 'image',
    'local-audio': 'audio',
    'local-pose': 'pose'
});

const MODEL_KEY_BY_SOURCE = Object.assign(Object.create(null), {
    'local': imageModelKey,
    'local-audio': audioModelKey,
    'local-pose': poseModelKey
});

const DEFAULT_NAME = 'Proyecto sin nombre';

/** Canonical id, or null. Delegates to storage-keys so there is one notion of a valid id. */
function canonicalId(value) {
    try {
        return requireProjectId(value);
    } catch (e) {
        return null;
    }
}

/**
 * Array.prototype.every() skips absent indices, so it returns true for a holey
 * array. Structure matters here, so the loop is explicit.
 */
function isStringArray(value) {
    if (!Array.isArray(value)) return false;
    for (let i = 0; i < value.length; i++) {
        if (typeof value[i] !== 'string') return false;
    }
    return true;
}

/**
 * Class names are usable only when there is at least one. An empty array is as
 * unusable as a holey one: loadSavedModel() would rebuild a zero-class model,
 * and generateTmClassesTs([]) emits an empty enum, which is invalid TypeScript
 * and fails to compile in MakeCode. Empty is also truthy, so it would win the
 * `||` below without this.
 */
function usableClassNames(value) {
    return isStringArray(value) && value.length > 0 ? value : null;
}

/**
 * Canonicalizes one raw record.
 *
 * Returns {ok: true, project} with everything repairable repaired, or
 * {ok: false, reason, detail} for a record whose IDENTITY cannot be recovered.
 * `reason` is a code from QUARANTINE_REASON and `detail` is the offending value,
 * truncated — neither is a user-facing message.
 */
export function canonicalizeProject(raw) {
    if (!isPlainObject(raw)) {
        return {
            ok: false,
            reason: QUARANTINE_REASON.NOT_AN_OBJECT,
            detail: detailOf(raw)
        };
    }

    // Shallow copy, deliberately NOT a whitelist of known fields. A record
    // written by a newer version of the app carries fields this version knows
    // nothing about, and dropping them here would make this boundary the thing
    // that breaks forward compatibility: the stripped record is what
    // saveModels() persists on the next mutation.
    const project = { ...raw };

    // --- id: identity. The only field whose loss loses the project. ---
    const id = canonicalId(project.id);
    if (id === null) {
        return {
            ok: false,
            reason: QUARANTINE_REASON.INVALID_ID,
            detail: detailOf(raw.id)
        };
    }
    project.id = id;

    // --- schema version: repaired, never fatal ---
    // It locates no data, so an unrecognizable value costs nothing to treat as
    // the oldest version — and that is the safe direction, because a future
    // migration then runs over it. A version ABOVE PROJECT_SCHEMA_VERSION is
    // left untouched and accepted: it was written by a newer build, changes are
    // additive by rule, and refusing it would hide the project from a user who
    // only reloaded while offline.
    if (!Number.isInteger(project.schemaVersion) || project.schemaVersion < 1) {
        project.schemaVersion = 1;
    }

    // --- classNames, resolved first ---
    // It is duplicated between the project and localModel (updateProjectModel
    // writes both), and an unusable value in both copies is what makes a trained
    // model unusable: every loadSavedModel() dereferences it without a guard.
    const candidateModel = isPlainObject(project.localModel) ? project.localModel : null;
    const fromProject = usableClassNames(project.classNames);
    const fromModel = candidateModel !== null ? usableClassNames(candidateModel.classNames) : null;
    const classNames = fromProject || fromModel;

    // --- localModel: DISCARDABLE. Nothing about it quarantines the project. ---
    //
    // The record has two halves with very different value. The project itself —
    // name, type, MakeCode blocks, class names — is the teacher's work and does
    // not regenerate. localModel is only a pointer to weights that retraining
    // rebuilds in two minutes. When the pointer is broken, quarantining the
    // whole record throws away the irreplaceable half to protect the
    // replaceable one, so instead the pointer is dropped and the project comes
    // back untrained.
    //
    // The audit requirement still holds: storageKey is read verbatim by
    // loadSavedModel() and deleteProject() and handed to tf.io, whose keyspace
    // is shared with every other app on the origin. A key from a superseded
    // scheme (the tm- to ml- rename, done without migration) or a tampered one
    // never reaches tf.io, because it never survives this block.
    let source = null;
    let hintedType = null;
    if (candidateModel !== null) {
        const candidateSource = candidateModel.source;
        const builder = Object.prototype.hasOwnProperty.call(
            MODEL_KEY_BY_SOURCE,
            candidateSource
        )
            ? MODEL_KEY_BY_SOURCE[candidateSource]
            : null;
        if (builder !== null) {
            // Even a model that gets discarded still says which trainer wrote
            // it, which can be the only surviving clue to the project type.
            hintedType = TYPE_BY_SOURCE[candidateSource];
            if (candidateModel.storageKey === builder(id) && classNames !== null) {
                source = candidateSource;
                project.localModel = {
                    ...candidateModel,
                    classNames: classNames.slice()
                };
            }
        }
    }
    if (source === null) {
        delete project.localModel;
    }

    // --- projectType ---
    // With a surviving model, source wins: it is what decides which trainer owns
    // the samples and the weights, so it is where the data actually is. Without
    // one there is no data to locate, so the stored type is used, falling back
    // to what the discarded model hinted.
    let type;
    if (source !== null) {
        type = TYPE_BY_SOURCE[source];
    } else if (PROJECT_TYPES.includes(project.projectType)) {
        type = project.projectType;
    } else {
        type = hintedType;
    }
    if (!PROJECT_TYPES.includes(type)) {
        return {
            ok: false,
            reason: QUARANTINE_REASON.UNKNOWN_TYPE,
            detail: detailOf(raw.projectType)
        };
    }
    project.projectType = type;

    // --- name: repaired. A label with no functional role. ---
    project.name =
        typeof project.name === 'string' && project.name.trim() !== ''
            ? project.name.trim()
            : DEFAULT_NAME;

    // createdAt, lastUsed and makecodeProject are deliberately NOT touched.
    // Deleting or coercing a field whose type this version does not expect is
    // the same forward-compatibility break the shallow copy above exists to
    // avoid, and it becomes permanent on the next saveModels(). makecodeProject
    // is on top of that the one field a teacher cannot reconstruct, and nothing
    // in this module consumes it — its shape guard lives in makecode-embed.js,
    // where the value enters. Consumers that display these fields guard
    // themselves; see formatDate() in app.js.

    if (classNames !== null) {
        project.classNames = classNames.slice();
    } else {
        delete project.classNames;
    }

    return { ok: true, project };
}

/**
 * Canonicalizes a whole list.
 *
 * Returns {projects, quarantined}. `quarantined` carries the raw record
 * untouched, so nothing is lost by being rejected.
 */
export function rehydrateProjects(rawList) {
    const projects = [];
    const quarantined = [];

    if (!Array.isArray(rawList)) {
        return { projects, quarantined };
    }

    const seen = new Set();
    // A hole in the array is canonicalized as undefined and therefore
    // quarantined, on purpose: a hole is data that went missing, and this
    // boundary reports that rather than passing over it. forEach() and every()
    // skip absent indices, so neither can be used here.
    for (let i = 0; i < rawList.length; i++) {
        const raw = rawList[i];
        const result = canonicalizeProject(raw);
        if (!result.ok) {
            quarantined.push({
                reason: result.reason,
                detail: result.detail,
                record: raw
            });
            continue;
        }
        if (seen.has(result.project.id)) {
            // The list is newest-first (addProject unshifts), so the first
            // occurrence is the one to keep.
            quarantined.push({
                reason: QUARANTINE_REASON.DUPLICATE_ID,
                detail: detailOf(result.project.id),
                record: raw
            });
            continue;
        }
        seen.add(result.project.id);
        projects.push(result.project);
    }

    return { projects, quarantined };
}
