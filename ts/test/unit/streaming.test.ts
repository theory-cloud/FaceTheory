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
