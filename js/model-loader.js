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
    if (url.includes('/audio/')) return 'audio';
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
        
        console.log('📋 Metadata:', metadata);
        
        // Detectar por tfjsVersion (modelos de audio usan una versión específica)
        if (metadata.tfjsVersion) {
            // Audio models have specific input shape
            if (metadata.tmSoundModelVersion || metadata.audioSampleRate) {
                console.log('✅ Detectado como audio por tmSoundModelVersion/audioSampleRate');
                return 'audio';
            }
        }
        
        // Detectar por packageVersion
        if (metadata.packageVersion) {
            if (metadata.packageVersion.includes('pose')) {
                console.log('✅ Detectado como pose por packageVersion');
                return 'pose';
            }
            if (metadata.packageVersion.includes('audio')) {
                console.log('✅ Detectado como audio por packageVersion');
                return 'audio';
            }
        }
        
        // Detectar por labels específicos o estructura del modelo
        if (metadata.modelName === 'audioModel' || metadata.wordLabels) {
            console.log('✅ Detectado como audio por modelName/wordLabels');
            return 'audio';
        }
        
        // Intentar detectar por la estructura del model.json
        try {
            const modelResponse = await fetch(baseURL + 'model.json');
            if (modelResponse.ok) {
                const modelJson = await modelResponse.json();
                console.log('📋 Model.json:', modelJson);
                
                // Audio models typically have specific input shapes
                if (modelJson.modelTopology && modelJson.modelTopology.config) {
                    const inputShape = modelJson.modelTopology.config.layers?.[0]?.config?.batch_input_shape;
                    console.log('🔍 Input shape:', inputShape);
                    
                    // Audio models have shape like [null, 43, 232, 1] or similar
                    // Image models have shape like [null, 224, 224, 3]
                    if (inputShape && inputShape.length === 4) {
                        const channels = inputShape[3];
                        const height = inputShape[1];
                        const width = inputShape[2];
                        
                        // Si los canales son 1 y las dimensiones no son típicas de imagen (224x224)
                        if (channels === 1 && (height !== 224 || width !== 224)) {
                            console.log('✅ Detectado como audio por input shape');
                            return 'audio';
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('No se pudo analizar model.json:', e);
        }
        
        // Por defecto es imagen
        console.log('⚠️ Asumiendo imagen por defecto');
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
    
    console.log('🔍 Tipo de modelo detectado:', modelType);
    
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
    } else if (modelType === 'audio') {
        // Wait for speech-commands library with extended timeout
        console.log('⏳ Esperando librería de audio...');
        let audioAttempts = 0;
        while (!window.speechCommands) {
            if (audioAttempts > 100) {
                console.error('❌ window.speechCommands no está disponible');
                console.log('🔍 Variables disponibles:', Object.keys(window).filter(k => k.toLowerCase().includes('speech') || k.toLowerCase().includes('audio') || k.includes('tm')));
                throw new Error('La librería speech-commands no se cargó. Asegúrate de tener conexión a internet.');
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            audioAttempts++;
        }
        
        console.log('✅ Librería speech-commands cargada');
        
        // Create audio recognizer
        // The baseURL should be the directory containing model.json and metadata.json
        const recognizer = window.speechCommands.create(
            'BROWSER_FFT',
            undefined,
            modelPath + 'model.json',
            modelPath + 'metadata.json'
        );
        
        console.log('⏳ Cargando modelo de audio...');
        await recognizer.ensureModelLoaded();
        
        model = recognizer;
        maxPredictions = model.wordLabels().length;
        
        console.log('✅ Modelo de audio cargado, clases:', model.wordLabels());
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