import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = dirname(fileURLToPath(import.meta.url));

async function discoverUnitTests(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await discoverUnitTests(fullPath)));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.test.ts')) continue;
    files.push(relative(testRoot, fullPath).split(sep).join('/'));
  }

  return files;
}

const unitTestFiles = (await discoverUnitTests(join(testRoot, 'unit'))).sort();

console.log(`FaceTheory unit test files discovered: ${unitTestFiles.length}`);

if (unitTestFiles.length === 0) {
  console.error('FaceTheory unit test discovery found no files for unit/**/*.test.ts');
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [
    '--import',
    'tsx',
    '--test',
    '--test-concurrency=1',
    ...unitTestFiles.map((testFile) => join(testRoot, testFile)),
  ],
  { stdio: 'inherit' },
);

const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
  (resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  },
);

if (result.signal !== null) {
  console.error(`FaceTheory unit test runner terminated by signal ${result.signal}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.code ?? 1;
}
