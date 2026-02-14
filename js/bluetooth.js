// bluetooth.js
// Handles Bluetooth connection with micro:bit

let microbitDevice = null;
let uartService = null;
let rxCharacteristic = null;  // Para escribir AL micro:bit
let lastSentClass = '';
let lastSentConfidence = 0;

// UART Service UUID for micro:bit
const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
// RX Characteristic - for writing TO micro:bit (from web perspective)
const UART_RX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
// TX Characteristic - for reading FROM micro:bit (not used in this app)
const UART_TX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

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
        
        // Get RX characteristic (for writing data TO micro:bit)
        rxCharacteristic = await uartService.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
        
        // Log characteristic properties for debugging
        console.log('RX Characteristic properties:', rxCharacteristic.properties);
        console.log('Can write:', rxCharacteristic.properties.write);
        console.log('Can writeWithoutResponse:', rxCharacteristic.properties.writeWithoutResponse);

        showStatus('bluetoothStatus', '✅ Conectado a ' + microbitDevice.name, 'success');
        
        // Update UI
        document.getElementById('connectBtn').style.display = 'none';
        document.getElementById('disconnectBtn').style.display = 'inline-block';
        document.getElementById('testBtn').style.display = 'inline-block';
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
    rxCharacteristic = null;
    microbitDevice = null;
    
    showStatus('bluetoothStatus', 'Desconectado', 'info');
    document.getElementById('connectBtn').style.display = 'inline-block';
    document.getElementById('disconnectBtn').style.display = 'none';
    document.getElementById('testBtn').style.display = 'none';
}

/**
 * Send data to micro:bit
 * Format: "CLASS#CONFIDENCE\n"
 */
async function sendToMicrobit(className, confidence) {
    if (!rxCharacteristic) return;
    
    const confidenceRounded = Math.round(confidence);
    
    // Only send if there's a significant change
    if (className === lastSentClass && Math.abs(confidenceRounded - lastSentConfidence) < 5) {
        return;
    }
    
    lastSentClass = className;
    lastSentConfidence = confidenceRounded;
    
    try {
        // Format: "CLASS#CONFIDENCE\n" (usando # como separador)
        const message = `${className}#${confidenceRounded}\n`;
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        
        // Logs de depuración
        console.log('📤 Enviando:', message.trim());
        console.log('📊 Bytes:', Array.from(data));
        console.log('📏 Longitud:', data.length, 'bytes');
        
        // Verificar que el mensaje no sea muy largo (máximo 20 bytes para BLE)
        if (data.length > 20) {
            console.warn('⚠️ Mensaje muy largo, truncando:', message);
            const truncated = message.substring(0, 17) + '\n';
            const truncatedData = encoder.encode(truncated);
            console.log('✂️ Truncado a:', truncated.trim(), 'Bytes:', Array.from(truncatedData));
            await rxCharacteristic.writeValueWithoutResponse(truncatedData);
        } else {
            await rxCharacteristic.writeValueWithoutResponse(data);
            console.log('✅ Mensaje enviado correctamente');
        }
        
        // Show sent message
        const messagesDiv = document.getElementById('sentMessages');
        messagesDiv.innerHTML = `
            <div class="sent-message">
                📤 Enviado: ${message.trim()} (${data.length} bytes)
            </div>
        `;
        
    } catch (error) {
        console.error('❌ Error al enviar datos:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        showStatus('bluetoothStatus', '⚠️ Error al enviar datos: ' + error.message, 'error');
    }
}

/**
 * Check if connected to micro:bit
 */
function isConnected() {
    return rxCharacteristic !== null;
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
