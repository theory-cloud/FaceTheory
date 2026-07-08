#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const packageJsonPath = path.join('ts', 'package.json');
const apiReferencePath = path.join('docs', 'api-reference.md');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const docs = fs.readFileSync(apiReferencePath, 'utf8');

const startMarker = '## Package Export Map';
const start = docs.indexOf(startMarker);
if (start < 0) {
  console.error('verify-docs-export-map: FAIL (docs/api-reference.md missing Package Export Map section)');
  process.exit(1);
}

const nextHeading = docs.indexOf('\n## ', start + startMarker.length);
const section = docs.slice(start, nextHeading < 0 ? docs.length : nextHeading);

const packageName = packageJson.name;
const expected = Object.keys(packageJson.exports ?? {}).map((subpath) =>
  subpath === '.' ? packageName : `${packageName}/${subpath.slice(2)}`,
);
const expectedSet = new Set(expected);
const documented = new Set(
  Array.from(section.matchAll(/`(@theory-cloud\/facetheory(?:\/[a-z0-9-]+)*)`/g),
    (match) => match[1],
  ),
);

const missing = expected.filter((name) => !documented.has(name));
const extra = Array.from(documented).filter((name) => !expectedSet.has(name)).sort();

if (missing.length || extra.length) {
  console.error('verify-docs-export-map: FAIL');
  if (missing.length) {
    console.error('  Missing from docs/api-reference.md Package Export Map:');
    for (const name of missing) console.error(`  - ${name}`);
  }
  if (extra.length) {
    console.error('  Documented but absent from ts/package.json exports:');
    for (const name of extra) console.error(`  - ${name}`);
  }
  process.exit(1);
}

console.log(`verify-docs-export-map: PASS (${expected.length} package exports documented)`);
NODE
