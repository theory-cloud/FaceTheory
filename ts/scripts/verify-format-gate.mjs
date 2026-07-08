#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tsRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(tsRoot, '..');

const repoRelativeDirectoryInputs = ['.github/workflows', 'docs'];

const repoRelativeFileInputs = [
  'AGENTS.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'README.md',
  'ts/README.md',
  'ts/package-lock.json',
  'ts/package.json',
];

const parseExtensions = new Set(['.html', '.md', '.yaml', '.yml']);
// Docs `.json` files may be Jekyll/Liquid output templates with front matter
// (for example docs/search.json), not literal JSON source. Parse JSON only when
// it is an explicit package file input above; do not pretend a Liquid template is
// plain JSON.

const ignoredPathSegments = new Set([
  '.bundle',
  '.git',
  'coverage',
  'dist',
  'node_modules',
]);

const candidates = (
  await Promise.all([
    ...repoRelativeDirectoryInputs.map((input) =>
      collectDirectory(path.join(repoRoot, input)),
    ),
    ...repoRelativeFileInputs.map((input) =>
      collectExplicitFile(path.join(repoRoot, input)),
    ),
  ])
)
  .flat()
  .sort((a, b) => a.localeCompare(b));

const failures = [];
for (const file of candidates) {
  const source = await readFile(file, 'utf8');
  try {
    await prettier.format(source, { filepath: file });
  } catch (err) {
    failures.push({ file, err });
  }
}

if (failures.length > 0) {
  console.error('verify-format-gate: FAIL');
  console.error(
    'Prettier could not parse one or more docs/package/workflow files. Fix structurally invalid content, or add a narrow documented ignore only with a separate structural check.',
  );
  for (const { file, err } of failures) {
    const relative = path.relative(repoRoot, file);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n${relative}`);
    console.error(indent(message));
  }
  process.exit(1);
}

console.log(
  `verify-format-gate: PASS (${candidates.length} docs/package/workflow files parsed)`,
);

async function collectExplicitFile(inputPath) {
  const entries = await readdir(path.dirname(inputPath), {
    withFileTypes: true,
  });
  const basename = path.basename(inputPath);
  const match = entries.find((entry) => entry.name === basename);
  if (!match) return [];
  return match.isFile() ? [inputPath] : [];
}

async function collectDirectory(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredPathSegments.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectDirectory(fullPath)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!parseExtensions.has(path.extname(entry.name))) continue;
    files.push(fullPath);
  }
  return files;
}

function indent(message) {
  return message
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
