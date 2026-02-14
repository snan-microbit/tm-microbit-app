// model-loader.js
// Handles loading and detecting Teachable Machine models

let model = null;
let maxPredictions = 0;
let modelType = null;

/**
 * Detect model type from URL pattern
 */
function detectModelTypeFromURL(url) {
    if (url.includes('/image/')) return 'image';
    if (url.includes('/audio/')) return 'audio';
    if (url.includes('/pose/')) return 'pose';
    return null;
}

/**
 * Detect model type from metadata.json
 */
async function detectModelTypeFromMetadata(baseURL) {
    try {
        const metadataURL = baseURL + 'metadata.json';
        console.log('Intentando cargar metadata desde:', metadataURL);
        
        const response = await fetch(metadataURL);
        
        if (!response.ok) {
            console.error('Error HTTP:', response.status, response.statusText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const metadata = await response.json();
        console.log('Metadata cargada:', metadata);
        
        // Detect type from metadata structure
        if (metadata.tfjsVersion) {
            if (metadata.packageVersion && metadata.packageVersion.includes('pose')) {
                return 'pose';
            }
            return 'image';
        }
        return null;
    } catch (error) {
        console.error('Error detectando tipo desde metadata:', error);
        throw error;
    }
}

/**
 * Load Teachable Machine model
 */
async function loadModel() {
    const modelURL = document.getElementById('modelURL').value.trim();
    
    if (!modelURL) {
        showStatus('modelStatus', 'Por favor ingresa una URL válida', 'error');
        return;
    }

    showStatus('modelStatus', 'Detectando tipo de modelo...', 'info');

    // Normalize URL
    let modelPath = modelURL.endsWith('/') ? modelURL : modelURL + '/';
    
    // Try to detect from URL first
    modelType = detectModelTypeFromURL(modelURL);
    
    // If not detected, try from metadata
    if (!modelType) {
        try {
            modelType = await detectModelTypeFromMetadata(modelPath);
        } catch (metadataError) {
            showStatus('modelStatus', `❌ Error al acceder al modelo: ${metadataError.message}. Verifica que el modelo esté exportado y publicado correctamente.`, 'error');
            return;
        }
    }
    
    if (!modelType) {
        showStatus('modelStatus', 'No se pudo detectar el tipo de modelo. Asegúrate de haber exportado el modelo usando "Upload my model" en Teachable Machine.', 'error');
        return;
    }

    showStatus('modelStatus', `Cargando modelo de ${modelType}...`, 'info');

    try {
        const metadataURL = modelPath + 'metadata.json';
        const modelJsonURL = modelPath + 'model.json';

        if (modelType === 'image') {
            model = await tmImage.load(modelJsonURL, metadataURL);
            maxPredictions = model.getTotalClasses();
            await setupWebcam();
        } else if (modelType === 'pose') {
            model = await tmPose.load(modelJsonURL, metadataURL);
            maxPredictions = model.getTotalClasses();
            await setupPoseWebcam();
        } else if (modelType === 'audio') {
            showStatus('modelStatus', 'Los modelos de audio requieren implementación adicional', 'error');
            return;
        }

        showStatus('modelStatus', `✅ Modelo de ${modelType} cargado correctamente`, 'success');
        showModelInfo();
        
        // Navegar automáticamente a la pantalla de procesamiento
        setTimeout(() => {
            goToProcessing();
        }, 800);
        
    } catch (error) {
        console.error('Error al cargar el modelo:', error);
        showStatus('modelStatus', 'Error al cargar el modelo. Verifica que la URL sea correcta y que el modelo esté publicado.', 'error');
    }
}

/**
 * Display model information
 */
function showModelInfo() {
    const info = document.getElementById('modelInfo');
    info.innerHTML = `
        <div class="model-info">
            <h3>📊 Información del modelo</h3>
            <p><strong>Tipo:</strong> ${modelType}</p>
            <p><strong>Clases:</strong> ${maxPredictions}</p>
        </div>
    `;
}

/**
 * Get current model
 */
function getModel() {
    return model;
}

/**
 * Get model type
 */
function getModelType() {
    return modelType;
}

/**
 * Get max predictions
 */
function getMaxPredictions() {
    return maxPredictions;
}
