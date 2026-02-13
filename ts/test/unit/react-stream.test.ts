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

