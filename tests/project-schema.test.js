// tests/project-schema.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    PROJECT_SCHEMA_VERSION,
    PROJECT_TYPES,
    QUARANTINE_REASON,
    canonicalizeProject,
    rehydrateProjects
} from '../js/project-schema.js';
import { imageModelKey } from '../js/storage-keys.js';

const ID = '1755800000000';

function trainedImageProject(overrides = {}) {
    return {
        schemaVersion: PROJECT_SCHEMA_VERSION,
        id: ID,
        name: 'Gestos',
        projectType: 'image',
        createdAt: '2026-08-21T14:00:00.000Z',
        lastUsed: '2026-08-21T14:30:00.000Z',
        makecodeProject: null,
        classNames: ['Piedra', 'Papel'],
        localModel: {
            source: 'local',
            storageKey: imageModelKey(ID),
            classNames: ['Piedra', 'Papel'],
            trainedAt: '2026-08-21T14:29:00.000Z',
            featureExtractor: 'mobilenet_v1_0.25_224'
        },
        ...overrides
    };
}

test('a well-formed project passes through unchanged', () => {
    const input = trainedImageProject();
    const result = canonicalizeProject(input);
    assert.equal(result.ok, true);
    assert.deepEqual(result.project, input);
});

test('canonicalization is idempotent', () => {
    const once = canonicalizeProject(trainedImageProject({ name: '  Gestos  ', id: 1755800000000 }));
    assert.equal(once.ok, true);
    const twice = canonicalizeProject(once.project);
    assert.equal(twice.ok, true);
    assert.deepEqual(twice.project, once.project);
});

test('a numeric id is canonicalized to a string', () => {
    // The bug this closes: a numeric id builds correct storage keys but the
    // project is impossible to open or delete, because project-store.js and
    // renderModels() compare ids with ===.
    const result = canonicalizeProject(
        trainedImageProject({ id: 1755800000000, localModel: undefined })
    );
    assert.equal(result.ok, true);
    assert.strictEqual(result.project.id, ID);
});

test('a record with no schema version is treated as v1', () => {
    const raw = trainedImageProject();
    delete raw.schemaVersion;
    const result = canonicalizeProject(raw);
    assert.equal(result.ok, true);
    assert.equal(result.project.schemaVersion, 1);
});

test('a record from a newer version is accepted untouched', () => {
    // An offline client keeps its old Service Worker, so an older build must be
    // able to read what a newer one wrote. Refusing it would hide the project
    // from a user who only reloaded.
    const result = canonicalizeProject(
        trainedImageProject({ schemaVersion: PROJECT_SCHEMA_VERSION + 1 })
    );
    assert.equal(result.ok, true);
    assert.equal(result.project.schemaVersion, PROJECT_SCHEMA_VERSION + 1);
});

