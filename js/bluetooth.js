/**
 * bluetooth.js
 * Simplified Bluetooth - Maximum flow only
 */

let microbitDevice = null;
let uartService = null;
let txCharacteristic = null;
let keepAliveInterval = null;
let disconnectCallback = null;

function setDisconnectCallback(fn) {
    disconnectCallback = fn;
}

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
    if (disconnectCallback) disconnectCallback();
    console.log('Disconnected');
}

/**
 * Format a prediction result as a BLE UART message.
 * Protocol: "className#confidence\n", max 20 bytes UTF-8.
 * If the encoded message exceeds 20 bytes, the class name is
 * truncated at a valid UTF-8 boundary so the total fits.
 *
 * @param {string} className - The predicted class name
 * @param {number} confidence - Confidence percentage (0-100)
 * @returns {Uint8Array} Encoded message, guaranteed ≤ 20 bytes
 */
function formatUartMessage(className, confidence) {
    const suffix = `#${Math.round(confidence)}\n`;
    const encoder = new TextEncoder();
    const suffixBytes = encoder.encode(suffix);
    const nameBytes = encoder.encode(className);

    const totalLength = nameBytes.length + suffixBytes.length;

    if (totalLength <= 20) {
        // Fast path: fits as-is
        const result = new Uint8Array(totalLength);
        result.set(nameBytes, 0);
        result.set(suffixBytes, nameBytes.length);
        return result;
    }

    // Truncate class name at byte level
    let maxNameBytes = 20 - suffixBytes.length;
    if (maxNameBytes < 0) maxNameBytes = 0;

    let truncLen = Math.min(nameBytes.length, maxNameBytes);

    // Walk back to avoid cutting a multi-byte UTF-8 sequence.
    // In UTF-8, continuation bytes have the pattern 10xxxxxx (0x80-0xBF).
    // If we land on a continuation byte, step back until we hit a leading byte.
    while (truncLen > 0 && (nameBytes[truncLen] & 0xC0) === 0x80) {
        truncLen--;
    }

    const result = new Uint8Array(truncLen + suffixBytes.length);
    result.set(nameBytes.slice(0, truncLen), 0);
    result.set(suffixBytes, truncLen);
    return result;
}

/**
 * Send data to micro:bit
 */
async function sendToMicrobit(className, confidence) {
    if (!txCharacteristic) return;

    try {
        const data = formatUartMessage(className, confidence);
        await txCharacteristic.writeValueWithoutResponse(data);
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

export { connectMicrobit, disconnectMicrobit, sendToMicrobit, isConnected, setDisconnectCallback, formatUartMessage };