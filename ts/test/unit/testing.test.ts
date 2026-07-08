import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertHydrationEquivalent,
  assertStrictCspDocument,
  buildFaceRequest,
  createStrictCspFixtureFetch,
  renderFace,
} from '../../src/testing/index.js';
import type { FaceModule } from '../../src/types.js';

test('testing subpath: buildFaceRequest and renderFace render a Face without Lambda events', async () => {
  const request = buildFaceRequest({
    url: 'https://example.test/hello?name=Ada&tag=one&tag=two',
    headers: { cookie: 'session=test' },
    cspNonce: 'nonce-test',
  });

  assert.equal(request.method, 'GET');
  assert.equal(request.path, '/hello');
  assert.deepEqual(request.query, { name: ['Ada'], tag: ['one', 'two'] });
  assert.deepEqual(request.headers?.['x-request-id'], [
    'facetheory-test-request',
  ]);

  const face: FaceModule<{ name: string }> = {
    route: '/hello',
    mode: 'ssr',
    load: (ctx) => ({ name: ctx.request.query.name?.[0] ?? 'unknown' }),
    render: (_ctx, data) => ({
      head: { title: 'Hello' },
      html: `<main id="root"><h1>Hello ${data.name}</h1></main>`,
    }),
  };

  const rendered = await renderFace(face, { request });

  assert.equal(rendered.status, 200);
  assert.equal(rendered.request.path, '/hello');
  assert.match(rendered.html, /<title>Hello<\/title>/);
  assert.match(rendered.html, /<h1>Hello Ada<\/h1>/);
  assert.deepEqual(rendered.headers['x-request-id'], [
    'facetheory-test-request',
  ]);
});

test('testing subpath: assertHydrationEquivalent detects DOM drift and hydration warnings', async () => {
  const html =
    '<!doctype html><html><body><main id="root"><span>Stable</span></main></body></html>';

  await assertHydrationEquivalent({
    html,
    selector: '#root',
    hydrate: () => undefined,
  });

  await assert.rejects(
    () =>
      assertHydrationEquivalent({
        html,
        selector: '#root',
        hydrate: ({ container }) => {
          const span = container.querySelector('span');
          if (span) span.textContent = 'Changed';
        },
      }),
    /hydration changed the tested DOM subtree/,
  );

  await assert.rejects(
    () =>
      assertHydrationEquivalent({
        html,
        selector: '#root',
        hydrate: ({ window }) => {
          window.console.error(
            'Hydration failed because server HTML did not match',
          );
        },
      }),
    /framework mismatch warnings/,
  );
});

test('testing subpath: strict CSP assertions and fixture fetch are reusable by consumers', async () => {
  await assertStrictCspDocument(
    '<!doctype html><html><head><script src="/app.js"></script><link rel="stylesheet" href="/app.css"></head><body><main id="root"></main></body></html>',
  );

  await assert.rejects(
    () =>
      assertStrictCspDocument(
        '<!doctype html><html><head><script>window.__bad = true</script></head><body></body></html>',
      ),
    /inline script/,
  );

  const { fetcher, requests } = createStrictCspFixtureFetch({
    '/data.json': { ok: true },
  });
  const response = await fetcher('http://localhost/data.json');
  assert.equal(
    response.headers.get('content-type'),
    'application/json; charset=utf-8',
  );
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(requests, ['http://localhost/data.json']);
});
