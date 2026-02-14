import assert from 'node:assert/strict';
import test from 'node:test';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactStreamFace } from '../../src/adapters/react.js';
import type { FaceBody } from '../../src/types.js';

async function collect(body: FaceBody): Promise<string> {
  const dec = new TextDecoder();
  if (body instanceof Uint8Array) return dec.decode(body);
  const parts: string[] = [];
  for await (const chunk of body) parts.push(dec.decode(chunk, { stream: true }));
  parts.push(dec.decode());
  return parts.join('');
}

test('react adapter: streaming body renders and FaceApp wraps document', async () => {
  const app = createFaceApp({
    faces: [
      createReactStreamFace({
        route: '/',
        mode: 'ssr',
        render: () => React.createElement('main', null, 'Hello (stream)'),
        renderOptions: {
          headTags: [{ type: 'title', text: 'Stream' }],
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.ok(!(resp.body instanceof Uint8Array));

  const html = await collect(resp.body);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<title>Stream</title>'));
  assert.ok(html.includes('<main>Hello (stream)</main>'));
});

test('react adapter: readiness callback fires for shell and all-ready', async () => {
  const readiness: Array<{ phase: string; requestId: string | null }> = [];

  const app = createFaceApp({
    faces: [
      createReactStreamFace({
        route: '/',
        mode: 'ssr',
        render: () => React.createElement('main', null, 'Hello'),
        renderOptions: {
          onReadiness: (evt) => readiness.push({ phase: evt.phase, requestId: evt.requestId }),
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/', headers: { 'x-request-id': ['req-1'] } });
  assert.ok(!(resp.body instanceof Uint8Array));

  // Yield to allow callbacks to flush (especially `onAllReady`).
  await new Promise((r) => setTimeout(r, 0));

  assert.ok(readiness.some((e) => e.phase === 'shell'));
  assert.ok(readiness.some((e) => e.phase === 'all-ready'));
  assert.ok(readiness.every((e) => e.requestId === 'req-1'));
});
