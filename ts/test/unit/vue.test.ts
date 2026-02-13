import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import { createVueFace, h } from '../../src/vue/index.js';

test('vue adapter: renders VNode + head tags', async () => {
  const app = createFaceApp({
    faces: [
      createVueFace({
        route: '/',
        mode: 'ssr',
        render: () => h('main', null, 'Hello Vue'),
        renderOptions: {
          headTags: [{ type: 'title', text: 'Vue' }],
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  const body = new TextDecoder().decode(resp.body as Uint8Array);

  assert.ok(body.includes('<title>Vue</title>'));
  assert.ok(body.includes('<main>Hello Vue</main>'));
});

