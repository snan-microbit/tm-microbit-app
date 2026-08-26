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
 * localStorage key holding the project records the rehydration boundary could
 * not canonicalize. Read back only by diagnostics — the app never rehydrates
 * from here.
 *
 * A single fixed key, not a timestamped family: loadModels() runs on every
 * render, so a new key per load would grow without bound for as long as the bad
 * record stays in the list. That is the failure mode preserveCorruptData()
 * already has, against a quota now shared with every other app on the origin.
 */
export const MODELS_QUARANTINE_KEY = 'ml-microbit-models-quarantine';

/**
 * localStorage key holding a fingerprint of the quarantine the user has
 * already been told about: `<entries>:<serialized length>`.
 *
 * An acknowledgement, never a deletion: the quarantine copy can be the only one
 * left of a record, so the notice's dismiss button must not remove it.
 *
 * A fingerprint and NOT a count. A count cannot work here: the stored list is
 * capped while a single load can reject any number of records, so the two are
 * not comparable — an acknowledgement taken on a large load lands above
 * anything the count can reach again, and the notice goes deaf permanently. The
 * fingerprint changes whenever the quarantine gains something, which is what
 * makes the notice come back on its own when a NEW record is set aside, with no
 * second mechanism to reset it.
 */
export const MODELS_QUARANTINE_SEEN_KEY = 'ml-microbit-models-quarantine-seen';

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

/**
 * Version of the IndexedDB database this app owns.
 *
 * Lives here rather than as a literal inside each trainer for one reason: the
 * three trainers open the SAME database. The day a feature needs a second
 * object store, whoever bumps the version in one module leaves the other two
 * calling indexedDB.open(name, 1) against a database that is now at 2, and that
 * rejects with VersionError — all sample persistence goes down at once. The
 * duplicated IDB helpers are deliberate; this number is not part of that
 * duplication.
 *
 * Bumping this requires every idbOpen() onupgradeneeded handler to be
 * idempotent: on a bump it fires again against a database that already has the
 * store, where createObjectStore() would throw ConstraintError.
 */
export const SAMPLES_DB_VERSION = 1;

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
export function requireProjectId(projectId) {
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
