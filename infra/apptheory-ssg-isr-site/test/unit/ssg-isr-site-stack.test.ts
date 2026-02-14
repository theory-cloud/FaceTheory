import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import { FaceTheoryAppTheorySsgIsrSiteStack } from '../../src/stack.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readOrNull(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function buildFaceTheoryDist(): void {
  const repoRoot = path.resolve(__dirname, '../../../..');
  execFileSync('npm', ['--prefix', path.resolve(repoRoot, 'ts'), 'run', 'build'], {
    stdio: 'inherit',
  });
}

test('H3: SSG+ISR stack synth is snapshotted', async () => {
  // NodejsFunction bundles the SSR handler, which imports FaceTheory from ts/dist.
  // Ensure dist exists so synth is deterministic and succeeds in clean checkouts.
  buildFaceTheoryDist();

  const app = new App();
  const stack = new FaceTheoryAppTheorySsgIsrSiteStack(app, 'FaceTheoryAppTheorySsgIsrSite');

  const template = Template.fromStack(stack).toJSON();
  const actual = `${JSON.stringify(template, null, 2)}\n`;

  const snapshotDir = path.resolve('test/__snapshots__');
  const snapshotFile = path.resolve(snapshotDir, 'ssg-isr-site-stack.template.json');

  if (process.env.UPDATE_SNAPSHOTS === '1') {
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(snapshotFile, actual);
    return;
  }

  const expected = await readOrNull(snapshotFile);
  assert.ok(expected !== null, `missing snapshot: ${snapshotFile} (run: npm run test:update)`);
  assert.equal(actual, expected);
});
