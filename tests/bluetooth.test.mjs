import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatUartMessage } from '../js/bluetooth.js';

// Helper: decode Uint8Array to string for readable assertions
const decode = (bytes) => new TextDecoder().decode(bytes);

describe('formatUartMessage', () => {

    // — Format ————————————————————————————————————————————

    it('produces className#confidence with newline', () => {
        const result = formatUartMessage('Gato', 95);
        assert.equal(decode(result), 'Gato#95\n');
    });

    it('rounds confidence to integer', () => {
        const result = formatUartMessage('Perro', 87.6);
        assert.equal(decode(result), 'Perro#88\n');
    });

    it('handles confidence 0', () => {
        const result = formatUartMessage('Nada', 0);
        assert.equal(decode(result), 'Nada#0\n');
    });

    it('handles confidence 100', () => {
        const result = formatUartMessage('Sí', 100);
        assert.equal(decode(result), 'Sí#100\n');
    });

    it('handles confidence with .5 rounding', () => {
        // Math.round(0.5) === 1
        const result = formatUartMessage('A', 0.5);
        assert.equal(decode(result), 'A#1\n');
    });

    // — Size limit ————————————————————————————————————————

    it('never exceeds 20 bytes', () => {
        const result = formatUartMessage('NombreMuyLargoDeClaseQueNoDebePasar', 100);
        assert.ok(result.length <= 20, `Got ${result.length} bytes, expected ≤ 20`);
    });

    it('exactly 20 bytes passes through without truncation', () => {
        // "AbcdeAbcdeAbcde#100\n" = 15 + 5 = 20 bytes
        const result = formatUartMessage('AbcdeAbcdeAbcde', 100);
        assert.equal(result.length, 20);
        assert.equal(decode(result), 'AbcdeAbcdeAbcde#100\n');
    });

    it('preserves newline terminator even when truncated', () => {
        const result = formatUartMessage('NombreMuyLargoQueSeVaATruncar', 95);
        const text = decode(result);
        assert.ok(text.endsWith('\n'), `Message should end with newline: "${text}"`);
    });

    it('preserves #confidence suffix when truncated', () => {
        const result = formatUartMessage('NombreMuyLargoQueSeVaATruncar', 95);
        const text = decode(result);
        assert.ok(text.includes('#95\n'), `Message should contain #95\\n: "${text}"`);
    });

    // — UTF-8 multibyte —————————————————————————————————————

    it('correctly counts bytes for ñ (2 bytes in UTF-8)', () => {
        // "Señal#95\n" → S(1) e(1) ñ(2) a(1) l(1) #(1) 9(1) 5(1) \n(1) = 10 bytes
        const result = formatUartMessage('Señal', 95);
        assert.equal(result.length, 10);
        assert.equal(decode(result), 'Señal#95\n');
    });

    it('does not cut a multi-byte character in half when truncating', () => {
        // "ñañañañañañañaña" forces truncation near a multi-byte boundary.
        // suffix "#0\n" = 3 bytes → name ≤ 17 bytes.
        // Each ñ=2 bytes, each a=1 byte. At 17 bytes the last byte is a
        // continuation byte of ñ, so truncation must step back to 15 bytes.
        const result = formatUartMessage('ñañañañañañañaña', 0);
        assert.ok(result.length <= 20, `Got ${result.length} bytes`);

        // Verify it decodes to valid UTF-8 (no replacement characters)
        const text = decode(result);
        assert.ok(!text.includes('\uFFFD'), `Contains replacement character: "${text}"`);
        assert.ok(text.endsWith('#0\n'), `Should end with #0\\n: "${text}"`);
    });

    it('handles emoji (4 bytes in UTF-8) without corruption', () => {
        // "🐱" is 4 bytes in UTF-8
        const result = formatUartMessage('🐱', 50);
        assert.ok(result.length <= 20);
        const text = decode(result);
        assert.ok(!text.includes('\uFFFD'), `Contains replacement character: "${text}"`);
        assert.equal(text, '🐱#50\n');
    });

    it('truncates long emoji name at valid boundary', () => {
        // 5 emoji × 4 bytes = 20 bytes name + "#0\n" (3 bytes) = 23 → needs truncation
        const result = formatUartMessage('🐱🐶🦊🐸🐵', 0);
        assert.ok(result.length <= 20, `Got ${result.length} bytes`);
        const text = decode(result);
        assert.ok(!text.includes('\uFFFD'), `Contains replacement character: "${text}"`);
        assert.ok(text.endsWith('#0\n'));
    });

    // — Edge cases ————————————————————————————————————————

    it('handles empty class name', () => {
        const result = formatUartMessage('', 50);
        assert.equal(decode(result), '#50\n');
    });

    it('handles single-character class name', () => {
        const result = formatUartMessage('A', 0);
        assert.equal(decode(result), 'A#0\n');
    });

    it('returns Uint8Array', () => {
        const result = formatUartMessage('Test', 50);
        assert.ok(result instanceof Uint8Array);
    });
});
