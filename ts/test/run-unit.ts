import { spawn } from 'node:child_process';
import { glob } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = dirname(fileURLToPath(import.meta.url));
const unitTestFiles: string[] = [];

for await (const testFile of glob('unit/*.test.ts', { cwd: testRoot })) {
  unitTestFiles.push(testFile);
}

unitTestFiles.sort();

console.log(`FaceTheory unit test files discovered: ${unitTestFiles.length}`);

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
