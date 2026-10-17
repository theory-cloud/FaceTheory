import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import { errorClassFor } from '../../src/ops.js';

test('ops: error class normalization avoids regex-sensitive trimming', () => {
  const err = new Error('boom');
  err.name = ' __Hydration error!!class__ ';

  assert.equal(errorClassFor(err), 'Hydration_error_class');
});

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
      metric: (record) =>
        metrics.push(record as unknown as Record<string, unknown>),
    },
  });

  await app.handle({
    method: 'GET',
    path: '/isr',
    headers: { 'x-request-id': ['req-1'] },
  });
  await app.handle({
    method: 'GET',
    path: '/isr',
    headers: { 'x-request-id': ['req-2'] },
  });

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
  assert.equal(logs[1]?.errorClass, null);

  const requestMetrics = metrics.filter((m) => m.name === 'facetheory.request');
  assert.equal(requestMetrics.length, 2);
  assert.equal(
    (requestMetrics[0]?.tags as Record<string, string> | undefined)
      ?.error_class,
    '',
  );

  assert.equal(
    (requestMetrics[0]?.tags as Record<string, string> | undefined)?.cold_start,
    '1',
  );
  assert.equal(
    (requestMetrics[1]?.tags as Record<string, string> | undefined)?.cold_start,
    '0',
  );

  const isrCacheMetrics = metrics.filter(
    (m) => m.name === 'facetheory.isr.cache',
  );
  assert.deepEqual(
    isrCacheMetrics.map(
      (metric) => (metric.tags as Record<string, string>).state,
    ),
    ['miss', 'hit'],
  );

  const regenerationMetrics = metrics.filter(
    (m) => m.name === 'facetheory.isr.regeneration_ms',
  );
  assert.equal(regenerationMetrics.length, 1);
  assert.equal(
    (regenerationMetrics[0]?.tags as Record<string, string> | undefined)
      ?.outcome,
    'success',
  );

  const renderMetrics = metrics.filter(
    (m) => m.name === 'facetheory.render_ms',
  );
  assert.equal(renderMetrics.length, 1);
});

test('FaceApp: request metrics tag deterministic render errors by class', async () => {
  const renderError = new TypeError('sensitive typed failure');
  const errors: Array<{ err: unknown; ctx: Record<string, unknown> }> = [];
  const metrics: Array<Record<string, unknown>> = [];

  const app = createFaceApp({
    faces: [
      {
        route: '/boom',
        mode: 'ssr',
        render: () => {
          throw renderError;
        },
      },
    ],
    observability: {
      onError: (err, ctx) =>
        errors.push({ err, ctx: ctx as unknown as Record<string, unknown> }),
      metric: (record) =>
        metrics.push(record as unknown as Record<string, unknown>),
    },
  });

  const response = await app.handle({ method: 'GET', path: '/boom' });
  assert.equal(response.status, 500);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.err, renderError);
  assert.equal(errors[0]?.ctx.errorClass, 'TypeError');
  assert.equal(errors[0]?.ctx.phase, 'render');

  const requestMetric = metrics.find((m) => m.name === 'facetheory.request');
  assert.ok(requestMetric);
  assert.equal(
    (requestMetric.tags as Record<string, string>).error_class,
    'TypeError',
  );
});

test('FaceApp: unmatched request metrics use one fixed route label while logs keep the path', async () => {
  const logs: Array<Record<string, unknown>> = [];
  const metrics: Array<{ name: string; tags?: Record<string, string> }> = [];

  const app = createFaceApp({
    faces: [
      {
        route: '/items/{id}',
        mode: 'ssr',
        render: (ctx) => ({ html: `<main>${String(ctx.params.id)}</main>` }),
      },
    ],
    trailingSlash: 'redirect',
    observability: {
      log: (record) => logs.push(record as unknown as Record<string, unknown>),
      metric: (record) =>
        metrics.push(record as unknown as { name: string; tags?: Record<string, string> }),
    },
  });

  const unmatchedPaths = Array.from(
    { length: 50 },
    (_, index) => `/missing/${index}-${Math.random().toString(36).slice(2)}`,
  );
  for (const path of unmatchedPaths) {
    const response = await app.handle({ method: 'GET', path });
    assert.equal(response.status, 404);
  }

  const unmatchedLabels = new Set(
    metrics
      .filter((metric) => metric.name === 'facetheory.request')
      .map((metric) => metric.tags?.route_pattern),
  );
  assert.deepEqual([...unmatchedLabels], ['unmatched']);
  assert.deepEqual(
    logs.map((record) => record.path),
    unmatchedPaths,
  );
  for (const metric of metrics) {
    for (const value of Object.values(metric.tags ?? {})) {
      assert.ok(!value.startsWith('/missing/'), `metric tag leaked path ${value}`);
    }
  }

  metrics.length = 0;
  logs.length = 0;
  await app.handle({ method: 'GET', path: '/items/a' });
  await app.handle({ method: 'GET', path: '/items/b' });
  const redirect = await app.handle({ method: 'GET', path: '/items/c/' });
  assert.equal(redirect.status >= 300 && redirect.status < 400, true);

  const requestLabels = metrics
    .filter((metric) => metric.name === 'facetheory.request')
    .map((metric) => metric.tags?.route_pattern);
  assert.deepEqual(requestLabels, ['/items/{id}', '/items/{id}', '/items/{id}']);
  const renderLabels = metrics
    .filter((metric) => metric.name === 'facetheory.render_ms')
    .map((metric) => metric.tags?.route_pattern);
  assert.deepEqual(renderLabels, ['/items/{id}', '/items/{id}']);
  assert.deepEqual(
    logs.map((record) => [record.path, record.routePattern]),
    [
      ['/items/a', '/items/{id}'],
      ['/items/b', '/items/{id}'],
      ['/items/c/', '/items/{id}'],
    ],
  );
});

test('FaceApp: stream error metrics keep the matched route template', async () => {
  const metrics: Array<{ name: string; tags?: Record<string, string> }> = [];
  const logs: Array<Record<string, unknown>> = [];
  const app = createFaceApp({
    faces: [
      {
        route: '/streams/{id}',
        mode: 'ssr',
        render: () => ({
          html: (async function* () {
            yield new TextEncoder().encode('<main>ok</main>');
            throw new Error('stream boom');
          })(),
        }),
      },
    ],
    observability: {
      log: (record) => logs.push(record as unknown as Record<string, unknown>),
      metric: (record) =>
        metrics.push(record as unknown as { name: string; tags?: Record<string, string> }),
    },
  });

  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    const response = await app.handle({ method: 'GET', path: '/streams/x1' });
    assert.ok(!(response.body instanceof Uint8Array));
    for await (const chunk of response.body) void chunk;
  } finally {
    console.error = originalConsoleError;
  }

  const streamErrorMetric = metrics.find(
    (metric) => metric.name === 'facetheory.stream_error',
  );
  assert.equal(streamErrorMetric?.tags?.route_pattern, '/streams/{id}');
  const streamErrorLog = logs.find(
    (record) => record.event === 'facetheory.stream_error',
  );
  assert.equal(streamErrorLog?.path, '/streams/x1');
});
