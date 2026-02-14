import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';

test('FaceApp: observability hooks receive request + ISR state + render duration', async () => {
  const logs: Array<Record<string, unknown>> = [];
  const metrics: Array<Record<string, unknown>> = [];

  let t = 0;
  const now = () => {
    t += 1;
    return t;
  };

  const app = createFaceApp({
    faces: [
      {
        route: '/isr',
        mode: 'isr',
        revalidateSeconds: 60,
        render: () => ({ html: '<main>ok</main>' }),
      },
    ],
    observability: {
      now,
      log: (record) => logs.push(record as unknown as Record<string, unknown>),
      metric: (record) => metrics.push(record as unknown as Record<string, unknown>),
    },
  });

  await app.handle({ method: 'GET', path: '/isr', headers: { 'x-request-id': ['req-1'] } });
  await app.handle({ method: 'GET', path: '/isr', headers: { 'x-request-id': ['req-2'] } });

  assert.equal(logs.length, 2);

  assert.equal(logs[0]?.event, 'facetheory.request.completed');
  assert.equal(logs[0]?.requestId, 'req-1');
  assert.equal(logs[0]?.mode, 'isr');
  assert.equal(logs[0]?.routePattern, '/isr');
  assert.equal(logs[0]?.isrState, 'miss');
  assert.equal(typeof logs[0]?.renderMs, 'number');

  assert.equal(logs[1]?.requestId, 'req-2');
  assert.equal(logs[1]?.isrState, 'hit');
  assert.equal(logs[1]?.renderMs, null);

  const requestMetrics = metrics.filter((m) => m.name === 'facetheory.request');
  assert.equal(requestMetrics.length, 2);

  const renderMetrics = metrics.filter((m) => m.name === 'facetheory.render_ms');
  assert.equal(renderMetrics.length, 1);
});

