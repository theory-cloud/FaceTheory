import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import {
  createVueStreamFace,
  h,
  renderVueStream,
} from '../../src/vue/index.js';
import type { FaceBody, FaceContext } from '../../src/types.js';

const baseCtx: FaceContext = {
  request: {
    method: 'GET',
    path: '/',
    query: {},
    headers: { 'x-request-id': ['test-vue-stream'] },
    cookies: {},
    body: new Uint8Array(),
    isBase64: false,
    cspNonce: null,
  },
  params: {},
  proxy: null,
};

async function collect(body: FaceBody): Promise<string> {
  const decoder = new TextDecoder();
  if (body instanceof Uint8Array) return decoder.decode(body);

  const parts: string[] = [];
  for await (const chunk of body) {
    parts.push(decoder.decode(chunk, { stream: true }));
  }
  parts.push(decoder.decode());
  return parts.join('');
}

function failAfterFirstChunk(
  body: AsyncIterable<Uint8Array>,
): AsyncIterable<Uint8Array> {
  return (async function* () {
    let yielded = false;
    for await (const chunk of body) {
      yield chunk;
      if (!yielded) {
        yielded = true;
        throw new Error('vue stream failed after first chunk');
      }
    }
  })();
}

test('vue adapter: streaming body renders and FaceApp wraps document', async () => {
  const app = createFaceApp({
    faces: [
      createVueStreamFace({
        route: '/',
        mode: 'ssr',
        render: () => h('main', null, 'Hello Vue (stream)'),
        renderOptions: {
          headTags: [{ type: 'title', text: 'Vue Stream' }],
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.ok(!(resp.body instanceof Uint8Array));

  const iterator = resp.body[Symbol.asyncIterator]();
  const firstChunk = await iterator.next();
  assert.equal(firstChunk.done, false);
  const first = new TextDecoder().decode(firstChunk.value);
  assert.ok(first.startsWith('<!doctype html>'));
  assert.ok(first.includes('<title>Vue Stream</title>'));
  assert.ok(!first.includes('Hello Vue (stream)'));

  const remainder = await collect({
    async *[Symbol.asyncIterator]() {
      for (;;) {
        const next = await iterator.next();
        if (next.done) return;
        yield next.value;
      }
    },
  });
  const html = `${first}${remainder}`;
  assert.ok(html.includes('<main>Hello Vue (stream)</main>'));
});

test('vue adapter: renderVueStream returns the AsyncIterable body contract', async () => {
  const out = await renderVueStream(
    baseCtx,
    h('main', null, 'Direct Vue stream'),
  );

  assert.notEqual(typeof out.html, 'string');
  const html = await collect(out.html as FaceBody);
  assert.ok(html.includes('<main>Direct Vue stream</main>'));
});

test('vue adapter: strict CSP streaming buffers safe output', async () => {
  const app = createFaceApp({
    faces: [
      createVueStreamFace({
        route: '/',
        mode: 'ssr',
        render: () => h('main', null, 'Strict Vue stream'),
        renderOptions: {
          csp: { inlineScripts: false, inlineStyles: false, rawHead: false },
          hydration: {
            type: 'external',
            data: { stream: true },
            dataUrl: '/_facetheory/data/vue-stream.json',
            bootstrapModule: '/assets/vue-stream-entry.js',
          },
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.ok(resp.body instanceof Uint8Array);

  const html = await collect(resp.body);
  assert.ok(html.includes('Strict Vue stream'));
  assert.ok(html.includes('id="__FACETHEORY_DATA_URL__"'));
  assert.ok(!html.includes('id="__FACETHEORY_DATA__"'));
});

test('vue adapter: streaming body error emits marker and closes document', async () => {
  const app = createFaceApp({
    faces: [
      createVueStreamFace({
        route: '/',
        mode: 'ssr',
        render: () => h('main', null, 'Vue stream before failure'),
        renderOptions: {
          integrations: [
            {
              name: 'vue-stream-failure-test',
              finalize: (out) => {
                assert.notEqual(typeof out.html, 'string');
                return {
                  ...out,
                  html: failAfterFirstChunk(
                    out.html as AsyncIterable<Uint8Array>,
                  ),
                };
              },
            },
          ],
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.ok(!(resp.body instanceof Uint8Array));

  const html = await collect(resp.body);
  assert.ok(html.includes('Vue stream before failure'));
  assert.ok(html.includes('data-facetheory-stream-error="true"'));
  assert.ok(html.endsWith('</body></html>'));
});
