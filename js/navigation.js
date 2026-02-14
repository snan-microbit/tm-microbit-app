// navigation.js
// Handles navigation between screens

const SCREENS = {
    HOME: 'screen-home',
    PROCESSING: 'screen-processing'
};

let currentScreen = SCREENS.HOME;

/**
 * Navigate to a specific screen
 */
function navigateTo(screenId) {
    // Hide all screens
    Object.values(SCREENS).forEach(screen => {
        const element = document.getElementById(screen);
        if (element) {
            element.classList.remove('active');
        }
    });
    
    // Show target screen
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
        currentScreen = screenId;
        
        // Trigger screen-specific setup
        onScreenEnter(screenId);
    }
}

/**
 * Handle screen enter events
 */
function onScreenEnter(screenId) {
    if (screenId === SCREENS.PROCESSING) {
        // Update model info in compact header
        updateCompactModelInfo();
        
        // Start predictions if webcam is ready
        if (webcam && !isPredicting()) {
            startPredicting();
        }
    }
}

/**
 * Update compact model info display
 */
function updateCompactModelInfo() {
    const info = document.getElementById('modelInfoCompact');
    if (info) {
        const modelTypeText = getModelType();
        const predictions = getMaxPredictions();
        
        info.innerHTML = `
            <strong>Modelo:</strong> ${modelTypeText} | 
            <strong>Clases:</strong> ${predictions}
        `;
    }
}

/**
 * Go to home screen
 */
function goHome() {
    // Stop predictions
    if (typeof stopPredictions === 'function') {
        stopPredictions();
    }
    
    // Disconnect Bluetooth
    if (typeof disconnectMicrobit === 'function') {
        disconnectMicrobit();
    }
    
    // Navigate
    navigateTo(SCREENS.HOME);
}

/**
 * Go to processing screen
 */
function goToProcessing() {
    navigateTo(SCREENS.PROCESSING);
}

/**
 * Get current screen
 */
function getCurrentScreen() {
    return currentScreen;
}
