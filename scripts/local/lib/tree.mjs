import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const ENTRY_SUFFIXES = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.svelte'];
export const EXAMPLES_ROOT = 'ts/examples';
export const INFRA_ROOT = 'infra';

export function isEntrypointFile(name) {
  if (name.endsWith('.d.ts')) return false;
  if (name.includes('.test.') || name.includes('.spec.')) return false;
  return ENTRY_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

async function listDirectories(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function listTopLevelEntrypoints(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isEntrypointFile(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Discover the example surface from the repository tree. The harness never
 * trusts a hand-maintained list of example directories.
 */
export async function discoverTree(root) {
  const examplesRoot = path.join(root, EXAMPLES_ROOT);
  const infraRoot = path.join(root, INFRA_ROOT);
  const exampleNames = await listDirectories(examplesRoot);
  const infraNames = await listDirectories(infraRoot);

  const examples = [];
  for (const name of exampleNames) {
    const directory = path.join(EXAMPLES_ROOT, name);
    const entrypoints = await listTopLevelEntrypoints(path.join(root, directory));
    examples.push({ name, directory, entrypoints });
  }

  const infra = [];
  for (const name of infraNames) {
    const directory = path.join(INFRA_ROOT, name);
    const stats = await stat(path.join(root, directory, 'package.json')).catch(() => null);
    if (!stats || !stats.isFile()) continue;
    infra.push({ name, directory });
  }

  return { examples, infra };
}

export function exampleDirectoryFor(root, directory) {
  return path.relative(root, path.join(root, directory)).split(path.sep).join('/');
}
