import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import * as core from '../../src/index.js';
import {
  emptyResourceResponse,
  jsonResourceResponse,
  methodNotAllowedResourceResponse,
  textResourceResponse,
} from '../../src/resource.js';
import type { FaceResourceRoute } from '../../src/types.js';

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function decodeBody(body: Uint8Array): string {
  return new TextDecoder().decode(body);
}

function resource(
  route: string,
  body = 'resource',
  headers: Record<string, string[]> = {
    'content-type': ['text/plain; charset=utf-8'],
  },
): FaceResourceRoute {
  return {
    route,
    handle: () => ({
      status: 200,
      headers,
      cookies: [],
      body: utf8(body),
      isBase64: false,
    }),
  };
}

test('FaceApp resources: return raw FaceResponse bodies without document wrapping', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({ head: { title: 'Home' }, html: '<main>home</main>' }),
      },
    ],
    resources: [
      {
        route: '/api/status',
        handle: (ctx) => ({
          status: 201,
          headers: { 'content-type': ['application/json; charset=utf-8'] },
          cookies: [],
          body: utf8(
            JSON.stringify({
              ok: true,
              method: ctx.request.method,
              path: ctx.request.path,
            }),
          ),
          isBase64: false,
        }),
      },
    ],
  });

  const response = await app.handle({ method: 'get', path: '/api/status' });
  const body = decodeBody(response.body as Uint8Array);

  assert.equal(response.status, 201);
  assert.equal(
    response.headers['content-type']?.[0],
    'application/json; charset=utf-8',
  );
  assert.ok(String(response.headers['x-request-id']?.[0] ?? '').trim());
  assert.equal(body, '{"ok":true,"method":"GET","path":"/api/status"}');
  assert.equal(body.includes('<!doctype html>'), false);
  assert.equal(body.includes('<main>'), false);
});

test('FaceApp resources: preserve deterministic route precedence beside faces', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/{proxy+}',
        mode: 'ssr',
        render: (ctx) => ({ html: `<main>face:${ctx.proxy}</main>` }),
      },
    ],
    resources: [
      {
        route: '/_facetheory/ssr-data/{key+}',
        handle: (ctx) => ({
          status: 200,
          headers: { 'content-type': ['application/octet-stream'] },
          cookies: [],
          body: utf8(
            [
              `param=${ctx.params.key}`,
              `proxy=${ctx.proxy}`,
              `query=${ctx.request.query.v?.[0] ?? ''}`,
            ].join('\n'),
          ),
          isBase64: false,
        }),
      },
    ],
  });

  const resourceResponse = await app.handle({
    method: 'GET',
    path: '/_facetheory/ssr-data/home.json?v=1',
  });
  const resourceBody = decodeBody(resourceResponse.body as Uint8Array);

  assert.equal(resourceResponse.status, 200);
  assert.equal(
    resourceResponse.headers['content-type']?.[0],
    'application/octet-stream',
  );
  assert.equal(resourceBody, 'param=home.json\nproxy=home.json\nquery=1');
  assert.equal(resourceBody.includes('<!doctype html>'), false);

  const faceResponse = await app.handle({ method: 'GET', path: '/dashboard' });
  const faceBody = decodeBody(faceResponse.body as Uint8Array);

  assert.equal(faceResponse.status, 200);
  assert.equal(
    faceResponse.headers['content-type']?.[0],
    'text/html; charset=utf-8',
  );
  assert.ok(faceBody.includes('<main>face:dashboard</main>'));
  assert.ok(faceBody.includes('<!doctype html>'));
});

test('FaceApp resources: more specific resources can coexist with dynamic faces', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/assets/{name}',
        mode: 'ssr',
        render: (ctx) => ({
          html: `<main>asset face ${ctx.params.name}</main>`,
        }),
      },
    ],
    resources: [resource('/assets/manifest.json', '{"assets":[]}')],
  });

  const manifestResponse = await app.handle({
    method: 'GET',
    path: '/assets/manifest.json',
  });
  assert.equal(
    decodeBody(manifestResponse.body as Uint8Array),
    '{"assets":[]}',
  );

  const faceResponse = await app.handle({
    method: 'GET',
    path: '/assets/logo',
  });
  assert.ok(
    decodeBody(faceResponse.body as Uint8Array).includes(
      '<main>asset face logo</main>',
    ),
  );
});

test('FaceApp resources: duplicate face/resource routes fail closed', () => {
  assert.throws(
    () =>
      createFaceApp({
        faces: [
          {
            route: '/api/status',
            mode: 'ssr',
            render: () => ({ html: '<main>status</main>' }),
          },
        ],
        resources: [resource('/api/status')],
      }),
    /duplicate face\/resource route: \/api\/status/,
  );
});

