/**
 * protocol.js
 * Pure UART protocol logic for the micro:bit BLE UART service.
 * No browser APIs beyond TextEncoder (also global in Node), no side
 * effects: safe to import from Node tests.
 */

// BLE UART writes are limited to 20 bytes per message.
export const UART_MAX_BYTES = 20;

/**
 * Format a prediction result as a BLE UART message.
 * Protocol: "className#confidence\n", max UART_MAX_BYTES bytes UTF-8.
 * If the encoded message exceeds the limit, the class name is
 * truncated at a valid UTF-8 boundary so the total fits.
 *
 * @param {string} className - The predicted class name
 * @param {number} confidence - Confidence percentage (0-100)
 * @returns {Uint8Array} Encoded message, guaranteed ≤ UART_MAX_BYTES bytes
 */
export function formatUartMessage(className, confidence) {
    const suffix = `#${Math.round(confidence)}\n`;
    const encoder = new TextEncoder();
    const suffixBytes = encoder.encode(suffix);
    const nameBytes = encoder.encode(className);

    const totalLength = nameBytes.length + suffixBytes.length;

    if (totalLength <= UART_MAX_BYTES) {
        // Fast path: fits as-is
        const result = new Uint8Array(totalLength);
        result.set(nameBytes, 0);
        result.set(suffixBytes, nameBytes.length);
        return result;
    }

    // Truncate class name at byte level
    let maxNameBytes = UART_MAX_BYTES - suffixBytes.length;
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
