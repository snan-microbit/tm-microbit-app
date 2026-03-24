/**
 * makecode-embed.js
 * Embeds MakeCode editor in an iframe and loads a pre-configured project
 * with the TM micro:bit link extension and dynamic class names.
 */

const MAKECODE_URL = "https://makecode.microbit.org";

let messageHandler = null;

function generateTmClassesTs(classNames) {
    const enumMembers = classNames.map((name, i) => {
        const safeName = name.charAt(0).toUpperCase() + name.slice(1).replace(/[^a-zA-Z0-9]/g, '_');
        return `    //% block="${name}"\n    ${safeName} = ${i}`;
    });
    const arrayItems = classNames.map(n => `"${n}"`).join(', ');
    return `enum TMClase {\n${enumMembers.join(',\n')}\n}\nnamespace iaMachine {\n    export const _tmClaseNombres = [${arrayItems}];\n    //% blockId=tm_clase_picker\n    //% block="$clase"\n    //% blockHidden=true\n    //% shim=TD_ID\n    export function tmClasePicker(clase: TMClase): number {\n        return clase;\n    }\n}\n`;
}

function generateProject(classNames, projectName) {
    const tmClassesTs = generateTmClassesTs(classNames);
    const pxtJson = JSON.stringify({
        "name": projectName || "proyecto-tm",
        "description": "Proyecto con Teachable Machine",
        "dependencies": {
            "core": "*",
            "bluetooth": "*",
            "pxt-tm-microbit-link": "github:snan-microbit/pxt-tm-microbit-link-v2"
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
 * Opens MakeCode in the iframe.
 * @param {string[]} classNames  - Class names from the TM model
 * @param {object|null} savedProject - Previously saved project object ({ text: {...} }) or null for new
 * @param {function|null} onSave - Callback called with the project object each time MakeCode saves
 * @param {string} [projectName] - Project name used when generating a fresh project
 */
function openMakeCode(classNames, savedProject, onSave, projectName) {
    const iframe = document.getElementById('makecodeFrame');

    if (messageHandler) {
        window.removeEventListener('message', messageHandler);
        messageHandler = null;
    }

    messageHandler = (event) => {
        if (event.source !== iframe.contentWindow) return;

        const data = event.data;
        if (!data || !data.type) return;

        if (data.action === 'workspacesync') {
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
            iframe.contentWindow.postMessage(response, '*');
        } else if (data.action === 'workspacesave') {
            if (data.project && onSave) {
                onSave(data.project);
            }
        }
    };

    window.addEventListener('message', messageHandler);
    iframe.src = MAKECODE_URL + '?controller=1';
}

/**
 * Closes MakeCode: clears the iframe and removes the message listener.
 */
function closeMakeCode() {
    if (messageHandler) {
        window.removeEventListener('message', messageHandler);
        messageHandler = null;
    }
    const iframe = document.getElementById('makecodeFrame');
    iframe.src = 'about:blank';
}

export { openMakeCode, closeMakeCode };
