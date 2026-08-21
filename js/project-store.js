/**
 * project-store.js
 * Project persistence — CRUD operations on localStorage
 */

import { MODELS_KEY, corruptBackupKey } from './storage-keys.js';

export function loadModels() {
    const stored = localStorage.getItem(MODELS_KEY);
    if (!stored) return [];

    let parsed;
    try {
        parsed = JSON.parse(stored);
    } catch (e) {
        console.error('[project-store] localStorage corrupto, no se pudo parsear:', e);
        preserveCorruptData(stored);
        return [];
    }

    // JSON.parse('"foo"') o JSON.parse('123') no lanzan error pero no son arrays.
    if (!Array.isArray(parsed)) {
        console.error('[project-store] Formato inesperado, se esperaba un array.');
        preserveCorruptData(stored);
        return [];
    }

    return parsed;
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

export async function deleteProject(id, trainerModules) {
    const models = loadModels();
    const project = models.find(m => m.id === id);

    if (project?.localModel?.storageKey) {
        const { trainer, audioTrainer, poseTrainer } = trainerModules;
        if (project.localModel.source === 'local-audio') {
            await audioTrainer.deleteModel(project.localModel.storageKey);
            await audioTrainer.deleteSamplesDB(id);
        } else if (project.localModel.source === 'local-pose') {
            await poseTrainer.deleteModel(project.localModel.storageKey);
            await poseTrainer.deleteSamplesDB(id);
        } else {
            await trainer.deleteModel(project.localModel.storageKey);
            await trainer.deleteSamplesDB(id);
        }
    }

    saveModels(models.filter(m => m.id !== id));
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
