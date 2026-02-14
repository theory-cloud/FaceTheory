import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLambdaFunctionURLRequest,
  createTestEnv,
} from '@theory-cloud/apptheory';

import { createFaceApp } from '../../src/app.js';
import { utf8 } from '../../src/bytes.js';
import { createAppTheoryFaceHandler } from '../../src/apptheory/index.js';

function stripSetCookie(headers: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(headers)) {
    if (key.toLowerCase() === 'set-cookie') continue;
    out[key] = values;
  }
  return out;
}

test('apptheory adapter: buffered response matches FaceApp status/headers/cookies/body', async () => {
  const faceApp = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          status: 201,
          headers: {
            vary: ['accept-encoding', 'origin'],
            'set-cookie': ['a=1; Path=/'],
          },
          cookies: ['b=2; Path=/; HttpOnly'],
          head: { title: 'Ok' },
          html: '<main>ok</main>',
        }),
      },
    ],
  });

  const requestId = 'request-1';

  const faceResp = await faceApp.handle({
    method: 'GET',
    path: '/',
    headers: { cookie: ['promo=spring%20sale'], 'x-request-id': [requestId] },
  });

  const env = createTestEnv();
  const app = env.app();
  const handler = createAppTheoryFaceHandler({ app: faceApp });

  app.get('/', handler);

  const appResp = await env.invoke(app, {
    method: 'GET',
    path: '/',
    headers: { cookie: ['promo=spring%20sale'], 'x-request-id': [requestId] },
  });

  assert.equal(appResp.status, faceResp.status);
  assert.deepEqual(appResp.cookies, faceResp.cookies);
  assert.deepEqual(appResp.headers, stripSetCookie(faceResp.headers));

  const faceBody = faceResp.body;
  assert.ok(faceBody instanceof Uint8Array);
  assert.equal(new TextDecoder().decode(appResp.body), new TextDecoder().decode(faceBody));
  assert.equal(appResp.bodyStream ?? null, null);
});

test('apptheory adapter: Lambda Function URL streaming yields head prefix chunk before body chunks', async () => {
  const faceApp = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          head: { title: 'Stream' },
          html: (async function* () {
            yield utf8('<main>streamed</main>');
          })(),
        }),
      },
    ],
  });

  const env = createTestEnv();
  const app = env.app();
  const handler = createAppTheoryFaceHandler({ app: faceApp });

  app.get('/', handler);

  const out = await env.invokeLambdaFunctionURLStreaming(
    app,
    buildLambdaFunctionURLRequest('GET', '/'),
  );

  assert.equal(out.stream_error_code, '');
  assert.equal(out.status, 200);
  assert.equal(out.headers['content-type']?.[0], 'text/html; charset=utf-8');
  assert.ok(out.chunks.length >= 2);

  const firstChunk = new TextDecoder().decode(out.chunks[0]);
  assert.ok(firstChunk.startsWith('<!doctype html>'));
  assert.ok(firstChunk.includes('<title>Stream</title>'));
  assert.ok(firstChunk.includes('</head><body>'));
  assert.ok(!firstChunk.includes('<main>streamed</main>'));

  const fullHtml = new TextDecoder().decode(out.body);
  assert.ok(fullHtml.includes('<main>streamed</main>'));
  assert.ok(fullHtml.endsWith('</body></html>'));
});
