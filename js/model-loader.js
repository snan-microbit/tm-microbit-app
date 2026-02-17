/**
 * model-loader.js
 * Loads and detects Teachable Machine models (image, pose, audio)
 */

let model = null;
let maxPredictions = 0;
let modelType = null;

/**
 * Detect model type from URL pattern
 */
function detectModelTypeFromURL(url) {
    if (url.includes('/image/')) return 'image';
    if (url.includes('/pose/')) return 'pose';
    if (url.includes('/audio/')) return 'audio';
    return null;
}

/**
 * Detect model type from metadata.json
 */
async function detectModelTypeFromMetadata(baseURL) {
    try {
        const response = await fetch(baseURL + 'metadata.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const metadata = await response.json();
        
        // Check for audio-specific fields
        if (metadata.tmSoundModelVersion || metadata.audioSampleRate || metadata.wordLabels) {
            return 'audio';
        }
        
        // Check packageVersion
        if (metadata.packageVersion) {
            if (metadata.packageVersion.includes('pose')) return 'pose';
            if (metadata.packageVersion.includes('audio')) return 'audio';
        }
        
        // Check model name
        if (metadata.modelName === 'audioModel') {
            return 'audio';
        }
        
        // Fallback: check input shape in model.json
        try {
            const modelResponse = await fetch(baseURL + 'model.json');
            if (modelResponse.ok) {
                const modelJson = await modelResponse.json();
                const inputShape = modelJson.modelTopology?.config?.layers?.[0]?.config?.batch_input_shape;
                
                if (inputShape && inputShape.length === 4) {
                    const [, height, width, channels] = inputShape;
                    
                    // Audio: channels=1, non-standard dimensions
                    if (channels === 1 && (height !== 224 || width !== 224)) {
                        return 'audio';
                    }
                }
            }
        } catch (e) {
            console.warn('Could not analyze model.json:', e);
        }
        
        return 'image'; // Default to image
    } catch (error) {
        console.error('Error detecting model type:', error);
        throw error;
    }
}

/**
 * Load Teachable Machine model from URL
 */
async function loadModel(modelURL) {
    // Wait for TM libraries
    let attempts = 0;
    while (!window.tmImage || !window.tmPose) {
        if (attempts > 50) {
            throw new Error('Teachable Machine libraries did not load');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    const modelPath = modelURL.endsWith('/') ? modelURL : modelURL + '/';
    
    // Detect model type
    modelType = detectModelTypeFromURL(modelURL);
    if (!modelType) {
        modelType = await detectModelTypeFromMetadata(modelPath);
    }
    
    if (!modelType) {
        throw new Error('Could not detect model type');
    }
    
    const modelJsonURL = modelPath + 'model.json';
    const metadataURL = modelPath + 'metadata.json';
    
    // Load model based on type
    if (modelType === 'image') {
        model = await window.tmImage.load(modelJsonURL, metadataURL);
        maxPredictions = model.getTotalClasses();
    } else if (modelType === 'pose') {
        model = await window.tmPose.load(modelJsonURL, metadataURL);
        maxPredictions = model.getTotalClasses();
    } else if (modelType === 'audio') {
        // Wait for speech-commands library
        attempts = 0;
        while (!window.speechCommands) {
            if (attempts > 100) {
                throw new Error('Speech Commands library did not load');
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        model = window.speechCommands.create(
            'BROWSER_FFT',
            undefined,
            modelPath + 'model.json',
            modelPath + 'metadata.json'
        );
        
        await model.ensureModelLoaded();
        maxPredictions = model.wordLabels().length;
    }
    
    console.log(`✅ Model loaded: ${modelType}, ${maxPredictions} classes`);
    return model;
}

/**
 * Get current loaded model
 */
function getModel() {
    return model;
}

/**
 * Get model type (image, pose, or audio)
 */
function getModelType() {
    return modelType;
}

/**
 * Get maximum number of prediction classes
 */
function getMaxPredictions() {
    return maxPredictions;
}

export { loadModel, getModel, getModelType, getMaxPredictions };
