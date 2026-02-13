import assert from 'node:assert/strict';
import test from 'node:test';

import { streamFromString, utf8 } from '../../src/bytes.js';
import { createFaceApp } from '../../src/app.js';
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

