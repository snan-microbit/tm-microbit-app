// bluetooth.js
// Handles Bluetooth connection with micro:bit

let microbitDevice = null;
let uartService = null;
let txCharacteristic = null;
let lastSentClass = '';
let lastSentConfidence = 0;

// UART Service UUID for micro:bit
const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

/**
 * Connect to micro:bit via Bluetooth
 */
async function connectMicrobit() {
    try {
        showStatus('bluetoothStatus', 'Buscando micro:bit...', 'info');
        
        // Request Bluetooth device
        microbitDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'BBC micro:bit' }],
            optionalServices: [UART_SERVICE_UUID]
        });

        // Connect to GATT server
        const server = await microbitDevice.gatt.connect();
        
        // Get UART service
        uartService = await server.getPrimaryService(UART_SERVICE_UUID);
        
        // Get TX characteristic (for writing data)
        txCharacteristic = await uartService.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);

        showStatus('bluetoothStatus', '✅ Conectado a ' + microbitDevice.name, 'success');
        
        // Update UI
        document.getElementById('connectBtn').style.display = 'none';
        document.getElementById('disconnectBtn').style.display = 'inline-block';
        document.getElementById('bluetoothHelp').style.display = 'block';

        // Handle disconnection
        microbitDevice.addEventListener('gattserverdisconnected', onDisconnected);

    } catch (error) {
        console.error('Error de Bluetooth:', error);
        let errorMsg = 'Error al conectar';
        
        if (error.name === 'NotFoundError') {
            errorMsg = 'No se encontró ningún micro:bit. Asegúrate de que esté encendido y cerca.';
        } else if (error.name === 'SecurityError') {
            errorMsg = 'Error de seguridad. Asegúrate de estar usando HTTPS.';
        } else {
            errorMsg = 'Error al conectar: ' + error.message;
        }
        
        showStatus('bluetoothStatus', errorMsg, 'error');
    }
}

/**
 * Disconnect from micro:bit
 */
function disconnectMicrobit() {
    if (microbitDevice && microbitDevice.gatt.connected) {
        microbitDevice.gatt.disconnect();
    }
    onDisconnected();
}

/**
 * Handle disconnection event
 */
function onDisconnected() {
    uartService = null;
    txCharacteristic = null;
    microbitDevice = null;
    
    showStatus('bluetoothStatus', 'Desconectado', 'info');
    document.getElementById('connectBtn').style.display = 'inline-block';
    document.getElementById('disconnectBtn').style.display = 'none';
}

/**
 * Send data to micro:bit
 * Format: "CLASS:CONFIDENCE\n"
 */
async function sendToMicrobit(className, confidence) {
    if (!txCharacteristic) return;
    
    const confidenceRounded = Math.round(confidence);
    
    // Only send if there's a significant change
    if (className === lastSentClass && Math.abs(confidenceRounded - lastSentConfidence) < 5) {
        return;
    }
    
    lastSentClass = className;
    lastSentConfidence = confidenceRounded;
    
    try {
        // Format: "CLASS:CONFIDENCE\n"
        const message = `${className}:${confidenceRounded}\n`;
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        
        await txCharacteristic.writeValue(data);
        
        // Show sent message
        const messagesDiv = document.getElementById('sentMessages');
        messagesDiv.innerHTML = `
            <div class="sent-message">
                📤 Enviado: ${message.trim()}
            </div>
        `;
        
    } catch (error) {
        console.error('Error al enviar datos:', error);
        showStatus('bluetoothStatus', '⚠️ Error al enviar datos', 'error');
    }
}

/**
 * Check if connected to micro:bit
 */
function isConnected() {
    return txCharacteristic !== null;
}

/**
 * Get connection status
 */
function getConnectionStatus() {
    return {
        connected: isConnected(),
        deviceName: microbitDevice ? microbitDevice.name : null
    };
}
