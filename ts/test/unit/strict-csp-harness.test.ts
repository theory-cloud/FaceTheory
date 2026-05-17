import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertStrictCspDocument,
  createStrictCspFixtureFetch,
  exerciseStrictCspExternalNavigation,
} from '../helpers/strict-csp.js';

test('strict CSP harness: rejects inline script/style/raw head/event/style attributes', () => {
  const valid = `<!doctype html><html lang="en"><head><title>Strict</title><link href="/assets/app.css" rel="stylesheet"><script src="/assets/app.js" type="module"></script></head><body><main data-facetheory-view><a href="/next">Next</a></main></body></html>`;
  assert.doesNotThrow(() =>
    assertStrictCspDocument(valid, { url: 'http://localhost/' }),
  );

  assert.throws(
    () =>
      assertStrictCspDocument(
        `<!doctype html><html><head><script>window.inline=true</script></head><body></body></html>`,
      ),
    /inline script tag|script body/,
  );

  assert.throws(
    () =>
      assertStrictCspDocument(
        `<!doctype html><html><head><style>body{color:red}</style></head><body></body></html>`,
      ),
    /inline style tag/,
  );

  assert.throws(
    () =>
      assertStrictCspDocument(
        `<!doctype html><html><head><!-- raw --><title>Raw</title></head><body></body></html>`,
      ),
    /raw head comment/,
  );

  assert.throws(
    () =>
      assertStrictCspDocument(
        `<!doctype html><html><head><title>Unsafe attrs</title></head><body><main data-facetheory-view onclick="run()" style="color:red"></main></body></html>`,
      ),
    /inline event handler attribute|inline style attribute/,
  );
});

test('strict CSP harness: fixture fetch serves same-origin HTML and hydration JSON', async () => {
  const { fetcher, requests } = createStrictCspFixtureFetch(
    {
      '/next':
        '<!doctype html><html><head><title>Next</title></head><body>Next</body></html>',
      '/_facetheory/data/next.json': { page: 'next' },
    },
    { baseUrl: 'http://localhost/' },
  );

  const htmlResp = await fetcher('http://localhost/next');
  assert.equal(
    htmlResp.headers.get('content-type'),
    'text/html; charset=utf-8',
  );
  assert.equal(
    await htmlResp.text(),
    '<!doctype html><html><head><title>Next</title></head><body>Next</body></html>',
  );

  const jsonResp = await fetcher('http://localhost/_facetheory/data/next.json');
  assert.deepEqual(await jsonResp.json(), { page: 'next' });
  assert.deepEqual(requests, [
    'http://localhost/next',
    'http://localhost/_facetheory/data/next.json',
  ]);
});

test('strict CSP harness: navigates with external hydration before module hook', async () => {
  const currentHtml = `<!doctype html>
    <html lang="en">
      <head>
        <title>Home</title>
        <link href="/assets/app.css" rel="stylesheet">
        <link id="__FACETHEORY_DATA_URL__" rel="facetheory-hydration" href="/_facetheory/data/home.json" type="application/json">
        <script src="/assets/app.js" type="module"></script>
      </head>
      <body><main data-facetheory-view><a href="/next" id="next-link">Next</a><p>Home</p></main></body>
    </html>`;
  const nextHtml = `<!doctype html>
    <html lang="en">
      <head>
        <title>Next</title>
        <link href="/assets/app.css" rel="stylesheet">
        <link id="__FACETHEORY_DATA_URL__" rel="facetheory-hydration" href="/_facetheory/data/next.json" type="application/json">
        <script src="/assets/app.js" type="module"></script>
      </head>
      <body><main data-facetheory-view><p>Next Page</p></main></body>
    </html>`;

  const result = await exerciseStrictCspExternalNavigation({
    currentHtml,
    nextHtml,
    nextUrl: 'http://localhost/next',
    dataByUrl: {
      '/_facetheory/data/next.json': { page: 'next' },
    },
  });

  try {
    assert.deepEqual(result.fetched, [
      'http://localhost/next',
      'http://localhost/_facetheory/data/next.json',
    ]);
    assert.equal(result.dom.window.location.pathname, '/next');
    assert.deepEqual(result.hydrated, [
      {
        data: { page: 'next' },
        text: 'Next Page',
        url: 'http://localhost/next',
      },
    ]);
  } finally {
    result.dom.window.close();
  }
});
