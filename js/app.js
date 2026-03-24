/**
 * app.js
 * Main application logic
 */

import { loadModel, getModelType, getClassNames, extractClassNames } from './model-loader.js';
import { connectMicrobit, disconnectMicrobit, setDisconnectCallback } from './bluetooth.js';
import { startPredictions, stopPredictions, flipCamera } from './predictions.js';
import { openMakeCode, closeMakeCode } from './makecode-embed.js';

let currentModel = null;
const MODELS_KEY = 'tm_microbit_models';

function resetConnectionUI() {
    document.getElementById('connectBtn').style.display = 'block';
    document.getElementById('disconnectBtn').style.display = 'none';
    document.getElementById('connectionBadge').textContent = 'Desconectado';
    document.getElementById('connectionBadge').className = 'badge badge-disconnected';
}
setDisconnectCallback(resetConnectionUI);

// ============================================
// PROJECT LIBRARY
// ============================================

function loadModels() {
    const stored = localStorage.getItem(MODELS_KEY);
    return stored ? JSON.parse(stored) : [];
}

function saveModels(models) {
    localStorage.setItem(MODELS_KEY, JSON.stringify(models));
}

function addProject(name, url, classNames) {
    const models = loadModels();
    const newModel = {
        id: Date.now().toString(),
        name: name.trim(),
        url: url.trim(),
        classNames,
        makecodeProject: null,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
    };
    models.unshift(newModel);
    saveModels(models);
    return newModel;
}

function deleteModel(id) {
    const models = loadModels();
    saveModels(models.filter(m => m.id !== id));
}

function updateProjectMakeCode(id, makecodeProject) {
    const models = loadModels();
    const model = models.find(m => m.id === id);
    if (model) {
        model.makecodeProject = makecodeProject;
        model.lastUsed = new Date().toISOString();
        saveModels(models);
    }
}

function renderModels() {
    const models = loadModels();
    const modelsList = document.getElementById('modelsList');
    const emptyState = document.getElementById('emptyState');

    if (models.length === 0) {
        modelsList.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    modelsList.innerHTML = models.map(model => `
        <div class="model-card">
            <div class="model-card-title">${escapeHtml(model.name)}</div>
            ${model.classNames ? `<div class="model-card-classes">${model.classNames.map(c => escapeHtml(c)).join(' · ')}</div>` : ''}
            <div class="model-card-date">Creado: ${formatDate(model.createdAt)}</div>
            <div class="model-card-actions">
                <button class="btn-card btn-use" data-action="open" data-id="${model.id}">
                    Abrir
                </button>
                <button class="btn-card btn-delete" data-action="delete" data-id="${model.id}">
                    🗑 Eliminar
                </button>
            </div>
        </div>
    `).join('');

    modelsList.querySelectorAll('[data-action="open"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const model = models.find(m => m.id === btn.dataset.id);
            if (model) showOpenProjectModal(model);
        });
    });

    modelsList.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('¿Eliminar este proyecto?')) {
                deleteModel(btn.dataset.id);
                renderModels();
                showToast('Proyecto eliminado', 'success');
            }
        });
    });
}

// ============================================
// NAVIGATION & FLOWS
// ============================================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

function openMakeCodeForModel(model) {
    stopPredictions();
    disconnectMicrobit();
    openMakeCode(
        model.classNames || getClassNames(),
        model.makecodeProject || null,
        (proj) => {
            updateProjectMakeCode(model.id, proj);
            // Keep in-memory reference in sync so re-opening loads the saved project
            if (currentModel && currentModel.id === model.id) {
                currentModel.makecodeProject = proj;
            }
        },
        model.name
    );
    showScreen('makecodeScreen');
}

let selectedProject = null;

function showOpenProjectModal(model) {
    selectedProject = model;
    document.getElementById('openProjectTitle').textContent = model.name;
    document.getElementById('openProjectModal').classList.remove('hidden');
}

function hideOpenProjectModal() {
    document.getElementById('openProjectModal').classList.add('hidden');
    selectedProject = null;
}