test('FaceApp resources: ambiguous face/resource routes fail closed', () => {
  assert.throws(
    () =>
      createFaceApp({
        faces: [
          {
            route: '/api/{id}',
            mode: 'ssr',
            render: () => ({ html: '<main>api</main>' }),
          },
        ],
        resources: [resource('/api/{name}')],
      }),
    /ambiguous face\/resource routes: \/api\/\{id\} and \/api\/\{name\}/,
  );
});

test('resource helpers: are exported from the public core surface', () => {
  assert.equal(core.jsonResourceResponse({ ok: true }).status, 200);
  assert.equal(core.textResourceResponse('ok').status, 200);
  assert.equal(core.emptyResourceResponse().status, 204);
  assert.equal(core.methodNotAllowedResourceResponse(['GET']).status, 405);
});

test('resource helpers: JSON responses use safe serialization and stable headers', () => {
  const response = jsonResourceResponse(
    { html: '<script>&</script>', line: '\u2028\u2029' },
    {
      status: 201,
      headers: {
        'X-FaceTheory-Resource': 'yes',
        'Content-Type': 'text/html',
        'Set-Cookie': ['from-header=1'],
      },
      cookies: ['from-option=1'],
      cacheControl: 'private, max-age=0',
    },
  );

  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(response.headers), [
    'cache-control',
    'content-type',
    'set-cookie',
    'x-facetheory-resource',
  ]);
  assert.deepEqual(response.headers['content-type'], [
    'application/json; charset=utf-8',
  ]);
  assert.deepEqual(response.headers['cache-control'], ['private, max-age=0']);
  assert.deepEqual(response.headers['set-cookie'], [
    'from-header=1',
    'from-option=1',
  ]);
  assert.deepEqual(response.cookies, ['from-header=1', 'from-option=1']);
  assert.equal(response.isBase64, false);
  assert.equal(
    decodeBody(response.body as Uint8Array),
    '{"html":"\\u003cscript\\u003e\\u0026\\u003c/script\\u003e","line":"\\u2028\\u2029"}',
  );
});

test('resource helpers: text and empty responses set deterministic cache and content headers', () => {
  const text = textResourceResponse('hello', {
    headers: { 'X-Trace': ['abc'] },
  });

  assert.equal(text.status, 200);
  assert.deepEqual(text.headers, {
    'cache-control': ['no-store'],
    'content-type': ['text/plain; charset=utf-8'],
    'x-trace': ['abc'],
  });
  assert.equal(decodeBody(text.body as Uint8Array), 'hello');

  const empty = emptyResourceResponse({
    headers: { 'content-type': 'text/plain', 'x-empty': '1' },
  });

  assert.equal(empty.status, 204);
  assert.deepEqual(empty.headers, {
    'cache-control': ['no-store'],
    'x-empty': ['1'],
  });
  assert.equal((empty.body as Uint8Array).byteLength, 0);
});

test('resource helpers: method-not-allowed responses canonicalize the Allow header', () => {
  const response = methodNotAllowedResourceResponse(
    ['post', 'GET', 'get', 'PATCH'],
    {
      headers: {
        allow: 'DELETE',
        'cache-control': 'public, max-age=60',
      },
    },
  );

  assert.equal(response.status, 405);
  assert.deepEqual(response.headers, {
    allow: ['GET, PATCH, POST'],
    'cache-control': ['no-store'],
    'content-type': ['text/plain; charset=utf-8'],
  });
  assert.equal(decodeBody(response.body as Uint8Array), 'Method Not Allowed');
});

test('resource helpers: reject unsafe JSON and header inputs', () => {
  assert.throws(
    () => jsonResourceResponse(undefined),
    /JSON-serializable at the top level/,
  );
  assert.throws(
    () => textResourceResponse('bad', { headers: { 'x-bad\r\nname': '1' } }),
    /invalid resource response header name/,
  );
  assert.throws(
    () => textResourceResponse('bad', { headers: { 'x-bad': '1\n2' } }),
    /must not contain CR or LF/,
  );
  assert.throws(
    () => methodNotAllowedResourceResponse(['GET', 'bad method']),
    /invalid allowed resource method/,
  );
});

test('FaceApp resources: helpers return raw method-not-allowed responses', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({ html: '<main>home</main>' }),
      },
    ],
    resources: [
      {
        route: '/api/status',
        handle: (ctx) =>
          ctx.request.method === 'GET'
            ? jsonResourceResponse({ ok: true })
            : methodNotAllowedResourceResponse(['GET']),
      },
    ],
  });

  const response = await app.handle({ method: 'POST', path: '/api/status' });
  const body = decodeBody(response.body as Uint8Array);

  assert.equal(response.status, 405);
  assert.equal(response.headers.allow?.[0], 'GET');
  assert.equal(
    response.headers['content-type']?.[0],
    'text/plain; charset=utf-8',
  );
  assert.equal(body, 'Method Not Allowed');
  assert.equal(body.includes('<!doctype html>'), false);
});
