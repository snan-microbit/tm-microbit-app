/**
 * model-loader.js
 * Handles loading Teachable Machine models
 */

let model = null;
let maxPredictions = 0;
let modelType = null;

/**
 * Detect model type from URL
 */
function detectModelTypeFromURL(url) {
    if (url.includes('/image/')) return 'image';
    if (url.includes('/pose/')) return 'pose';
    return null;
}

/**
 * Detect model type from metadata
 */
async function detectModelTypeFromMetadata(baseURL) {
    try {
        const response = await fetch(baseURL + 'metadata.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const metadata = await response.json();
        
        if (metadata.packageVersion && metadata.packageVersion.includes('pose')) {
            return 'pose';
        }
        return 'image';
    } catch (error) {
        console.error('Error detecting model type:', error);
        throw error;
    }
}

/**
 * Load Teachable Machine model
 */
async function loadModel(modelURL) {
    // Wait for TM libraries to load
    let attempts = 0;
    while (!window.tmImage || !window.tmPose) {
        if (attempts > 50) {
            throw new Error('Las librerías de Teachable Machine no se cargaron');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    let modelPath = modelURL.endsWith('/') ? modelURL : modelURL + '/';
    
    // Detect type
    modelType = detectModelTypeFromURL(modelURL);
    if (!modelType) {
        modelType = await detectModelTypeFromMetadata(modelPath);
    }
    
    if (!modelType) {
        throw new Error('No se pudo detectar el tipo de modelo');
    }

    const metadataURL = modelPath + 'metadata.json';
    const modelJsonURL = modelPath + 'model.json';

    if (modelType === 'image') {
        model = await window.tmImage.load(modelJsonURL, metadataURL);
        maxPredictions = model.getTotalClasses();
    } else if (modelType === 'pose') {
        model = await window.tmPose.load(modelJsonURL, metadataURL);
        maxPredictions = model.getTotalClasses();
    }

    console.log(`✅ Model loaded: ${modelType}, ${maxPredictions} classes`);
    return model;
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

export { loadModel, getModel, getModelType, getMaxPredictions };