#!/usr/bin/env node
/**
 * Computes the exact set of node_modules packages the Electron main process
 * needs at runtime, and prints them as electron-builder `files` entries.
 *
 * Why this exists: shipping all of node_modules makes the installer huge and
 * the NSIS step look like it has hung (most of it is already duplicated inside
 * .next/standalone by Next's own tracing). Trimming it by hand means guessing
 * transitive dependency names, which is reliably wrong - `pg` alone pulls in
 * eleven packages nobody guesses correctly, and a missing one only shows up as
 * "Cannot find module" from an installed .exe on someone else's machine.
 *
 * Usage:
 *   node runtime-deps.js                        # scan ./electron for requires
 *   node runtime-deps.js --dir main             # scan a different folder
 *   node runtime-deps.js pg embedded-postgres   # or name the roots yourself
 *   node runtime-deps.js --json                 # just the package names
 *
 * Run it from the project root (where package.json and package-lock.json are).
 * Re-run it whenever the main process starts requiring something new.
 */
const fs = require('fs');
const path = require('path');

const BUILTINS = new Set(require('module').builtinModules);

function parseArgs(argv) {
  const opts = { dir: 'electron', json: false, roots: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') {
      opts.dir = argv[i + 1];
      i += 1;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown flag ${arg}`);
    } else {
      opts.roots.push(arg);
    }
  }
  return opts;
}

function walkJsFiles(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsFiles(full, found);
    else if (/\.(js|cjs|mjs)$/.test(entry.name)) found.push(full);
  }
  return found;
}

/**
 * Finds bare specifiers in require('x'), import('x') and static imports.
 * A specifier like 'pg-pool/lib/foo' resolves to the package 'pg-pool', and a
 * scoped one keeps two segments.
 */
function findImportedPackages(dir) {
  const pattern = /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"]/g;
  const names = new Set();

  for (const file of walkJsFiles(dir)) {
    const source = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const specifier = match[1] || match[2];
      if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) continue;
      if (specifier.startsWith('node:')) continue;
      const parts = specifier.split('/');
      const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
      if (BUILTINS.has(name)) continue;
      // Electron itself is provided by the runtime, never packaged from
      // node_modules - listing it would ship a second copy of the binary.
      if (name === 'electron') continue;
      names.add(name);
    }
  }
  return [...names];
}

/**
 * Resolves a package name the way Node would from `fromPath`, by walking up
 * the nested node_modules chain that package-lock.json records verbatim.
 * npm hoists most things to the top level, but not always - a version conflict
 * leaves a nested copy, and looking only at the top level misses it.
 */
function resolveEntry(lock, fromPath, name) {
  const segments = fromPath === '' ? [] : fromPath.split('/node_modules/');
  for (let depth = segments.length; depth >= 0; depth -= 1) {
    const prefix = segments.slice(0, depth).join('/node_modules/');
    const candidate = prefix ? `${prefix}/node_modules/${name}` : `node_modules/${name}`;
    if (lock.packages[candidate]) return candidate;
  }
  return null;
}

function collect(lock, roots) {
  const seen = new Set();
  const missing = new Set();
  const queue = [];

  for (const name of roots) {
    const entry = resolveEntry(lock, '', name);
    if (entry) queue.push(entry);
    else missing.add(name);
  }

  while (queue.length > 0) {
    const entryPath = queue.shift();
    if (seen.has(entryPath)) continue;
    seen.add(entryPath);

    const entry = lock.packages[entryPath];
    // devDependencies are build-time only and peerDependencies are supplied by
    // whoever installed the package - neither is loaded by a require() at
    // runtime. optionalDependencies ARE included: that is how platform-specific
    // binary packages (@embedded-postgres/win32-x64 and friends) are declared.
    const deps = {
      ...(entry.dependencies || {}),
      ...(entry.optionalDependencies || {}),
    };

    for (const depName of Object.keys(deps)) {
      const resolved = resolveEntry(lock, entryPath, depName);
      if (resolved) queue.push(resolved);
      else missing.add(depName);
    }
  }

  return { seen, missing };
}

/**
 * Turns resolved lock paths into the top-level package directories to ship.
 * A nested copy (node_modules/a/node_modules/b, which npm leaves behind when
 * versions conflict) needs no entry of its own: shipping node_modules/a/**\/*
 * carries it along, and `a` is necessarily already in the set because that is
 * how the walk reached `b`.
 */
function toPackageNames(entryPaths) {
  const names = new Set();
  for (const entryPath of entryPaths) {
    const relative = entryPath.replace(/^node_modules\//, '');
    const segments = relative.split('/');
    names.add(relative.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]);
  }
  return [...names].sort();
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const lockPath = path.resolve('package-lock.json');

  if (!fs.existsSync(lockPath)) {
    console.error('No package-lock.json here. Run this from the project root.');
    process.exit(1);
  }

  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (!lock.packages) {
    console.error('package-lock.json is lockfileVersion 1. Run `npm install` with npm 7+ to upgrade it.');
    process.exit(1);
  }

  const roots = opts.roots.length > 0 ? opts.roots : findImportedPackages(path.resolve(opts.dir));
  if (roots.length === 0) {
    console.error(`No bare requires found under ${opts.dir}/. Pass package names as arguments instead.`);
    process.exit(1);
  }

  const { seen, missing } = collect(lock, roots);
  const names = toPackageNames(seen);

  if (opts.json) {
    console.log(JSON.stringify({ roots: roots.sort(), packages: names, missing: [...missing] }, null, 2));
    return;
  }

  console.log(`Roots (required directly by ${opts.roots.length > 0 ? 'you' : `${opts.dir}/`}): ${roots.sort().join(', ')}`);
  console.log(`\n${names.length} packages, including transitive dependencies.\n`);
  console.log('Paste into electron-builder\'s "files", keeping this order - the');
  console.log('negation has to come before the re-includes, and .next/standalone');
  console.log('has to come after them:\n');
  console.log('  "!node_modules/**/*",');
  for (const name of names) {
    console.log(`  "node_modules/${name}/**/*",`);
  }
  console.log('  ".next/standalone/**/*"');

  if (missing.size > 0) {
    console.log(`\nNot found in the lockfile: ${[...missing].join(', ')}`);
    console.log('Usually means it is a builtin alias or is not installed. Check before ignoring.');
  }

  console.log('\nThis list assumes "includeSubNodeModules": true is also set.');
  console.log('Where npm left a nested copy (node_modules/foo/node_modules/bar,');
  console.log('which happens on a version conflict), only `foo` is listed - `bar`');
  console.log('rides along inside it, and a top-level "node_modules/bar" pattern');
  console.log('would not match it anyway. Without includeSubNodeModules those');
  console.log('nested folders are silently dropped and the app fails to start.');
  console.log('\nVerify the result rather than trusting it - see the skill\'s');
  console.log('references/packaging-pitfalls.md, "Proving the trimmed set is complete".');
}

main();
