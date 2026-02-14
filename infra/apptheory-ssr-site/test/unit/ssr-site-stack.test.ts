import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import { FaceTheoryAppTheorySsrSiteStack } from '../../src/stack.js';

async function readOrNull(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

test('H2: AppTheorySsrSite stack synth is snapshotted', async () => {
  const app = new App();
  const stack = new FaceTheoryAppTheorySsrSiteStack(app, 'FaceTheoryAppTheorySsrSite');

  const template = Template.fromStack(stack).toJSON();
  const actual = `${JSON.stringify(template, null, 2)}\n`;

  const snapshotDir = path.resolve('test/__snapshots__');
  const snapshotFile = path.resolve(snapshotDir, 'ssr-site-stack.template.json');

  if (process.env.UPDATE_SNAPSHOTS === '1') {
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(snapshotFile, actual);
    return;
  }

  const expected = await readOrNull(snapshotFile);
  assert.ok(expected !== null, `missing snapshot: ${snapshotFile} (run: npm run test:update)`);
  assert.equal(actual, expected);
});

