import assert from 'node:assert/strict';
import test from 'node:test';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';

test('react adapter: renders ReactNode + head tags + hydration', async () => {
  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: () => React.createElement('main', null, 'Hello from React'),
        renderOptions: {
          headTags: [{ type: 'title', text: 'Home' }],
          hydration: {
            data: { message: '<hi>&</hi>' },
            bootstrapModule: '/assets/entry.js',
          },
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 200);

  const body = new TextDecoder().decode(resp.body as Uint8Array);
  assert.ok(body.startsWith('<!doctype html>'));
  assert.ok(body.includes('<title>Home</title>'));
  assert.ok(body.includes('<main>Hello from React</main>'));

  assert.ok(body.includes('id="__FACETHEORY_DATA__"'));
  assert.ok(body.includes('\\u003c'));
  assert.ok(!body.includes('<hi>'));

  const m = body.match(
    /<script[^>]*id="__FACETHEORY_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  assert.ok(m?.[1]);
  assert.deepEqual(JSON.parse(m![1]), { message: '<hi>&</hi>' });

  assert.ok(body.includes('<script src="/assets/entry.js" type="module"></script>'));
});

test('react adapter: renders non-element ReactNode', async () => {
  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: () => 'ok',
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  const body = new TextDecoder().decode(resp.body as Uint8Array);
  assert.ok(body.includes('<body>ok</body>'));
});
