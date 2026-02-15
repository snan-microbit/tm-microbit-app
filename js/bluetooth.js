// bluetooth.js
// Handles Bluetooth connection with micro:bit

let microbitDevice = null;
let uartService = null;
let txCharacteristic = null;  // Para escribir AL micro:bit (TX desde perspectiva web)
let rxCharacteristic = null;  // Para leer DESDE micro:bit (RX desde perspectiva web)
let lastSentClass = '';
let lastSentConfidence = 0;
let lastSendTime = 0;
let readyToSend = true;  // Flag para control de flujo

// Configuración de flujo
let FLOW_CONTROL_ENABLED = false;  // true para Opción 2, false para Opción 1
const MIN_SEND_INTERVAL = 0;  // 0 = sin límite de velocidad

// UART Service UUID for micro:bit
const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
// TX Characteristic - for writing TO micro:bit (from web perspective) 
const UART_TX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
// RX Characteristic - for reading FROM micro:bit (from web perspective)
const UART_RX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

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
        
        // Get TX characteristic (for writing data TO micro:bit)
        txCharacteristic = await uartService.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
        
        // Get RX characteristic (for reading data FROM micro:bit) - for flow control
        try {
            rxCharacteristic = await uartService.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
            
            // Setup notification listener for flow control
            if (FLOW_CONTROL_ENABLED) {
                await rxCharacteristic.startNotifications();
                rxCharacteristic.addEventListener('characteristicvaluechanged', handleMicrobitResponse);
                console.log('✅ Control de flujo habilitado - micro:bit enviará señal de "listo"');
            }
        } catch (error) {
            console.log('ℹ️ RX characteristic no disponible - control de flujo deshabilitado');
        }
        
        // Log characteristic properties for debugging
        console.log('TX Characteristic properties:', txCharacteristic.properties);
        console.log('Can write:', txCharacteristic.properties.write);
        console.log('Can writeWithoutResponse:', txCharacteristic.properties.writeWithoutResponse);

        showStatus('bluetoothStatus', '✅ Conectado a ' + microbitDevice.name, 'success');
        
        // Update connection badge
        updateConnectionBadge(true, microbitDevice.name);
        
        // Update UI
        document.getElementById('connectBtn').style.display = 'none';
        document.getElementById('disconnectBtn').style.display = 'inline-block';
        document.getElementById('testBtn').style.display = 'inline-block';
        document.getElementById('bluetoothHelp').style.display = 'block';
        document.getElementById('flowControlSettings').style.display = 'block';

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
    rxCharacteristic = null;
    microbitDevice = null;
    
    showStatus('bluetoothStatus', 'Desconectado', 'info');
    updateConnectionBadge(false);
    
    document.getElementById('connectBtn').style.display = 'inline-block';
    document.getElementById('disconnectBtn').style.display = 'none';
    document.getElementById('testBtn').style.display = 'none';
}

/**
 * Handle responses from micro:bit (for flow control)
 */
function handleMicrobitResponse(event) {
    const value = event.target.value;
    const decoder = new TextDecoder();
    const response = decoder.decode(value);
    
    console.log('📩 Recibido de micro:bit:', response.trim());
    
    // Si el micro:bit envía "OK" o "READY", está listo para recibir
    if (response.includes('OK') || response.includes('READY')) {
        readyToSend = true;
        console.log('✅ micro:bit listo para recibir');
    }
}

/**
 * Send data to micro:bit
 * Format: "CLASS#CONFIDENCE\n"
 */
async function sendToMicrobit(className, confidence) {
    if (!txCharacteristic) return;
    
    const confidenceRounded = Math.round(confidence);
    
    // OPCIÓN 2: Control de flujo - esperar a que micro:bit esté listo
    if (FLOW_CONTROL_ENABLED && !readyToSend) {
        console.log('⏸️ Esperando a que micro:bit esté listo...');
        return;
    }
    
    // OPCIÓN 1: Sin filtros - enviar TODO sin restricciones
    // (cuando FLOW_CONTROL_ENABLED = false, envía cada frame)
    
    try {
        // Format: "CLASS#CONFIDENCE\n" (usando # como separador)
        const message = `${className}#${confidenceRounded}\n`;
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        
        // Logs de depuración (comentar si es mucho)
        // console.log('📤 Enviando:', message.trim());
        
        // Verificar que el mensaje no sea muy largo (máximo 20 bytes para BLE)
        if (data.length > 20) {
            console.warn('⚠️ Mensaje muy largo, truncando:', message);
            const truncated = message.substring(0, 17) + '\n';
            const truncatedData = encoder.encode(truncated);
            await txCharacteristic.writeValueWithoutResponse(truncatedData);
        } else {
            await txCharacteristic.writeValueWithoutResponse(data);
        }
        
        // Si está habilitado el control de flujo, marcar como no listo
        if (FLOW_CONTROL_ENABLED) {
            readyToSend = false;
        }
        
        // Actualizar UI (throttle esto para no saturar el DOM)
        const now = Date.now();
        if (now - lastSendTime > 100) {  // Actualizar UI máximo cada 100ms
            const messagesDiv = document.getElementById('sentMessages');
            if (messagesDiv) {
                messagesDiv.innerHTML = `
                    <div class="sent-message">
                        📤 Enviado: ${message.trim()} (${data.length} bytes)
                    </div>
                `;
            }
            lastSendTime = now;
        }
        
    } catch (error) {
        console.error('❌ Error al enviar datos:', error);
        showStatus('bluetoothStatus', '⚠️ Error al enviar datos: ' + error.message, 'error');
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

/**
 * Update connection badge in UI
 */
function updateConnectionBadge(connected, deviceName = null) {
    const badge = document.getElementById('connectionStatusBadge');
    if (!badge) return;
    
    if (connected) {
        badge.className = 'status-badge connected';
        badge.textContent = deviceName ? `Conectado: ${deviceName}` : 'Conectado';
    } else {
        badge.className = 'status-badge disconnected';
        badge.textContent = 'Desconectado';
    }
}

/**
 * Set flow control mode
 * @param {boolean} enabled - true para modo controlado, false para flujo máximo
 */
function setFlowControlMode(enabled) {
    FLOW_CONTROL_ENABLED = enabled;
    readyToSend = true;  // Reset flag
    
    if (enabled) {
        console.log('🤝 Control de flujo habilitado');
        console.log('ℹ️ micro:bit debe enviar "OK" o "READY" después de procesar cada mensaje');
    } else {
        console.log('🚀 Flujo máximo habilitado');
        console.log('ℹ️ Se enviarán todos los frames sin esperar confirmación');
    }
}
