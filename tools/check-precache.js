/**
 * check-precache.js
 *
 * Verifies that the Service Worker precache list in sw.js and the assets the
 * browser actually requests are exactly in sync. Run from the repo root:
 *
 *     node tools/check-precache.js
 *
 * Two failure modes this catches, both of which break offline silently:
 *
 *   1. A reference the precache does not cover byte-for-byte. `caches.match()`
 *      compares the FULL URL, query string included, so `css/styles.css?v=4.0`
 *      and the precache entry `./css/styles.css` are different entries: the
 *      precached copy is never served. Cache-busting is CACHE_NAME's job.
 *   2. A precache entry pointing at a file that no longer exists. `cache.addAll()`
 *      is atomic — one 404 rejects the whole install and the app never goes
 *      offline at all.
 *
 * Assets are collected the way the browser reaches them: the href/src of
 * index.html, plus the static import graph walked from every local script tag
 * (a module imported by app.js is requested over the network just like a
 * script tag, and is just as easy to forget in the precache list).
 *
 * No npm dependencies — plain Node, same constraint as the rest of the repo.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const INDEX = 'index.html';
const SW = 'sw.js';

/** Repo-relative POSIX path, without the leading './'. */
function toRepoPath(p) {
    return normalize(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

function isExternal(url) {
    return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url);
}

/**
 * vendor/ gets membership-checked but never touched on disk, and is never
 * descended into: it holds pinned third-party bundles whose internals are not
 * precached individually. CI runs this check on a sparse checkout without
 * vendor/ (~28 MB), so treating it explicitly is what keeps a local run and a
 * CI run from reaching different conclusions. Its integrity is the checksums
 * job's business.
 */
function isVendor(path) {
    return path.startsWith('vendor/');
}

/** Precache entries of sw.js, as repo-relative paths. */
function readPrecache(swSource) {
    const start = swSource.indexOf('urlsToCache = [');
    if (start === -1) throw new Error(`No se encontró urlsToCache en ${SW}`);
    const end = swSource.indexOf('];', start);
    if (end === -1) throw new Error(`No se pudo delimitar urlsToCache en ${SW}`);
    const body = swSource.slice(start, end);
    return [...body.matchAll(/'([^']+)'/g)].map(m => toRepoPath(m[1]));
}

/** Local href/src values of index.html, in document order. */
function readHtmlRefs(htmlSource) {
    return [...htmlSource.matchAll(/(?:href|src)\s*=\s*"([^"]+)"/g)]
        .map(m => m[1])
        .filter(url => !isExternal(url));
}

/**
 * Module specifiers of a source file: `from '...'`, bare `import '...'` and
 * dynamic `import('...')`. Matches over the whole text, so multi-line import
 * statements are handled.
 */
function readImports(source) {
    const specifiers = [
        ...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
        ...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
        ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)
    ].map(m => m[1]);
    // Bare specifiers ('node:fs', 'lodash') are not files this repo serves.
    return specifiers.filter(s => s.startsWith('.') || s.startsWith('/'));
}

/**
 * Walks the static import graph from the given entry files. Missing files are
 * reported by the caller's existence check, not here, so the walk never throws.
 */
function walkImports(entries) {
    const seen = new Set();
    const queue = [...entries];
    while (queue.length) {
        const file = queue.shift();
        if (seen.has(file)) continue;
        seen.add(file);
        if (isVendor(file) || !existsSync(file)) continue;
        for (const spec of readImports(readFileSync(file, 'utf8'))) {
            queue.push(toRepoPath(join(dirname(file), spec)));
        }
    }
    // The entries themselves are reported through readHtmlRefs().
    return [...seen].filter(f => !entries.includes(f));
}

const html = readFileSync(INDEX, 'utf8');
const sw = readFileSync(SW, 'utf8');

const precache = new Set(readPrecache(sw));
const htmlRefs = readHtmlRefs(html);
const scriptEntries = htmlRefs
    .filter(url => url.split('?')[0].endsWith('.js'))
    .map(url => toRepoPath(url.split('?')[0]));
const imported = walkImports(scriptEntries);

const problems = [];
const fail = (message) => {
    problems.push(message);
    console.log(`::error::${message}`);
};

// 1. No query strings: they make the precache entry unreachable.
for (const url of new Set(htmlRefs)) {
    if (url.includes('?')) {
        fail(`${INDEX} referencia "${url}" con query string: ` +
            `caches.match() nunca va a servir la entrada precacheada "${toRepoPath(url.split('?')[0])}". ` +
            `El cache-busting lo hace CACHE_NAME, no un ?v=.`);
    }
}

// 2. Everything the browser requests must be precached.
const requested = new Set([...htmlRefs.map(u => toRepoPath(u.split('?')[0])), ...imported]);
for (const asset of requested) {
    if (!precache.has(asset)) {
        const how = imported.includes(asset) ? 'importado por un módulo' : `referenciado por ${INDEX}`;
        fail(`"${asset}" (${how}) no está en la lista de precache de ${SW}: la app no va a funcionar offline.`);
    }
}

// 3. Every precache entry must exist on disk. '' is the './' navigation root.
for (const entry of precache) {
    if (entry === '' || isVendor(entry)) continue;
    if (!existsSync(entry)) {
        fail(`${SW} precachea "${entry}", que no existe: cache.addAll() es atómico ` +
            `y un solo 404 hace fallar la instalación del Service Worker.`);
    }
}

// 4. Referenced files must exist (catches a typo before it reaches the browser).
for (const asset of requested) {
    if (isVendor(asset)) continue;
    if (!existsSync(asset)) fail(`"${asset}" está referenciado pero no existe en el repo.`);
}

const cacheName = sw.match(/CACHE_NAME\s*=\s*'([^']+)'/);
console.log(`CACHE_NAME: ${cacheName ? cacheName[1] : '(no encontrado)'}`);
console.log(`Precache: ${precache.size} entradas | index.html: ${new Set(htmlRefs).size} referencias locales | módulos importados: ${imported.length}`);

if (problems.length) {
    console.log(`\n${problems.length} problema(s) de precache.`);
    process.exit(1);
}
console.log('\nPrecache y assets consistentes.');
