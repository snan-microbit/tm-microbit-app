/**
 * app.js
 * Main application logic with model library
 */

console.log('📝 app.js loading...');

import { loadModel } from './model-loader.js';
import { connectMicrobit, disconnectMicrobit, isConnected } from './bluetooth.js';
import { startPredictions, stopPredictions } from './predictions.js';

console.log('✅ app.js modules imported');

let currentModel = null;
const MODELS_KEY = 'tm_microbit_models';

// ============================================
// MODEL LIBRARY
// ============================================

function loadModels() {
    const stored = localStorage.getItem(MODELS_KEY);
    return stored ? JSON.parse(stored) : [];
}

function saveModels(models) {
    localStorage.setItem(MODELS_KEY, JSON.stringify(models));
}

function addModel(name, url) {
    const models = loadModels();
    const newModel = {
        id: Date.now().toString(),
        name: name.trim(),
        url: url.trim(),
        createdAt: new Date().toISOString()
    };
    models.unshift(newModel);
    saveModels(models);
    return newModel;
}

function deleteModel(id) {
    const models = loadModels();
    const filtered = models.filter(m => m.id !== id);
    saveModels(filtered);
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
            <div class="model-card-url">${escapeHtml(model.url)}</div>
            <div class="model-card-date">Creado: ${formatDate(model.createdAt)}</div>
            <div class="model-card-actions">
                <button class="btn-card btn-use" data-action="use" data-id="${model.id}">
                    ▶ Usar
                </button>
                <button class="btn-card btn-delete" data-action="delete" data-id="${model.id}">
                    🗑 Eliminar
                </button>
            </div>
        </div>
    `).join('');

    modelsList.querySelectorAll('[data-action="use"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const model = models.find(m => m.id === btn.dataset.id);
            if (model) useModel(model);
        });
    });

    modelsList.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('¿Eliminar este modelo?')) {
                deleteModel(btn.dataset.id);
                renderModels();
                showToast('Modelo eliminado', 'success');
            }
        });
    });
}

async function useModel(model) {
    currentModel = model;
    showScreen('processingScreen');
    document.getElementById('modelName').textContent = model.name;
    showToast('Cargando modelo...', 'info');
    
    try {
        await loadModel(model.url);
        await startPredictions();
        showToast('Modelo cargado', 'success');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar el modelo', 'error');
        showScreen('homeScreen');
    }
}

// ============================================
// NAVIGATION
// ============================================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
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

    const model = addModel(name, url);
    hideModal();
    renderModels();
    await useModel(model);
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
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
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

// Processing
document.getElementById('backBtn').addEventListener('click', () => {
    stopPredictions();
    if (isConnected()) disconnectMicrobit();
    
    // Clean up processing screen
    const webcamWrapper = document.getElementById('webcam-wrapper');
    webcamWrapper.innerHTML = ''; // Remove webcam canvas
    
    const predictions = document.getElementById('predictions');
    predictions.innerHTML = ''; // Clear predictions
    
    // Reset buttons
    document.getElementById('connectBtn').style.display = 'inline-block';
    document.getElementById('disconnectBtn').style.display = 'none';
    document.getElementById('connectionBadge').textContent = 'Desconectado';
    document.getElementById('connectionBadge').className = 'badge badge-disconnected';
    
    showScreen('homeScreen');
});

document.getElementById('connectBtn').addEventListener('click', async () => {
    try {
        await connectMicrobit();
        document.getElementById('connectBtn').style.display = 'none';
        document.getElementById('disconnectBtn').style.display = 'inline-block';
        document.getElementById('connectionBadge').textContent = 'Conectado';
        document.getElementById('connectionBadge').className = 'badge badge-connected';
        //showToast('Conectado', 'success');
    } catch (error) {
        showToast('Error al conectar', 'error');
    }
});

document.getElementById('disconnectBtn').addEventListener('click', () => {
    disconnectMicrobit();
    document.getElementById('connectBtn').style.display = 'inline-block';
    document.getElementById('disconnectBtn').style.display = 'none';
    document.getElementById('connectionBadge').textContent = 'Desconectado';
    document.getElementById('connectionBadge').className = 'badge badge-disconnected';
    //showToast('Desconectado', 'info');
});

// ============================================
// PULL-TO-REFRESH PREVENTION
// ============================================

// Prevenir el gesto de recargar página en la pantalla de processing
let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    const processingScreen = document.getElementById('processingScreen');
    const isProcessingVisible = !processingScreen.classList.contains('hidden');
    
    if (isProcessingVisible) {
        const touchY = e.touches[0].clientY;
        const touchDelta = touchY - touchStartY;
        
        // Si el usuario está jalando hacia abajo desde la parte superior
        if (touchDelta > 0 && window.scrollY === 0) {
            e.preventDefault();
        }
    }
}, { passive: false });

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOMContentLoaded event fired');
    console.log('📦 Elements check:');
    console.log('- newModelBtn:', document.getElementById('newModelBtn'));
    console.log('- modelsList:', document.getElementById('modelsList'));
    console.log('- emptyState:', document.getElementById('emptyState'));
    
    try {
        renderModels();
        console.log('✅ Models rendered successfully');
    } catch (error) {
        console.error('❌ Error rendering models:', error);
    }
    
    console.log('✅ TM + micro:bit ready');
});

export { showToast };