test('fields this version does not know about survive canonicalization', () => {
    // If they did not, this boundary would be what breaks forward
    // compatibility: the stripped record is what saveModels() persists next.
    const result = canonicalizeProject(trainedImageProject({ futureField: { a: 1 } }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.project.futureField, { a: 1 });
});

test('a blank or missing name is repaired, not rejected', () => {
    for (const name of [undefined, null, '', '   ', 42]) {
        const result = canonicalizeProject(trainedImageProject({ name }));
        assert.equal(result.ok, true, `rejected name: ${String(name)}`);
        assert.equal(result.project.name, 'Proyecto sin nombre');
    }
    const trimmed = canonicalizeProject(trainedImageProject({ name: '  Gestos  ' }));
    assert.equal(trimmed.project.name, 'Gestos');
});

test('projectType is repaired from localModel.source when they disagree', () => {
    // source wins: it is what decides which trainer owns the samples and the
    // weights, so it is where the data actually is.
    const result = canonicalizeProject(trainedImageProject({ projectType: 'pose' }));
    assert.equal(result.ok, true);
    assert.equal(result.project.projectType, 'image');
});

test('an untrained project with an unknown type is quarantined', () => {
    const result = canonicalizeProject(
        trainedImageProject({ projectType: 'texto', localModel: undefined })
    );
    assert.equal(result.ok, false);
    // El motivo pasó a ser un código fijo; lo que se afirma sigue siendo que un
    // tipo desconocido sin ninguna pista cuesta el proyecto.
    assert.equal(result.reason, QUARANTINE_REASON.UNKNOWN_TYPE);
});

test('a storageKey from a superseded scheme discards the model, not the project', () => {
    // The concrete trigger is the tm- to ml- rename, done without migration: a
    // browser with data from before it has keys that no longer validate. The
    // project must come back untrained with its work intact, not disappear.
    const stale = trainedImageProject();
    stale.localModel.storageKey = `tm-image-local-${ID}`;
    stale.makecodeProject = { header: { name: 'Gestos' }, text: { 'main.ts': 'basic.showNumber(1)' } };

    const result = canonicalizeProject(stale);

    assert.equal(result.ok, true);
    assert.equal(result.project.localModel, undefined);
    assert.equal(result.project.projectType, 'image');
    assert.equal(result.project.name, 'Gestos');
    assert.deepEqual(result.project.classNames, ['Piedra', 'Papel']);
    assert.deepEqual(result.project.makecodeProject, stale.makecodeProject);
});

test('a storageKey pointing outside this project discards the model', () => {
    // Same path, different motive: a tampered value must never reach tf.io,
    // whose keyspace is shared with every other app on the origin.
    const foreign = trainedImageProject();
    foreign.localModel.storageKey = 'ml-image-local-otro-proyecto';

    const result = canonicalizeProject(foreign);

    assert.equal(result.ok, true);
    assert.equal(result.project.localModel, undefined);
});

test('an unknown localModel.source discards the model, not the project', () => {
    const raw = trainedImageProject();
    raw.localModel.source = 'local-texto';

    const result = canonicalizeProject(raw);

    assert.equal(result.ok, true);
    assert.equal(result.project.localModel, undefined);
    // No hint survives an unknown source, so the stored projectType is used.
    assert.equal(result.project.projectType, 'image');
});

test('a holey classNames array drops both the names and the model', () => {
    // Array.prototype.every() skips absent indices, so a naive check passes it.
    // With no usable class names, loadSavedModel() would dereference undefined
    // in all three trainers, so the model goes with them.
    const holey = [];
    holey[0] = 'Piedra';
    holey[2] = 'Tijera';
    const raw = trainedImageProject({ classNames: holey });
    delete raw.localModel.classNames;

    const result = canonicalizeProject(raw);

    assert.equal(result.ok, true);
    assert.equal(result.project.classNames, undefined);
    assert.equal(result.project.localModel, undefined);
    // The discarded model still identified the trainer that wrote it.
    assert.equal(result.project.projectType, 'image');
});

test('classNames is recovered from localModel when the top-level copy is broken', () => {
    const result = canonicalizeProject(trainedImageProject({ classNames: 'Piedra,Papel' }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.project.classNames, ['Piedra', 'Papel']);
});

test('a record that is not an object is quarantined', () => {
    for (const raw of [null, undefined, 'texto', 42, [], true]) {
        const result = canonicalizeProject(raw);
        assert.equal(result.ok, false, `accepted: ${String(raw)}`);
    }
});

test('the id domain agrees exactly with storage-keys', () => {
    // Two notions of a valid project id is the bug this module exists to close.
    // If they ever diverge, a project can build correct keys and still be
    // impossible to open, or the other way round.
    const rejected = [undefined, null, '', '   ', NaN, Infinity, -Infinity, {}, [], true, '  42  '];
    for (const id of rejected) {
        const result = canonicalizeProject(trainedImageProject({ id, localModel: undefined }));
        assert.equal(result.ok, false, `accepted id: ${String(id)}`);
    }
    const zero = canonicalizeProject(
        trainedImageProject({ id: 0, projectType: 'image', localModel: undefined })
    );
    assert.equal(zero.ok, true);
    assert.strictEqual(zero.project.id, '0');
});

test('duplicate ids keep the first occurrence and quarantine the rest', () => {
    // The list is newest-first: addProject unshifts.
    const first = trainedImageProject({ name: 'Nuevo' });
    const second = trainedImageProject({ name: 'Viejo' });
    const { projects, quarantined } = rehydrateProjects([first, second]);
    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, 'Nuevo');
    assert.equal(quarantined.length, 1);
    assert.equal(quarantined[0].reason, QUARANTINE_REASON.DUPLICATE_ID);
});

test('a quarantined entry carries the raw record untouched', () => {
    const broken = { id: null, name: 'roto' };
    const { quarantined } = rehydrateProjects([broken]);
    assert.equal(quarantined.length, 1);
    assert.deepEqual(quarantined[0].record, broken);
    assert.equal(typeof quarantined[0].reason, 'string');
});

test('a non-array input yields empty lists instead of throwing', () => {
    for (const raw of [null, undefined, {}, 'texto', 42]) {
        const { projects, quarantined } = rehydrateProjects(raw);
        assert.deepEqual(projects, []);
        assert.deepEqual(quarantined, []);
    }
});

test('a discarded model still hints the project type', () => {
    // The only surviving clue when projectType is also unusable.
    const raw = trainedImageProject({ projectType: 'texto' });
    raw.localModel.storageKey = `tm-image-local-${ID}`;

    const result = canonicalizeProject(raw);

    assert.equal(result.ok, true);
    assert.equal(result.project.projectType, 'image');
    assert.equal(result.project.localModel, undefined);
});

test('an invalid schemaVersion is repaired, not fatal', () => {
    // It locates no data, so treating an unrecognizable value as the oldest
    // version is safe: a future migration then runs over it.
    for (const version of ['1', 1.5, null, 0, -3, {}]) {
        const result = canonicalizeProject(trainedImageProject({ schemaVersion: version }));
        assert.equal(result.ok, true, `quarantined schemaVersion: ${String(version)}`);
        assert.equal(result.project.schemaVersion, 1);
    }
});

test('createdAt and lastUsed with an unexpected type are preserved, not deleted', () => {
    // Deleting a known field whose type this version does not expect is the same
    // forward-compatibility break the shallow copy exists to avoid, and it
    // becomes permanent on the next saveModels(). formatDate() guards instead.
    const result = canonicalizeProject(
        trainedImageProject({ createdAt: 1755800000000, lastUsed: null })
    );
    assert.equal(result.ok, true);
    assert.equal(result.project.createdAt, 1755800000000);
    assert.equal(result.project.lastUsed, null);
});

test('makecodeProject is preserved untouched whatever its shape', () => {
    // The one field a teacher cannot reconstruct. Nothing in this module
    // consumes it; the shape guard lives in makecode-embed.js.
    for (const value of ['texto', 42, [], { text: {} }, null, undefined]) {
        const result = canonicalizeProject(trainedImageProject({ makecodeProject: value }));
        assert.equal(result.ok, true);
        assert.deepEqual(result.project.makecodeProject, value);
    }
});

test('quarantine reasons are fixed codes with the offending value in detail', () => {
    const badType = canonicalizeProject(
        trainedImageProject({ projectType: 'texto', localModel: undefined })
    );
    assert.equal(badType.ok, false);
    assert.equal(badType.reason, QUARANTINE_REASON.UNKNOWN_TYPE);
    assert.equal(badType.detail, 'texto');

    const badId = canonicalizeProject(trainedImageProject({ id: null }));
    assert.equal(badId.reason, QUARANTINE_REASON.INVALID_ID);

    assert.equal(canonicalizeProject('texto').reason, QUARANTINE_REASON.NOT_AN_OBJECT);
});

test('a long offending value is truncated in detail', () => {
    // Bounds what one bad record costs in the quarantine key, and keeps a future
    // diagnostics screen from rendering an unbounded string.
    const huge = 'x'.repeat(5000);
    const result = canonicalizeProject(
        trainedImageProject({ projectType: huge, localModel: undefined })
    );
    assert.equal(result.ok, false);
    assert.ok(result.detail.length < 200, `detail not truncated: ${result.detail.length}`);
});

test('a source that names an Object.prototype member resolves to nothing', () => {
    const raw = trainedImageProject();
    raw.localModel.source = 'constructor';

    const result = canonicalizeProject(raw);

    assert.equal(result.ok, true);
    assert.equal(result.project.localModel, undefined);
});

test('an empty classNames array is not usable and drops the model', () => {
    // [] es truthy, así que ganaría el `||` sin la comprobación de largo. Un
    // modelo de cero clases genera un enum vacío que no compila en MakeCode.
    const raw = trainedImageProject({ classNames: [] });
    raw.localModel.classNames = [];

    const result = canonicalizeProject(raw);

    assert.equal(result.ok, true);
    assert.equal(result.project.classNames, undefined);
    assert.equal(result.project.localModel, undefined);
});

test('a localModel that is not a plain object is discarded, not quarantined', () => {
    for (const value of ['texto', 42, [], true]) {
        const result = canonicalizeProject(trainedImageProject({ localModel: value }));
        assert.equal(result.ok, true, `cuarentenó localModel: ${String(value)}`);
        assert.equal(result.project.localModel, undefined);
        assert.equal(result.project.projectType, 'image');
    }
});

test('a surviving model mirrors the resolved class names', () => {
    // La única mutación que la frontera todavía le hace a un localModel que
    // sobrevive: las dos copias tienen que quedar de acuerdo.
    const raw = trainedImageProject({ classNames: ['Piedra', 'Papel'] });
    raw.localModel.classNames = ['viejo'];

    const result = canonicalizeProject(raw);

    assert.equal(result.ok, true);
    assert.deepEqual(result.project.classNames, ['Piedra', 'Papel']);
    assert.deepEqual(result.project.localModel.classNames, ['Piedra', 'Papel']);
});

test('PROJECT_TYPES covers exactly the types the trainers implement', () => {
    assert.deepEqual([...PROJECT_TYPES].sort(), ['audio', 'image', 'pose']);
});

// ---------------------------------------------------------------------------
// Regression fixture
// ---------------------------------------------------------------------------
// tests/fixtures/projects-v1.json holds project records exactly as the app
// wrote them. It is the executable form of "a change must not break the
// projects teachers already have".
//
// IF A FUTURE CHANGE MAKES THIS TEST FAIL, THE CHANGE IS WRONG, NOT THE
// FIXTURE. Editing the fixture to make the test pass is precisely the moment a
// teacher's saved work stops opening.

test('the v1 fixture rehydrates with nothing quarantined', () => {
    const path = fileURLToPath(new URL('./fixtures/projects-v1.json', import.meta.url));
    const raw = JSON.parse(readFileSync(path, 'utf8'));

    const { projects, quarantined } = rehydrateProjects(raw);

    assert.deepEqual(
        quarantined.map((q) => q.reason),
        [],
        'the fixture must rehydrate clean'
    );
    assert.equal(projects.length, raw.length);

    // Not a byte-for-byte comparison against the fixture: a dump taken from a
    // build that predates versioning legitimately has no schemaVersion, and
    // canonicalization stamps it. What must hold is that identity and type
    // survive, and that a second pass changes nothing.
    assert.deepEqual(
        projects.map((p) => p.id),
        raw.map((p) => String(p.id))
    );
    const second = rehydrateProjects(projects);
    assert.deepEqual(second.quarantined, []);
    assert.deepEqual(second.projects, projects);

    // makecodeProject is the largest and least structured field in the record,
    // and it carries the generated tm-classes.ts inside it — the MakeCode
    // contract persisted inside a storage key. The boundary only passes it
    // through, so assert it passes through untouched.
    projects.forEach((p, i) => {
        assert.deepEqual(p.makecodeProject, raw[i].makecodeProject);
    });

    // All three trainer types are represented, so a change that only breaks one
    // of them cannot slip through.
    assert.deepEqual(
        [...new Set(projects.map((p) => p.projectType))].sort(),
        ['audio', 'image', 'pose']
    );
});
