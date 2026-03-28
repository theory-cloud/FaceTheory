import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import { parseCookiesFromHeaders } from '../../src/types.js';

function decodeBody(body: Uint8Array): string {
  return new TextDecoder().decode(body);
}

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
  assert.ok(String(resp.headers['x-request-id']?.[0] ?? '').trim());

  const body = decodeBody(resp.body as Uint8Array);
  assert.ok(body.includes('<title>Home</title>'));
  assert.ok(body.includes('<div>hi</div>'));
});

test('FaceApp: propagates x-request-id and injects one when missing', async () => {
  let seen: string | null = null;
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: (ctx) => {
          seen = String(ctx.request.headers['x-request-id']?.[0] ?? '').trim() || null;
          return { html: '<div>ok</div>' };
        },
      },
    ],
  });

  const provided = await app.handle({
    method: 'GET',
    path: '/',
    headers: { 'x-request-id': ['req-1'] },
  });
  assert.equal(seen, 'req-1');
  assert.equal(provided.headers['x-request-id']?.[0], 'req-1');

  const missing = await app.handle({ method: 'GET', path: '/' });
  const generated = String(missing.headers['x-request-id']?.[0] ?? '').trim();
  assert.ok(generated.length > 0);
});

test('FaceApp: load/render errors return deterministic 500 HTML', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/load-error',
        mode: 'ssr',
        load: async () => {
          throw new Error('sensitive load message');
        },
        render: () => ({ html: '<div>unreachable</div>' }),
      },
      {
        route: '/render-error',
        mode: 'ssr',
        render: async () => {
          throw new Error('sensitive render message');
        },
      },
    ],
  });

  const loadResp = await app.handle({ method: 'GET', path: '/load-error' });
  const renderResp = await app.handle({ method: 'GET', path: '/render-error' });

  assert.equal(loadResp.status, 500);
  assert.equal(renderResp.status, 500);
  assert.ok(loadResp.body instanceof Uint8Array);
  assert.ok(renderResp.body instanceof Uint8Array);
  assert.equal(loadResp.headers['content-type']?.[0], 'text/html; charset=utf-8');
  assert.equal(renderResp.headers['content-type']?.[0], 'text/html; charset=utf-8');

  const loadHtml = decodeBody(loadResp.body as Uint8Array);
  const renderHtml = decodeBody(renderResp.body as Uint8Array);
  assert.equal(loadHtml, renderHtml);
  assert.ok(loadHtml.includes('<h1>Internal Server Error</h1>'));
  assert.ok(loadHtml.includes('data-facetheory-error="true"'));
  assert.ok(!loadHtml.includes('sensitive load message'));
  assert.ok(!loadHtml.includes('sensitive render message'));
});

test('FaceApp: merges set-cookie header values and cookies array without joining', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          headers: {
            'set-cookie': ['a=1; Path=/; HttpOnly'],
            'Set-Cookie': ['b=2; Path=/'],
          },
          cookies: ['c=3; Path=/; Secure'],
          html: '<div>cookies</div>',
        }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.deepEqual(resp.headers['set-cookie'], [
    'a=1; Path=/; HttpOnly',
    'b=2; Path=/',
    'c=3; Path=/; Secure',
  ]);
  assert.deepEqual(resp.cookies, [
    'a=1; Path=/; HttpOnly',
    'b=2; Path=/',
    'c=3; Path=/; Secure',
  ]);
});

test('FaceApp: parses query from path when request.query is omitted', async () => {
  let seenQuery: Record<string, string[]> = {};

  const app = createFaceApp({
    faces: [
      {
        route: '/x',
        mode: 'ssr',
        render: (ctx) => {
          seenQuery = ctx.request.query;
          return { html: '<div>ok</div>' };
        },
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/x?a=1&b=2&a=3' });
  assert.equal(resp.status, 200);
  assert.deepEqual(seenQuery, { a: ['1', '3'], b: ['2'] });
});

test('FaceApp: parses request cookies from cookie headers by default', async () => {
  let seenCookies: Record<string, string> = {};

  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: (ctx) => {
          seenCookies = ctx.request.cookies;
          return { html: '<div>ok</div>' };
        },
      },
    ],
  });

  const resp = await app.handle({
    method: 'GET',
    path: '/',
    headers: { cookie: ['session=abc123; theme=light', 'promo=spring%20sale'] },
  });
  assert.equal(resp.status, 200);
  assert.deepEqual(seenCookies, {
    session: 'abc123',
    theme: 'light',
    promo: 'spring sale',
  });
});

test('FaceApp: emits document shell attrs through the public render contract', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          lang: 'ar',
          htmlAttrs: { dir: 'rtl', 'data-theme': 'midnight' },
          bodyAttrs: { class: 'shell-body', 'data-density': 'compact' },
          html: '<div>ok</div>',
        }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  const body = decodeBody(resp.body as Uint8Array);

  assert.ok(
    body.includes('<html data-theme="midnight" dir="rtl" lang="ar">'),
    body,
  );
  assert.ok(
    body.includes('<body class="shell-body" data-density="compact"><div>ok</div></body>'),
    body,
  );
});

test('parseCookiesFromHeaders: supports mixed case cookie header names', () => {
  const parsed = parseCookiesFromHeaders({
    Cookie: ['token=xyz'],
    cookie: ['theme=dark'],
    'x-other': ['ok'],
  });

  assert.deepEqual(parsed, {
    token: 'xyz',
    theme: 'dark',
  });
});

test('FaceApp: streaming body error before first chunk falls back to buffered 500', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          html: (async function* () {
            await Promise.resolve();
            throw new Error('stream failed before bytes');
            // Unreachable, but required to satisfy eslint `require-yield`.
            // This test depends on the stream failing before the first chunk.
            yield new Uint8Array();
          })(),
        }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 500);
  assert.ok(resp.body instanceof Uint8Array);
  assert.equal(resp.headers['content-type']?.[0], 'text/html; charset=utf-8');
  assert.ok(decodeBody(resp.body as Uint8Array).includes('<h1>Internal Server Error</h1>'));
});
