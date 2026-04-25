import assert from 'node:assert/strict';
import test from 'node:test';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createOperatorVisibilityExampleApp } from '../../examples/operator-visibility-react/handler.js';
import type { FaceBody } from '../../src/types.js';

async function collectBody(body: FaceBody): Promise<string> {
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);

  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  const total = chunks.reduce((size, chunk) => size + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(out);
}

test('operator visibility example renders deterministic SSR markers from load data', async () => {
  const app = createOperatorVisibilityExampleApp();

  const first = await app.handle({ method: 'GET', path: '/' });
  const second = await app.handle({ method: 'GET', path: '/' });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const firstBody = await collectBody(first.body);
  const secondBody = await collectBody(second.body);
  assert.equal(firstBody, secondBody);

  assert.ok(firstBody.includes('FaceTheory operator visibility example'));
  assert.ok(firstBody.includes('data-example="operator-visibility-react"'));
  assert.ok(firstBody.includes('data-source="facetheory-load"'));
  assert.ok(firstBody.includes('data-snapshot-at="2026-04-24T18:00:00.000Z"'));
  assert.ok(
    firstBody.includes('facetheory-stitch-guarded-operator-shell-authorized'),
  );
  assert.ok(firstBody.includes('data-operator-guard-state="authorized"'));
  assert.ok(firstBody.includes('facetheory-stitch-non-authoritative-banner'));
  assert.ok(firstBody.includes('Non-authoritative'));
  assert.ok(firstBody.includes('Correlation'));
  assert.ok(firstBody.includes('corr_example_visibility_001'));
  assert.ok(firstBody.includes('Source: example.envelope.correlation_id'));
  assert.ok(firstBody.includes('Trigger: eventbridge'));
  assert.ok(firstBody.includes('Low confidence'));
  assert.ok(firstBody.includes('refreshed 2 hours before snapshot'));
  assert.ok(firstBody.includes('facetheory-stitch-metadata-badge-danger'));
  assert.ok(firstBody.includes('facetheory-stitch-health-row-stale'));
  assert.ok(firstBody.includes('facetheory-stitch-visibility-matrix'));
  assert.ok(
    firstBody.includes('facetheory-stitch-visibility-matrix-cell-partial'),
  );
  assert.ok(
    firstBody.includes('facetheory-stitch-visibility-matrix-cell-empty'),
  );
  assert.ok(firstBody.includes('No injected visibility record'));
  assert.ok(
    firstBody.includes('data-placeholder-policy="no-production-like-data"'),
  );

  assert.ok(!firstBody.includes('Acme'));
  assert.ok(!firstBody.includes('Globex'));
  assert.ok(!firstBody.includes('v1.2.3'));
});

test('operator visibility example source does not compute freshness during render', async () => {
  const source = await readFile(
    path.resolve('examples/operator-visibility-react/handler.ts'),
    'utf8',
  );

  assert.ok(!source.includes('Date.now('));
  assert.ok(!source.includes('new Date('));
  assert.ok(!source.includes('Math.random('));
});
