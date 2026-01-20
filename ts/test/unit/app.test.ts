import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';

test('FaceApp: renders HTML with title', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({ head: { title: 'Home' }, html: '<div>hi</div>' }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 200);
  assert.equal(resp.headers['content-type']?.[0], 'text/html; charset=utf-8');

  const body = new TextDecoder().decode(resp.body as Uint8Array);
  assert.ok(body.includes('<title>Home</title>'));
  assert.ok(body.includes('<div>hi</div>'));
});

