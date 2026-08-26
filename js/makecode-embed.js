    /**
     * makecode-embed.js
     * Embeds MakeCode editor in an iframe and loads a pre-configured project
     * with the TM micro:bit link extension and dynamic class names.
     *
     * Supports multiple independent iframes via the optional `iframeId` parameter.
     * Each iframe has its own message handler stored in `messageHandlers`.
     */

    import { deriveEnumIdentifiers, stripUnsafeChars } from './class-name.js';

    const MAKECODE_URL = "https://makecode.microbit.org/v7.1.47";

    // Origen del iframe, usado como targetOrigin en postMessage y para
    // validar los mensajes entrantes. Debe coincidir con MAKECODE_URL.
    const MAKECODE_ORIGIN = "https://makecode.microbit.org";

    const MAKECODE_LOAD_TIMEOUT_MS = 8000;

    // Map of iframeId → registered message handler
    const messageHandlers = {};

    // Map of iframeId → pending load timeout id
    const pendingTimeouts = {};

    // Map of iframeId → last openMakeCode params (for retry)
    const lastCallParams = {};

    function generateTmClassesTs(classNames) {
        // Identifiers are derived and de-duplicated: a class name is user input
        // and need not be a valid (nor unique) TypeScript identifier.
        //
        // Names go through stripUnsafeChars() before being interpolated:
        // defence in depth, a no-op for well-formed input, the same guard
        // formatUartMessage() applies at its own point of use. JSON.stringify()
        // escapes quotes and backslashes but NOT U+2028/U+2029, which are line
        // terminators in the ECMAScript grammar — one of them inside a name
        // ends the `//% block=` line mid-string and the generated file stops
        // being valid TypeScript.
        //
        // It used to be enough that names were normalized where they are
        // stored. The rehydration boundary no longer guarantees that, on
        // purpose: normalizing there would orphan the samples of an audio
        // project, where the class name is the key the recognizer indexes them
        // by. So each point of use guards itself.
        const safeNames = classNames.map(stripUnsafeChars);
        const identifiers = deriveEnumIdentifiers(safeNames);
        const enumMembers = safeNames.map((name, i) => {
            return `    //% block=${JSON.stringify(name)}\n    ${identifiers[i]} = ${i}`;
        });
        const arrayItems = safeNames.map(n => JSON.stringify(n)).join(', ');
        return `enum TMClase {\n${enumMembers.join(',\n')}\n}\nnamespace iaMachine {\n    export const _tmClaseNombres = [${arrayItems}];\n    //% blockId=tm_clase_picker\n    //% block="$clase"\n    //% blockHidden=true\n    //% shim=TD_ID\n    export function tmClasePicker(clase: TMClase): number {\n        return clase;\n    }\n}\n`;
    }

    function isPlainMakeCodeProject(value) {
        return (
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            // `text` es lo que después se expande con spread: un string ahí
            // produce un objeto de claves numéricas que se le postea al iframe.
            (value.text == null || (typeof value.text === 'object' && !Array.isArray(value.text)))
        );
    }

    /**
     * Un proyecto guardado solo sirve para reabrir si trae archivos. `null`,
     * `undefined` y `{}` son igual de vacíos: los tres tienen que caer en
     * generateProject(), que arma el proyecto completo con su pxt.json y la
     * dependencia de la extensión. Sin esta comprobación, un text vacío produce
     * un proyecto de un solo archivo —el tm-classes.ts regenerado—, sin
     * dependencias, y el panel abre un proyecto que no compila.
     *
     * La guarda de workspacesave sigue siendo la permisiva a propósito:
     * rechazar ahí costaría los bloques que el docente acaba de escribir.
     * Ésta es la del lado de lectura, donde descartar no destruye nada.
     */
    function hasUsableText(value) {
        return (
            isPlainMakeCodeProject(value) &&
            value.text != null &&
            Object.keys(value.text).length > 0
        );
    }

    function generateProject(classNames, projectName) {
        const tmClassesTs = generateTmClassesTs(classNames);
        const pxtJson = JSON.stringify({
            "name": projectName || "proyecto-ml",
            "description": "Proyecto con ML - micro:bit",
            "dependencies": {
                "core": "*",
                "bluetooth": "*",
                "pxt-tm-microbit-link": "github:snan-microbit/pxt-tm-microbit-link-v2#3a8e11f4f045ef8dcd81103c5fa7a33698a2c0da"
            }, 
            "files": ["main.blocks", "main.ts", "tm-classes.ts", "README.md"],
            "yotta": { "config": { "microbit-dal": { "bluetooth": { "open": 1 } } } }
        }, null, 4);

        return {
            text: {
                "main.blocks": '<xml xmlns="http://www.w3.org/1999/xhtml">\n  <variables></variables>\n</xml>',
                "main.ts": "// Programá tu micro:bit acá\n",
                "tm-classes.ts": tmClassesTs,
                "README.md": " ",
                "pxt.json": pxtJson
            }
        };
    }

    /**
     * Opens MakeCode in the given iframe.
     * @param {string[]} classNames     - Class names from the TM model
     * @param {object|null} savedProject - Previously saved project or null for new
     * @param {function|null} onSave    - Callback called with the project each time MakeCode saves
     * @param {string} [projectName]    - Project name for fresh projects
     * @param {string} [iframeId]       - ID of the iframe element (default: 'makecodeFrame')
     * @param {boolean} [hideSimulator] - Whether to hide the simulator panel
     */
    function openMakeCode(classNames, savedProject, onSave, projectName, iframeId = 'makecodeFrame', hideSimulator = false) {
        const iframe = document.getElementById(iframeId);
        if (!iframe) return;

        // savedProject sale de localStorage, que este proyecto trata como
        // entrada no confiable. project-schema.js preserva makecodeProject tal
        // cual a propósito (es el único campo que el docente no puede
        // reconstruir), así que la validación de forma vive en cada lectura.
        // Un proyecto sin archivos utilizables se ignora, no se destruye: el
        // dato sigue en el registro para recuperarlo.
        if (savedProject !== null && savedProject !== undefined && !hasUsableText(savedProject)) {
            console.warn('[makecode] proyecto guardado sin archivos utilizables, se abre uno nuevo');
            savedProject = null;
        }

        // Cache params for retry
        lastCallParams[iframeId] = { classNames, savedProject, onSave, projectName, iframeId, hideSimulator };

        // Remove any existing handler for this iframe
        if (messageHandlers[iframeId]) {
            window.removeEventListener('message', messageHandlers[iframeId]);
            delete messageHandlers[iframeId];
        }

        // Clear any pending timeout from a previous load attempt
        if (pendingTimeouts[iframeId]) {
            clearTimeout(pendingTimeouts[iframeId]);
            delete pendingTimeouts[iframeId];
        }

        // Hide any visible fallback overlay from a previous failure
        hideFallbackOverlay(iframeId);

        const handler = (event) => {
            // Defensa en profundidad: validar tanto la ventana emisora
            // como el origen del mensaje.
            if (event.source !== iframe.contentWindow) return;
            if (event.origin !== MAKECODE_ORIGIN) return;

            const data = event.data;
            if (!data || !data.type) return;

            if (data.action === 'workspacesync') {
                // First valid message from MakeCode — it loaded successfully.
                // Cancel the pending timeout.
                if (pendingTimeouts[iframeId]) {
                    clearTimeout(pendingTimeouts[iframeId]);
                    delete pendingTimeouts[iframeId];
                }

                let project;
                if (savedProject) {
                    // Deep copy to avoid mutating caller's object
                    project = { ...savedProject, text: { ...savedProject.text } };
                    // Always regenerate tm-classes.ts so class names stay in sync
                    project.text['tm-classes.ts'] = generateTmClassesTs(classNames);
                } else {
                    project = generateProject(classNames, projectName);
                }
                const response = {
                    ...data,
                    type: 'pxthost',
                    success: true,
                    projects: [project],
                    controllerId: 'tm-microbit-app',
                    editor: {}
                };
                iframe.contentWindow.postMessage(response, MAKECODE_ORIGIN);

                if (hideSimulator) {
                    iframe.contentWindow.postMessage(
                        { type: 'pxteditor', action: 'hidesimulator' },
                        MAKECODE_ORIGIN
                    );
                }
            } else if (data.action === 'workspacesave') {
                // Shape check at the point of entry. This object is stored
                // verbatim inside the project record, and the boundary in
                // project-schema.js deliberately does not touch it: it is the
                // one field a teacher cannot reconstruct, so it is preserved as
                // received rather than coerced. That makes this the place where
                // a malformed value has to be stopped.
                if (!isPlainMakeCodeProject(data.project)) {
                    console.warn('[makecode] workspacesave con forma inesperada, ignorado');
                } else if (onSave) {
                    onSave(data.project);
                }
            }
        };

        messageHandlers[iframeId] = handler;
        window.addEventListener('message', handler);

        // If we're already offline, show fallback immediately without trying.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            showFallbackOverlay(iframeId);
            return;
        }

        // Set timeout: if no workspacesync arrives within MAKECODE_LOAD_TIMEOUT_MS,
        // assume MakeCode failed to load and show fallback.
        pendingTimeouts[iframeId] = setTimeout(() => {
            delete pendingTimeouts[iframeId];
            showFallbackOverlay(iframeId);
        }, MAKECODE_LOAD_TIMEOUT_MS);

        iframe.src = MAKECODE_URL + '?controller=1';
    }

    /**
     * Closes MakeCode: clears the iframe src, removes the message listener,
     * cancels any pending timeout, and hides the fallback overlay.
     * @param {string} [iframeId] - ID of the iframe element (default: 'makecodeFrame')
     */
    function closeMakeCode(iframeId = 'makecodeFrame') {
        if (messageHandlers[iframeId]) {
            window.removeEventListener('message', messageHandlers[iframeId]);
            delete messageHandlers[iframeId];
        }
        if (pendingTimeouts[iframeId]) {
            clearTimeout(pendingTimeouts[iframeId]);
            delete pendingTimeouts[iframeId];
        }
        hideFallbackOverlay(iframeId);
        delete lastCallParams[iframeId];
        const iframe = document.getElementById(iframeId);
        if (iframe) iframe.src = 'about:blank';
    }

    function retryMakeCode(iframeId) {
        const params = lastCallParams[iframeId];
        if (!params) return;
        // openMakeCode will hide the overlay, clear timeouts, and start a fresh attempt.
        openMakeCode(
            params.classNames,
            params.savedProject,
            params.onSave,
            params.projectName,
            params.iframeId,
            params.hideSimulator
        );
    }

    function showFallbackOverlay(iframeId) {
        const iframe = document.getElementById(iframeId);
        if (!iframe) return;

        // Avoid duplicates
        const existing = document.getElementById('makecodeFallback-' + iframeId);
        if (existing) {
            existing.style.display = 'flex';
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'makecodeFallback-' + iframeId;
        overlay.className = 'makecode-fallback-overlay';
        overlay.innerHTML = `
            <div class="makecode-fallback-card">
                <h3>No se pudo cargar MakeCode</h3>
                <p>Necesitás conexión a internet para programar con bloques.<br>
                El resto de la app funciona normalmente.</p>
                <button type="button" class="btn-primary makecode-fallback-retry">
                    Reintentar conexión
                </button>
            </div>
        `;

        // Position the overlay over the iframe
        const parent = iframe.parentElement;
        if (parent && getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }
        (parent || document.body).appendChild(overlay);

        overlay.querySelector('.makecode-fallback-retry').addEventListener('click', () => {
            retryMakeCode(iframeId);
        });
    }

    function hideFallbackOverlay(iframeId) {
        const overlay = document.getElementById('makecodeFallback-' + iframeId);
        if (overlay && overlay.parentElement) {
            overlay.parentElement.removeChild(overlay);
        }
    }

    export { openMakeCode, closeMakeCode, retryMakeCode };
