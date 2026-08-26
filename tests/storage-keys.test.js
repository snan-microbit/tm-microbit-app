// tests/storage-keys.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    MODELS_KEY,
    MODELS_QUARANTINE_KEY,
    MODELS_QUARANTINE_SEEN_KEY,
    SAMPLES_DB_NAME,
    SAMPLES_DB_VERSION,
    SAMPLES_STORE,
    imageSamplesKey,
    audioSamplesKey,
    poseSamplesKey,
    imageModelKey,
    audioModelKey,
    poseModelKey,
    corruptBackupKey
} from '../js/storage-keys.js';

const ID = 1700000000000;

// Every builder in the module, corruptBackupKey included: it takes a timestamp
// rather than a project id, but it builds a persisted name from the same guard
// and has to satisfy the same invariants.
const ALL_BUILDERS = [
    imageSamplesKey,
    audioSamplesKey,
    poseSamplesKey,
    imageModelKey,
    audioModelKey,
    poseModelKey,
    corruptBackupKey
];

test('constants have their documented values', () => {
    assert.equal(MODELS_KEY, 'ml-microbit-models');
    assert.equal(SAMPLES_DB_NAME, 'ml-microbit-app');
    assert.equal(SAMPLES_STORE, 'samples');
});

test('the database name is not the bare organization name', () => {
    // 'ml-microbit' is the likeliest pick for a sibling app on the same origin,
    // and a database-name collision fails hard with VersionError.
    assert.notEqual(SAMPLES_DB_NAME, 'ml-microbit');
});

test('sample keys have the exact documented shape', () => {
    assert.equal(imageSamplesKey(ID), `ml-image-samples-${ID}`);
    assert.equal(audioSamplesKey(ID), `ml-audio-samples-${ID}`);
    assert.equal(poseSamplesKey(ID), `ml-pose-samples-${ID}`);
});

test('model keys have the exact documented shape', () => {
    assert.equal(imageModelKey(ID), `ml-image-local-${ID}`);
    assert.equal(audioModelKey(ID), `ml-audio-local-${ID}`);
    assert.equal(poseModelKey(ID), `ml-pose-local-${ID}`);
});

test('the corrupt backup key derives from MODELS_KEY', () => {
    assert.equal(corruptBackupKey(ID), `ml-microbit-models-corrupt-${ID}`);
    assert.ok(corruptBackupKey(ID).startsWith(MODELS_KEY));
});

test('numeric and string project ids produce the same key', () => {
    for (const build of ALL_BUILDERS) {
        assert.equal(build(ID), build(String(ID)));
    }
});

test('every builder produces a distinct key for the same project', () => {
    const keys = ALL_BUILDERS.map((build) => build(ID));
    assert.equal(
        new Set(keys).size,
        ALL_BUILDERS.length,
        `colliding keys: ${keys.join(', ')}`
    );
});

test('no builder prefix is a prefix of another', () => {
    // Stronger than mutual distinctness: with an id appended, a prefix that
    // extends another (e.g. a future 'ml-image-samples-meta-') could produce
    // a key that reads as a valid key of the shorter family.
    const prefixes = ALL_BUILDERS.map((build) => {
        const key = build(ID);
        // The slice below only recovers the prefix while the id is a suffix of
        // the key. Assert it, or a builder that appends anything after the id
        // would silently turn this whole test into a check on garbage.
        assert.ok(key.endsWith(String(ID)), `key does not end with the id: ${key}`);
        return key.slice(0, key.length - String(ID).length);
    });
    // Index-based, not value-based: two builders sharing an identical prefix is
    // the worst collision there is, and `if (a === b) continue` would skip it.
    for (let i = 0; i < prefixes.length; i++) {
        for (let j = 0; j < prefixes.length; j++) {
            if (i === j) continue;
            assert.ok(
                !prefixes[j].startsWith(prefixes[i]),
                `prefix '${prefixes[i]}' is a prefix of '${prefixes[j]}'`
            );
        }
    }
});

test('every origin-scoped name is namespaced under ml-', () => {
    const names = [MODELS_KEY, SAMPLES_DB_NAME, ...ALL_BUILDERS.map((b) => b(ID))];
    for (const name of names) {
        assert.ok(name.startsWith('ml-'), `not namespaced: ${name}`);
    }
});

test('no name carries the legacy tm prefix', () => {
    const names = [
        MODELS_KEY,
        SAMPLES_DB_NAME,
        SAMPLES_STORE,
        ...ALL_BUILDERS.map((b) => b(ID))
    ];
    for (const name of names) {
        assert.ok(!/(^|[-_])tm[-_]/.test(name), `legacy prefix left in: ${name}`);
    }
});

test('a missing or malformed project id throws instead of producing a garbage key', () => {
    const rejected = [
        undefined, null, '', '   ', NaN, Infinity, -Infinity, {}, [], true,
        // Rejected, not trimmed: normalizing would let '42' and '  42  ' share
        // a key while project-store.js still tells them apart with ===.
        '  42  '
    ];
    for (const build of ALL_BUILDERS) {
        for (const value of rejected) {
            assert.throws(
                () => build(value),
                /projectId must be/,
                `accepted ${String(value)} in ${build.name}`
            );
        }
    }
});

test('zero is accepted as an id', () => {
    // 0 is falsy but legitimate; the guard must not reject it.
    for (const build of ALL_BUILDERS) {
        assert.ok(build(0).endsWith('-0'));
        assert.equal(build(0), build('0'));
    }
});

test('the database version is a positive integer', () => {
    // Bumping it is a coordinated change across the three trainers: they open
    // the same database, and a module left behind gets VersionError.
    assert.ok(Number.isInteger(SAMPLES_DB_VERSION));
    assert.ok(SAMPLES_DB_VERSION >= 1);
});

test('the quarantine key derives from MODELS_KEY and is distinct from the corrupt backup', () => {
    assert.equal(MODELS_QUARANTINE_KEY, 'ml-microbit-models-quarantine');
    assert.ok(MODELS_QUARANTINE_KEY.startsWith(MODELS_KEY));
    assert.notEqual(MODELS_QUARANTINE_KEY, MODELS_KEY);
    // A fixed key, so it must not collide with any member of the timestamped
    // corrupt-backup family.
    assert.notEqual(MODELS_QUARANTINE_KEY, corruptBackupKey(ID));
});

test('the quarantine key is namespaced and carries no legacy prefix', () => {
    assert.ok(MODELS_QUARANTINE_KEY.startsWith('ml-'));
    assert.ok(!/(^|[-_])tm[-_]/.test(MODELS_QUARANTINE_KEY));
});

test('the quarantine acknowledgement key is distinct and namespaced', () => {
    assert.equal(MODELS_QUARANTINE_SEEN_KEY, 'ml-microbit-models-quarantine-seen');
    assert.ok(MODELS_QUARANTINE_SEEN_KEY.startsWith('ml-'));
    assert.notEqual(MODELS_QUARANTINE_SEEN_KEY, MODELS_QUARANTINE_KEY);
    assert.ok(!/(^|[-_])tm[-_]/.test(MODELS_QUARANTINE_SEEN_KEY));
});
