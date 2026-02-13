import assert from 'node:assert/strict';
import test from 'node:test';

import { css, jsx } from '@emotion/react';
import { Button } from 'antd';
import * as React from 'react';

import { streamFromString, utf8 } from '../../src/bytes.js';
import { createFaceApp } from '../../src/app.js';
import { createReactStreamFace } from '../../src/adapters/react.js';
import { createAntdEmotionTokenIntegration } from '../../src/react/antd-emotion.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import { createEmotionIntegration } from '../../src/react/emotion.js';
import type { FaceBody } from '../../src/types.js';

async function collectBody(body: FaceBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createLateStylesTree(delayMs: number): React.ReactElement {
  const LazyPanel = React.lazy(async () => {
    await delay(delayMs);
    return {
      default: function LazyPanelComponent() {
        return React.createElement(
          'section',
          null,
          React.createElement(Button, { type: 'primary' }, 'Late AntD'),
          jsx('div', { css: css`color: #123abc;` }, 'Late Emotion'),
        );
      },
    };
  });

  return React.createElement(
    React.Suspense,
    { fallback: React.createElement('p', null, 'Loading late styles') },
    React.createElement(LazyPanel),
  );
}

test('FaceApp: wraps streaming HTML in full document with head first', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          headTags: [{ type: 'title', text: 'Stream' }],
          html: streamFromString('<div>streamed</div>'),
        }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 200);

  assert.ok(!(resp.body instanceof Uint8Array));

  const firstChunk = await (resp.body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]().next();
  assert.equal(firstChunk.done, false);
  const first = new TextDecoder().decode(firstChunk.value);
  assert.ok(first.startsWith('<!doctype html>'));
  assert.ok(first.includes('<title>Stream</title>'));
  assert.ok(!first.includes('streamed'));

  const full = new TextDecoder().decode(await collectBody(resp.body));
  assert.ok(full.includes('<div>streamed</div>'));
});

test('FaceApp: streaming + CSP nonce applies to hydration scripts', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          html: (async function* () {
            yield utf8('<main>ok</main>');
          })(),
          hydration: { data: { a: 1 }, bootstrapModule: '/assets/entry.js' },
        }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/', cspNonce: 'nonce-stream' });
  const full = new TextDecoder().decode(await collectBody(resp.body));
  assert.ok(full.includes('id="__FACETHEORY_DATA__"'));
  assert.ok(full.includes('nonce="nonce-stream"'));
  assert.ok(full.includes('src="/assets/entry.js"'));
});

