// app.js
// Main application initialization and event handlers

/**
 * Initialize the application
 */
function init() {
    console.log('Teachable Machine + micro:bit - Initialized');
    
    // Setup event listeners
    setupEventListeners();
    
    // Check for Bluetooth support
    checkBluetoothSupport();
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.log('Service Worker registration failed', err));
    }
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Load model button
    const loadModelBtn = document.getElementById('loadModelBtn');
    if (loadModelBtn) {
        loadModelBtn.addEventListener('click', loadModel);
    }
    
    // Connect micro:bit button
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
        connectBtn.addEventListener('click', connectMicrobit);
    }
    
    // Disconnect micro:bit button
    const disconnectBtn = document.getElementById('disconnectBtn');
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', disconnectMicrobit);
    }
    
    // Allow Enter key to load model
    const modelURLInput = document.getElementById('modelURL');
    if (modelURLInput) {
        modelURLInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                loadModel();
            }
        });
    }
}

/**
 * Check if Bluetooth is supported
 */
function checkBluetoothSupport() {
    if (!navigator.bluetooth) {
        console.warn('Web Bluetooth API not supported');
        showStatus('bluetoothStatus', 
            '⚠️ Tu navegador no soporta Bluetooth Web. Usa Chrome o Edge en escritorio.', 
            'error'
        );
    }
}

/**
 * Cleanup on page unload
 */
function cleanup() {
    console.log('Cleaning up...');
    
    // Stop predictions
    if (typeof stopPredictions === 'function') {
        stopPredictions();
    }
    
    // Disconnect Bluetooth
    if (typeof disconnectMicrobit === 'function') {
        disconnectMicrobit();
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);
