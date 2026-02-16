/**
 * bluetooth.js
 * Simplified Bluetooth - Maximum flow only
 */

let microbitDevice = null;
let uartService = null;
let txCharacteristic = null;
let keepAliveInterval = null;

const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const KEEP_ALIVE_INTERVAL = 120000; // 2 minutes

/**
 * Connect to micro:bit
 */
async function connectMicrobit() {
    try {
        microbitDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'BBC micro:bit' }],
            optionalServices: [UART_SERVICE_UUID]
        });

        const server = await microbitDevice.gatt.connect();
        uartService = await server.getPrimaryService(UART_SERVICE_UUID);
        txCharacteristic = await uartService.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
        
        console.log('✅ Connected to:', microbitDevice.name);
        
        startKeepAlive();
        microbitDevice.addEventListener('gattserverdisconnected', onDisconnected);
        
        return true;
    } catch (error) {
        console.error('❌ Bluetooth error:', error);
        throw error;
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
 * Handle disconnection
 */
function onDisconnected() {
    uartService = null;
    txCharacteristic = null;
    microbitDevice = null;
    stopKeepAlive();
    console.log('Disconnected');
}

/**
 * Send data to micro:bit
 */
async function sendToMicrobit(className, confidence) {
    if (!txCharacteristic) return;
    
    try {
        const message = `${className}#${Math.round(confidence)}\n`;
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        
        if (data.length > 20) {
            const truncated = message.substring(0, 17) + '\n';
            await txCharacteristic.writeValueWithoutResponse(encoder.encode(truncated));
        } else {
            await txCharacteristic.writeValueWithoutResponse(data);
        }
    } catch (error) {
        console.error('❌ Send error:', error);
    }
}

/**
 * Check if connected
 */
function isConnected() {
    return txCharacteristic !== null && microbitDevice?.gatt?.connected;
}

/**
 * Keep-alive heartbeat
 */
function startKeepAlive() {
    stopKeepAlive();
    console.log('💓 Keep-alive started');
    
    keepAliveInterval = setInterval(() => {
        if (txCharacteristic && microbitDevice?.gatt?.connected) {
            const encoder = new TextEncoder();
            txCharacteristic.writeValueWithoutResponse(encoder.encode('\n'))
                .catch(err => console.warn('⚠️ Ping failed:', err));
        } else {
            stopKeepAlive();
        }
    }, KEEP_ALIVE_INTERVAL);
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

export { connectMicrobit, disconnectMicrobit, sendToMicrobit, isConnected };
