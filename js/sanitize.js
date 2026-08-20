/**
 * sanitize.js
 * Pure sanitization logic (protocol.js pattern): no browser APIs at module
 * level, importable from node:test. Covers HTML escaping for text AND
 * quoted-attribute contexts, and shape validation of sample records
 * rehydrated from IndexedDB, which this project treats as user input.
 */

const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

/**
 * Escapes a value for interpolation in HTML templates. Unlike the
 * textContent/innerHTML round-trip, it also escapes quotes, so it is safe
 * inside double- or single-quoted attributes (e.g. value="${...}").
 * null/undefined become ''.
 */
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * True if the value is a base64 data: URL of a JPEG or PNG image — the only
 * formats the trainers produce with toDataURL() for thumbnails and frames.
 */
const DATA_IMAGE_URL = /^data:image\/(jpeg|png);base64,/;

export function isDataImageUrl(value) {
    return typeof value === 'string' && DATA_IMAGE_URL.test(value);
}

/**
 * Validates an image sample record ({ci, img224, thumb}) against the shape
 * that saveSamples() writes in image-trainer.js.
 */
export function isValidImageSample(sample) {
    return Boolean(sample)
        && Number.isInteger(sample.ci) && sample.ci >= 0
        && isDataImageUrl(sample.img224)
        && isDataImageUrl(sample.thumb);
}

/**
 * Validates a pose sample record ({ci, features, thumb}) against the shape
 * that saveSamples() writes in pose-trainer.js. featureSize is the exact
 * expected length of the features array (99 for PoseLandmarker).
 */
export function isValidPoseSample(sample, featureSize) {
    if (!sample
        || !Number.isInteger(sample.ci) || sample.ci < 0
        || !isDataImageUrl(sample.thumb)
        || !Array.isArray(sample.features)
        || sample.features.length !== featureSize) {
        return false;
    }
    // Explicit index loop: Array.prototype.every skips holes, so a sparse
    // array of the right length would slip through an .every() check and
    // its holes would become NaN in Float32Array.
    for (let i = 0; i < featureSize; i++) {
        if (!Number.isFinite(sample.features[i])) return false;
    }
    return true;
}

/**
 * Validates the spectrogram of an audio example ({data, frameSize}) against
 * what generateSpectrogramThumb() in audio-trainer.js needs to draw a canvas:
 * frameSize is the row count and data.length / frameSize the column count, so
 * a zero frameSize or a length that is not a multiple of it yields a canvas of
 * invalid or non-integer size instead of a thumbnail.
 *
 * Unlike the image and pose validators this takes the spectrogram, not the
 * whole record: the transfer recognizer owns the surrounding shape and only
 * the spectrogram reaches the canvas.
 */
export function isValidSpectrogram(spectrogram) {
    if (!spectrogram) return false;
    const { data, frameSize } = spectrogram;
    if (!Number.isInteger(frameSize) || frameSize <= 0) return false;
    // Float32Array as the library deserializes it; plain Array covers a
    // hand-written record in IndexedDB.
    if (!(data instanceof Float32Array) && !Array.isArray(data)) return false;
    return data.length > 0 && data.length % frameSize === 0;
}
