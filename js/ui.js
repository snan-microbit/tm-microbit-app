// ui.js
// UI utility functions

/**
 * Show status message
 * @param {string} elementId - ID of the element to show status in
 * @param {string} message - Message to display
 * @param {string} type - Type of status: 'info', 'success', or 'error'
 */
function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    const statusClass = `status-${type}`;
    element.innerHTML = `
        <div class="status ${statusClass}">
            <span class="status-indicator"></span>
            ${message}
        </div>
    `;
}

/**
 * Clear status message
 */
function clearStatus(elementId) {
    const element = document.getElementById(elementId);
    element.innerHTML = '';
}

/**
 * Show loading state
 */
function showLoading(elementId, message = 'Cargando...') {
    showStatus(elementId, message, 'info');
}

/**
 * Enable/disable button
 */
function setButtonEnabled(buttonId, enabled) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.disabled = !enabled;
    }
}

/**
 * Show/hide element
 */
function toggleElement(elementId, show) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = show ? 'block' : 'none';
    }
}

/**
 * Get input value
 */
function getInputValue(inputId) {
    const input = document.getElementById(inputId);
    return input ? input.value.trim() : '';
}

/**
 * Set input value
 */
function setInputValue(inputId, value) {
    const input = document.getElementById(inputId);
    if (input) {
        input.value = value;
    }
}