async function goToExecution() {
    closeMakeCode();
    resetConnectionUI();
    showScreen('processingScreen');
    document.getElementById('modelName').textContent = currentModel.name;
    showToast('Cargando modelo...', 'info');

    try {
        await loadModel(currentModel.url);
        await startPredictions();
        showToast('Modelo cargado', 'success');

        const modelType = getModelType();
        const flipBtn = document.getElementById('flipCameraBtn');
        if (modelType === 'image' || modelType === 'pose') {
            flipBtn.classList.remove('hidden');
        } else {
            flipBtn.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar el modelo', 'error');
        showScreen('homeScreen');
    }
}

// ============================================
// MODAL
// ============================================

function showNewModelModal() {
    document.getElementById('newModelModal').classList.remove('hidden');
    document.getElementById('modelNameInput').value = '';
    document.getElementById('modelUrlInput').value = '';
    document.getElementById('modelNameInput').focus();
}

function hideModal() {
    document.getElementById('newModelModal').classList.add('hidden');
}

async function saveNewModel() {
    const name = document.getElementById('modelNameInput').value.trim();
    const url = document.getElementById('modelUrlInput').value.trim();

    if (!name) {
        showToast('Ingresa un nombre', 'error');
        return;
    }

    if (!url || !url.includes('teachablemachine.withgoogle.com')) {
        showToast('URL inválida', 'error');
        return;
    }

    hideModal();
    showToast('Leyendo modelo...', 'info');

    try {
        const classNames = await extractClassNames(url);
        const model = addProject(name, url, classNames);
        currentModel = model;
        renderModels();
        openMakeCodeForModel(model);
    } catch (error) {
        console.error('Error extracting classes:', error);
        showToast('Error al leer el modelo', 'error');
    }
}

// ============================================
// UTILITIES
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const days = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 7) return `Hace ${days} días`;

    return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('statusToast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================
// EVENT LISTENERS
// ============================================

// Home
document.getElementById('newModelBtn').addEventListener('click', showNewModelModal);

// Modal
document.getElementById('closeModalBtn').addEventListener('click', hideModal);
document.getElementById('cancelModalBtn').addEventListener('click', hideModal);
document.getElementById('saveModelBtn').addEventListener('click', saveNewModel);
document.getElementById('modelUrlInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveNewModel();
});

// Open project modal
document.getElementById('closeOpenProjectBtn').addEventListener('click', hideOpenProjectModal);

document.getElementById('editCodeBtn').addEventListener('click', () => {
    const model = selectedProject;
    hideOpenProjectModal();
    currentModel = model;
    openMakeCodeForModel(model);
});

document.getElementById('runProjectBtn').addEventListener('click', () => {
    const model = selectedProject;
    hideOpenProjectModal();
    currentModel = model;
    goToExecution();
});

// MakeCode screen
document.getElementById('runModelBtn').addEventListener('click', () => {
    goToExecution();
});

document.getElementById('homeFromMakecodeBtn').addEventListener('click', () => {
    closeMakeCode();
    showScreen('homeScreen');
});

// Processing screen
document.getElementById('backBtn').addEventListener('click', () => {
    stopPredictions();
    disconnectMicrobit();

    document.getElementById('webcam-wrapper').innerHTML = '';
    document.getElementById('predictions').innerHTML = '';
    document.getElementById('flipCameraBtn').classList.add('hidden');

    showScreen('homeScreen');
});

document.getElementById('flipCameraBtn').addEventListener('click', async () => {
    const success = await flipCamera();
    if (!success) showToast('No hay cámara trasera disponible', 'error');
});

document.getElementById('connectBtn').addEventListener('click', async () => {
    document.getElementById('connectionBadge').textContent = 'Conectando...';
    document.getElementById('connectionBadge').className = 'badge badge-connecting';

    try {
        await connectMicrobit();
        document.getElementById('connectBtn').style.display = 'none';
        document.getElementById('disconnectBtn').style.display = 'block';
        document.getElementById('connectionBadge').textContent = 'Conectado';
        document.getElementById('connectionBadge').className = 'badge badge-connected';
    } catch (error) {
        document.getElementById('connectionBadge').textContent = 'Desconectado';
        document.getElementById('connectionBadge').className = 'badge badge-disconnected';
        showToast('Error al conectar', 'error');
    }
});

document.getElementById('disconnectBtn').addEventListener('click', () => {
    disconnectMicrobit();
});

document.getElementById('openMakecodeBtn').addEventListener('click', () => {
    openMakeCodeForModel(currentModel);
});

// ============================================
// PULL-TO-REFRESH PREVENTION
// ============================================

let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    const processingScreen = document.getElementById('processingScreen');
    if (!processingScreen.classList.contains('hidden')) {
        const touchDelta = e.touches[0].clientY - touchStartY;
        if (touchDelta > 0 && window.scrollY === 0) e.preventDefault();
    }
}, { passive: false });

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    renderModels();
});

export { showToast };
