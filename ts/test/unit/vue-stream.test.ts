import assert from 'node:assert/strict';
import test from 'node:test';

import { inject, type InjectionKey } from 'vue';

import { assertDocumentTagNonces } from '../helpers/csp.js';

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

test('vue adapter: streaming waits for async wrapApp style contribution before head assembly', async () => {
  const registerStyleKey: InjectionKey<(cssText: string) => void> = Symbol(
    'facetheory-vue-stream-wrap-style',
  );

  const AsyncStyledByWrapApp = {
    async setup() {
      const registerStyle = inject(registerStyleKey);
      assert.ok(registerStyle, 'expected wrapApp style provider');
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      registerStyle('.async-wrap-app-style{color:rgb(22,44,66);}');
      return () =>
        h('main', { class: 'async-wrap-app-style' }, 'Async WrapApp CSS');
    },
  };

  const app = createFaceApp({
    faces: [
      createVueStreamFace({
        route: '/',
        mode: 'ssr',
        render: () => h(AsyncStyledByWrapApp),
        renderOptions: {
          integrations: [
            {
              name: 'stream-wrap-app-style-provider',
              createState: () => ({ styles: [] as string[] }),
              wrapApp: (vueApp, _ctx, state) => {
                vueApp.provide(registerStyleKey, (cssText: string) => {
                  (state as { styles: string[] }).styles.push(cssText);
                });
              },
              contribute: (_ctx, state) => ({
                styleTags: (state as { styles: string[] }).styles.map(
                  (cssText, index) => ({
                    cssText,
                    attrs: { id: `async-wrap-app-style-${String(index)}` },
                  }),
                ),
              }),
            },
          ],
        },
      }),
    ],
  });

  const nonce = 'nonce-vue-stream-wrap-style';
  const resp = await app.handle({ method: 'GET', path: '/', cspNonce: nonce });
  assert.ok(!(resp.body instanceof Uint8Array));

  const iterator = resp.body[Symbol.asyncIterator]();
  const firstChunk = await iterator.next();
  assert.equal(firstChunk.done, false);
  const first = new TextDecoder().decode(firstChunk.value);
  assert.ok(first.includes('id="async-wrap-app-style-0"'), first);
  assert.ok(
    first.includes('.async-wrap-app-style{color:rgb(22,44,66);}'),
    first,
  );
  assert.ok(!first.includes('Async WrapApp CSS'));

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
  const styleIndex = html.indexOf('id="async-wrap-app-style-0"');
  const bodyIndex = html.indexOf(
    '<main class="async-wrap-app-style">Async WrapApp CSS</main>',
  );
  assert.ok(styleIndex >= 0, html);
  assert.ok(bodyIndex >= 0, html);
  assert.ok(styleIndex < bodyIndex);
  assertDocumentTagNonces(html, nonce, 1, 0);
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function paragraphs(count: number, size: number) {
  return h(
    'main',
    null,
    Array.from({ length: count }, (_, index) =>
      h('p', null, `${index}:${'v'.repeat(size)}`),
    ),
  );
}

test('vue adapter: slow streaming consumer receives complete output in bounded coalesced chunks', async () => {
  const out = await renderVueStream(baseCtx, paragraphs(2000, 100));
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let html = '';
  for await (const chunk of out.html as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
    html += decoder.decode(chunk, { stream: true });
    await delay(1);
  }
  html += decoder.decode();

  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  assert.ok(html.startsWith('<main>'));
  assert.ok(html.endsWith('</main>'));
  assert.equal(html.match(/<p>/g)?.length, 2000);
  assert.ok(html.includes(`<p>1999:${'v'.repeat(100)}</p>`));
  assert.ok(
    chunks.length <= Math.ceil(totalBytes / (16 * 1024)) + 4,
    `expected coalesced chunks, received ${chunks.length} for ${totalBytes} bytes`,
  );
});

test('vue adapter: unread streamed output beyond the buffer bound fails closed without retaining bytes', async () => {
  const out = await renderVueStream(baseCtx, paragraphs(6000, 1024));
  // Let Vue finish producing while nothing consumes the body.
  await delay(50);

  let receivedBytes = 0;
  await assert.rejects(async () => {
    for await (const chunk of out.html as AsyncIterable<Uint8Array>) {
      receivedBytes += chunk.byteLength;
    }
  }, /exceeded 5242880 buffered bytes/);
  assert.equal(receivedBytes, 0);
});

test('vue adapter: all-ready integrations complete ordinary output and fail closed beyond the bound', async () => {
  const createApp = (count: number) =>
    createFaceApp({
      faces: [
        createVueStreamFace({
          route: '/',
          mode: 'ssr',
          render: () => paragraphs(count, 1024),
          renderOptions: {
            integrations: [
              {
                name: 'vue-all-ready-test',
                contribute: () => ({
                  headTags: [{ type: 'title', text: 'All Ready' }],
                }),
              },
            ],
          },
        }),
      ],
    });

  const ordinary = await createApp(400).handle({ method: 'GET', path: '/' });
  assert.equal(ordinary.status, 200);
  const html = await collect(ordinary.body);
  assert.ok(html.includes('<title>All Ready</title>'));
  assert.equal(html.match(/<p>/g)?.length, 400);
  assert.ok(html.endsWith('</html>'));

  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    const oversized = await createApp(6000).handle({ method: 'GET', path: '/' });
    assert.equal(oversized.status, 500);
  } finally {
    console.error = originalConsoleError;
  }
});

test('vue adapter: consumer cancellation stops stream production and drops queued output', async () => {
  const slowItem = (index: number) => ({
    async setup() {
      await delay(5 * (index + 1));
      return () => h('p', null, `slow-${index}`);
    },
  });
  const out = await renderVueStream(
    baseCtx,
    h(
      'main',
      null,
      Array.from({ length: 20 }, (_, index) => h(slowItem(index))),
    ),
  );

  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);
  const originalEncode = TextEncoder.prototype.encode;
  let encodesAfterCancel = 0;
  let cancelled = false;
  TextEncoder.prototype.encode = function (this: TextEncoder, input?: string) {
    if (cancelled) encodesAfterCancel += 1;
    return originalEncode.call(this, input);
  };

  try {
    const iterator = (out.html as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.equal(first.done, false);
    cancelled = true;
    const returned = await iterator.return?.();
    assert.equal(returned?.done, true);

    await delay(150);
    assert.equal(encodesAfterCancel, 0);
    assert.deepEqual(await iterator.next(), { done: true, value: undefined });
    assert.deepEqual(unhandled, []);
  } finally {
    TextEncoder.prototype.encode = originalEncode;
    process.off('unhandledRejection', onUnhandled);
  }
});