test('react adapter: streaming includes AntD + Emotion styles in head before body', async () => {
  function EmotionBox() {
    return jsx('div', { css: css`color: rgb(1, 2, 3);` }, 'Emotion');
  }

  const app = createFaceApp({
    faces: [
      createReactStreamFace({
        route: '/',
        mode: 'ssr',
        render: () =>
          React.createElement(
            'div',
            null,
            React.createElement(Button, { type: 'primary' }, 'OK'),
            jsx(EmotionBox, {}),
          ),
        renderOptions: {
          headTags: [{ type: 'title', text: 'Stream Styles' }],
          integrations: [
            createAntdEmotionTokenIntegration(),
            createAntdIntegration({ hashed: false }),
            createEmotionIntegration(),
          ],
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/', cspNonce: 'nonce-stream-styles' });
  assert.ok(!(resp.body instanceof Uint8Array));

  const it = (resp.body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
  const firstChunk = await it.next();
  assert.equal(firstChunk.done, false);

  const dec = new TextDecoder();
  const first = dec.decode(firstChunk.value);

  assert.ok(first.startsWith('<!doctype html>'));
  assert.ok(first.includes('<title>Stream Styles</title>'));
  assert.ok(first.includes('data-emotion='));
  assert.ok(first.includes('nonce="nonce-stream-styles"'));
  assert.ok(first.includes('data-rc-order=') || first.includes('data-rc-priority='));
  assert.ok(!first.includes('Emotion'));
  assert.ok(!first.includes('OK'));

  const parts: string[] = [first];
  for (;;) {
    const next = await it.next();
    if (next.done) break;
    parts.push(dec.decode(next.value, { stream: true }));
  }
  parts.push(dec.decode());

  const full = parts.join('');
  assert.ok(full.includes('Emotion'));
  assert.ok(full.includes('OK'));
});

test('react adapter: default all-ready style strategy captures late Suspense styles in first chunk', async () => {
  const app = createFaceApp({
    faces: [
      createReactStreamFace({
        route: '/',
        mode: 'ssr',
        render: () => createLateStylesTree(20),
        renderOptions: {
          headTags: [{ type: 'title', text: 'Late Styles' }],
          integrations: [createAntdIntegration({ hashed: false }), createEmotionIntegration()],
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/', cspNonce: 'nonce-r5-all-ready' });
  assert.ok(!(resp.body instanceof Uint8Array));

  const iterator = (resp.body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
  const firstChunk = await iterator.next();
  assert.equal(firstChunk.done, false);

  const decoder = new TextDecoder();
  const first = decoder.decode(firstChunk.value);
  assert.ok(first.includes('<title>Late Styles</title>'));
  assert.ok(first.includes('data-emotion='));
  assert.ok(first.includes('#123abc'));
  assert.ok(first.includes('ant-btn'));
  assert.ok(first.includes('nonce="nonce-r5-all-ready"'));
  assert.ok(!first.includes('Late Emotion'));

  const chunks: string[] = [first];
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    chunks.push(decoder.decode(next.value, { stream: true }));
  }
  chunks.push(decoder.decode());

  const full = chunks.join('');
  assert.ok(full.includes('Late Emotion'));
  assert.ok(full.includes('Late AntD'));
  assert.ok(!full.includes('Loading late styles'));
});

test('react adapter: shell strategy is configurable and does not include late styles in head', async () => {
  const app = createFaceApp({
    faces: [
      createReactStreamFace({
        route: '/',
        mode: 'ssr',
        render: () => createLateStylesTree(20),
        renderOptions: {
          styleStrategy: 'shell',
          integrations: [createAntdIntegration({ hashed: false }), createEmotionIntegration()],
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.ok(!(resp.body instanceof Uint8Array));

  const iterator = (resp.body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
  const firstChunk = await iterator.next();
  assert.equal(firstChunk.done, false);

  const decoder = new TextDecoder();
  const first = decoder.decode(firstChunk.value);
  assert.ok(!first.includes('data-emotion='));
  assert.ok(!first.includes('#123abc'));
  assert.ok(!first.includes('ant-btn'));
});

test('react adapter: streaming applies CSP nonce to all inline style/script tags', async () => {
  const nonce = 'nonce-r5-inline';
  const app = createFaceApp({
    faces: [
      createReactStreamFace({
        route: '/',
        mode: 'ssr',
        render: () => createLateStylesTree(20),
        renderOptions: {
          styleStrategy: 'shell',
          hydration: { data: { hello: 'world' }, bootstrapModule: '/assets/entry-client.js' },
          integrations: [createAntdIntegration({ hashed: false }), createEmotionIntegration()],
        },
      }),
    ],
  });

  const response = await app.handle({ method: 'GET', path: '/', cspNonce: nonce });
  const full = new TextDecoder().decode(await collectBody(response.body));

  const styleTags = Array.from(full.matchAll(/<style\b[^>]*>/g)).map((match) => match[0]);
  const scriptTags = Array.from(full.matchAll(/<script\b[^>]*>/g)).map((match) => match[0]);

  assert.ok(styleTags.length > 0);
  assert.ok(scriptTags.length > 0);
  for (const tag of [...styleTags, ...scriptTags]) {
    assert.ok(tag.includes(`nonce="${nonce}"`), `missing nonce on tag: ${tag}`);
  }
});

test('FaceApp: streaming body error emits marker and closes document', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          headTags: [{ type: 'title', text: 'Err' }],
          html: (async function* () {
            yield utf8('<main>ok</main>');
            throw new Error('boom');
          })(),
        }),
      },
    ],
  });

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const resp = await app.handle({ method: 'GET', path: '/' });
    assert.ok(!(resp.body instanceof Uint8Array));

    const full = new TextDecoder().decode(await collectBody(resp.body));
    assert.ok(full.includes('<main>ok</main>'));
    assert.ok(full.includes('data-facetheory-stream-error="true"'));
    assert.ok(full.endsWith('</body></html>'));
  } finally {
    console.error = originalConsoleError;
  }
});
