// js/storage-keys.js

/**
 * Single source of truth for every namespace this app persists into.
 *
 * Pure module: no browser APIs, no imports, importable from node:test.
 * Same pattern as protocol.js, sanitize.js and class-name.js.
 *
 * Three origin-scoped namespaces are involved:
 *   - localStorage         -> MODELS_KEY, corruptBackupKey()
 *   - IndexedDB (ours)     -> SAMPLES_DB_NAME / SAMPLES_STORE, plus the
 *                             records built by the *SamplesKey() helpers
 *   - IndexedDB (TF.js)    -> the records built by the *ModelKey() helpers,
 *                             which live inside the library's own database
 *
 * Every name that competes for an origin-wide namespace starts with 'ml-':
 * GitHub Pages serves the organization's project sites from the same origin
 * as this app, so a bare name like 'models' or 'microbit' would collide.
 *
 * Two names are deliberately NOT built here:
 *   - SAMPLES_STORE lives inside our own database and competes with nothing,
 *     so it carries no prefix.
 *   - CACHE_NAME stays a literal in sw.js. The Service Worker is a classic
 *     worker script and does not share the app's ES module graph, so it
 *     cannot import from here; its value also changes on a different cadence
 *     (every deploy touching precached files).
 */

/** localStorage key holding the JSON array of projects. */
export const MODELS_KEY = 'ml-microbit-models';

/**
 * Name of the IndexedDB database this app owns.
 *
 * Not 'ml-microbit': that is the organization's name and therefore the most
 * likely pick for a sibling app on the same origin. A database-name collision
 * fails hard rather than silently — indexedDB.open(name, 1) against a database
 * another app created at version 2 rejects with VersionError, taking down all
 * sample persistence.
 */
export const SAMPLES_DB_NAME = 'ml-microbit-app';

/** Object store inside SAMPLES_DB_NAME. Not prefixed: scoped to our database. */
export const SAMPLES_STORE = 'samples';

/**
 * Rejects anything that would produce a malformed key.
 *
 * Checks the domain, not just sentinels: a non-finite number, an object, an
 * array or a blank string all coerce into a key with nothing after the final
 * dash, which is exactly the garbage key this guard exists to prevent. Ids are
 * rehydrated from localStorage, which this project treats as untrusted input.
 *
 * A string carrying surrounding whitespace is rejected, not trimmed. Trimming
 * would make the id -> key mapping non-injective ('42' and '  42  ' would share
 * a key) while project-store.js still compares ids with ===, so the two files
 * would disagree on whether two records are the same project. Rejecting keeps
 * a single notion of identity.
 *
 * 0 and '0' are valid ids and must pass.
 */
function requireProjectId(projectId) {
    if (typeof projectId === 'number') {
        if (!Number.isFinite(projectId)) {
            throw new Error('storage-keys: projectId must be a finite number');
        }
        return String(projectId);
    }
    if (typeof projectId === 'string' && projectId !== '' && projectId === projectId.trim()) {
        return projectId;
    }
    throw new Error(
        'storage-keys: projectId must be a finite number or a non-empty string without surrounding whitespace'
    );
}

export function imageSamplesKey(projectId) {
    return `ml-image-samples-${requireProjectId(projectId)}`;
}

export function audioSamplesKey(projectId) {
    return `ml-audio-samples-${requireProjectId(projectId)}`;
}

export function poseSamplesKey(projectId) {
    return `ml-pose-samples-${requireProjectId(projectId)}`;
}

export function imageModelKey(projectId) {
    return `ml-image-local-${requireProjectId(projectId)}`;
}

export function audioModelKey(projectId) {
    return `ml-audio-local-${requireProjectId(projectId)}`;
}

export function poseModelKey(projectId) {
    return `ml-pose-local-${requireProjectId(projectId)}`;
}

/**
 * localStorage key preserving a corrupt MODELS_KEY value for manual inspection.
 * Write-only by design: nothing reads it back.
 */
export function corruptBackupKey(timestamp) {
    return `${MODELS_KEY}-corrupt-${requireProjectId(timestamp)}`;
}
