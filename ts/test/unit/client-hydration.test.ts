import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import {
  fetchExternalFaceHydrationData,
  loadFaceHydrationData,
  readFaceExternalHydrationDataUrl,
  readFaceInlineHydrationData,
  reportHydrationFailure,
  resolveSameOriginFaceHydrationUrl,
} from '../../src/client/index.js';

function responseWithUrl(response: Response, url: string): Response {
  Object.defineProperty(response, 'url', {
    configurable: true,
    value: url,
  });
  return response;
}

test('client hydration loader: reads inline hydration before external links', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <head>
          <script id="__FACETHEORY_DATA__" type="application/json">{"subject":"synthetic-user","roles":["reader"]}</script>
          <link id="__FACETHEORY_DATA_URL__" rel="facetheory-hydration" href="https://evil.test/hydration.json" type="application/json">
        </head>
        <body></body>
      </html>`,
    { url: 'https://app.test/account' },
  );

  try {
    let fetchCalls = 0;
    const data = await loadFaceHydrationData<{
      roles: string[];
      subject: string;
    }>({
      document: dom.window.document,
      fetcher: async () => {
        fetchCalls += 1;
        return new Response('{}', {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      },
    });

    assert.deepEqual(data, { subject: 'synthetic-user', roles: ['reader'] });
    assert.deepEqual(readFaceInlineHydrationData(dom.window.document), {
      subject: 'synthetic-user',
      roles: ['reader'],
    });
    assert.equal(fetchCalls, 0);
  } finally {
    dom.window.close();
  }
});

test('client hydration loader: treats spoofed inline markers as absent', async () => {
  for (const marker of [
    '<div id="__FACETHEORY_DATA__">{"subject":"spoofed-div"}</div>',
    '<script id="__FACETHEORY_DATA__" type="text/plain">{"subject":"spoofed-type"}</script>',
  ]) {
    const dom = new JSDOM(
      `<!doctype html>
        <html>
          <head>
            ${marker}
            <link id="__FACETHEORY_DATA_URL__" rel="facetheory-hydration" href="/_facetheory/ssr-data/home.json" type="application/json">
          </head>
          <body></body>
        </html>`,
      { url: 'https://app.test/account' },
    );

    try {
      const fetched: string[] = [];
      const data = await loadFaceHydrationData<{ route: string }>({
        document: dom.window.document,
        fetcher: async (input) => {
          fetched.push(String(input));
          return responseWithUrl(
            new Response(JSON.stringify({ route: 'external-home' }), {
              headers: { 'content-type': 'application/json' },
              status: 200,
            }),
            'https://app.test/_facetheory/ssr-data/home.json',
          );
        },
      });

      assert.equal(readFaceInlineHydrationData(dom.window.document), null);
      assert.deepEqual(data, { route: 'external-home' });
      assert.deepEqual(fetched, [
        'https://app.test/_facetheory/ssr-data/home.json',
      ]);
    } finally {
      dom.window.close();
    }
  }
});

test('client hydration loader: fetches same-origin external hydration data', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <head>
          <link rel="facetheory-hydration" href="/_facetheory/ssr-data/home.json" type="application/json">
        </head>
        <body></body>
      </html>`,
    { url: 'https://app.test/home' },
  );

  try {
    const fetched: Array<{ init: RequestInit | undefined; input: string }> = [];
    const data = await loadFaceHydrationData<{ route: string }>({
      document: dom.window.document,
      requestInit: {
        headers: { 'x-synthetic-test': 'yes' },
      },
      fetcher: async (input, init) => {
        fetched.push({ input: String(input), init });
        return responseWithUrl(
          new Response(JSON.stringify({ route: 'home' }), {
            headers: { 'content-type': 'application/json; charset=utf-8' },
            status: 200,
          }),
          'https://app.test/_facetheory/ssr-data/home.json',
        );
      },
    });

    assert.deepEqual(data, { route: 'home' });
    assert.equal(
      readFaceExternalHydrationDataUrl(dom.window.document),
      '/_facetheory/ssr-data/home.json',
    );
    assert.deepEqual(
      fetched.map((entry) => entry.input),
      ['https://app.test/_facetheory/ssr-data/home.json'],
    );
    assert.equal(fetched[0]?.init?.credentials, 'same-origin');
    assert.equal(fetched[0]?.init?.redirect, 'follow');
    assert.equal(
      (fetched[0]?.init?.headers as Record<string, string> | undefined)?.accept,
      'application/json',
    );
    assert.equal(
      (fetched[0]?.init?.headers as Record<string, string> | undefined)?.[
        'x-synthetic-test'
      ],
      'yes',
    );
  } finally {
    dom.window.close();
  }
});

test('client hydration loader: returns null when no hydration marker is present', async () => {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body></body></html>',
    {
      url: 'https://app.test/empty',
    },
  );

  try {
    assert.equal(
      await loadFaceHydrationData({ document: dom.window.document }),
      null,
    );
  } finally {
    dom.window.close();
  }
});

test('client hydration loader: rejects malformed inline hydration JSON', () => {
  const dom = new JSDOM(
    `<!doctype html><script id="__FACETHEORY_DATA__" type="application/json">not-json</script>`,
    { url: 'https://app.test/' },
  );

  try {
    assert.throws(
      () => readFaceInlineHydrationData({ document: dom.window.document }),
      /inline hydration data was not valid JSON/,
    );
  } finally {
    dom.window.close();
  }
});

test('client hydration loader: rejects cross-origin external hydration URLs before fetch', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <link rel="facetheory-hydration" href="https://evil.test/hydration.json" type="application/json">`,
    { url: 'https://app.test/' },
  );

  try {
    let fetchCalls = 0;
    await assert.rejects(
      loadFaceHydrationData({
        document: dom.window.document,
        fetcher: async () => {
          fetchCalls += 1;
          return new Response('{}', {
            headers: { 'content-type': 'application/json' },
            status: 200,
          });
        },
      }),
      /hydration data URL resolved cross-origin/,
    );
    assert.equal(fetchCalls, 0);
  } finally {
    dom.window.close();
  }
});

test('client hydration loader: rejects unsafe and malformed external hydration URLs', () => {
  for (const value of [
    'data:application/json,%7B%7D',
    'javascript:alert(1)',
    'http://[::1',
  ]) {
    assert.throws(
      () =>
        resolveSameOriginFaceHydrationUrl(value, {
          allowedOrigin: 'https://app.test',
          baseUrl: 'https://app.test/account',
        }),
      /hydration data URL (?:must use http\(s\)|is invalid)/,
    );
  }
});

test('client hydration loader: rejects redirected cross-origin hydration responses', async () => {
  await assert.rejects(
    fetchExternalFaceHydrationData('/_facetheory/ssr-data/home.json', {
      allowedOrigin: 'https://app.test',
      baseUrl: 'https://app.test/home',
      fetcher: async () =>
        responseWithUrl(
          new Response(JSON.stringify({ route: 'home' }), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
          'https://evil.test/_facetheory/ssr-data/home.json',
        ),
    }),
    /hydration data fetch redirected or resolved cross-origin/,
  );
});

test('client hydration loader: rejects invalid fetch response shapes', async () => {
  await assert.rejects(
    fetchExternalFaceHydrationData('/_facetheory/ssr-data/home.json', {
      allowedOrigin: 'https://app.test',
      baseUrl: 'https://app.test/home',
      fetcher: async () =>
        ({
          headers: new Headers({ 'content-type': 'application/json' }),
          ok: true,
          status: 200,
          url: 'https://app.test/_facetheory/ssr-data/home.json',
        }) as Response,
    }),
    /fetch returned an invalid response/,
  );
});

test('client hydration loader: rejects non-JSON and invalid JSON responses', async () => {
  await assert.rejects(
    fetchExternalFaceHydrationData('/_facetheory/ssr-data/home.json', {
      allowedOrigin: 'https://app.test',
      baseUrl: 'https://app.test/home',
      fetcher: async () =>
        responseWithUrl(
          new Response('<!doctype html>', {
            headers: { 'content-type': 'text/html' },
            status: 200,
          }),
          'https://app.test/_facetheory/ssr-data/home.json',
        ),
    }),
    /hydration data response was not JSON/,
  );

  await assert.rejects(
    fetchExternalFaceHydrationData('/_facetheory/ssr-data/home.json', {
      allowedOrigin: 'https://app.test',
      baseUrl: 'https://app.test/home',
      fetcher: async () =>
        responseWithUrl(
          new Response('not-json', {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
          'https://app.test/_facetheory/ssr-data/home.json',
        ),
    }),
    /hydration data response was not valid JSON/,
  );
});

test('client hydration beacon: reports opted-in hydrate failures with same-origin sendBeacon', () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><main id="root"></main></body></html>',
    {
      url: 'https://app.test/checkout?cart=cart_test',
    },
  );

  try {
    const beacons: Array<{ body: string; url: string }> = [];
    Object.defineProperty(dom.window.navigator, 'sendBeacon', {
      configurable: true,
      value: (url: string | URL, data?: BodyInit | null) => {
        beacons.push({ url: String(url), body: String(data ?? '') });
        return true;
      },
    });

    const report = reportHydrationFailure({
      document: dom.window.document,
      endpoint: '/ops/hydration-failure',
      framework: 'react',
      navigator: dom.window.navigator,
      tags: { surface: 'checkout', ignored: null },
    });

    assert.equal(beacons.length, 0);

    report(
      new Error('Hydration failed because the server HTML did not match'),
      {
        componentStack: 'at Checkout',
        digest: 'react-digest',
      },
    );

    assert.equal(beacons.length, 1);
    const firstBeacon = beacons[0];
    assert.ok(firstBeacon);
    assert.equal(firstBeacon.url, 'https://app.test/ops/hydration-failure');
    assert.deepEqual(JSON.parse(firstBeacon.body), {
      componentStack: 'at Checkout',
      digest: 'react-digest',
      errorClass: 'Error',
      event: 'facetheory.hydration_failure',
      framework: 'react',
      message: 'Hydration failed because the server HTML did not match',
      path: '/checkout?cart=cart_test',
      tags: { surface: 'checkout' },
    });
  } finally {
    dom.window.close();
  }
});

test('client hydration beacon: falls back to same-origin keepalive fetch', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://app.test/account',
  });

  try {
    const posts: Array<{
      body: string | null;
      input: string;
      init: RequestInit | undefined;
    }> = [];
    const report = reportHydrationFailure({
      document: dom.window.document,
      endpoint: '/ops/hydration-failure',
      framework: 'vue',
      fetcher: async (input, init) => {
        posts.push({
          input: String(input),
          init,
          body: typeof init?.body === 'string' ? init.body : null,
        });
        return new Response(null, { status: 204 });
      },
      navigator: { sendBeacon: () => false },
    });

    report('Vue hydration mismatch');
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.input, 'https://app.test/ops/hydration-failure');
    assert.equal(posts[0]?.init?.method, 'POST');
    assert.equal(posts[0]?.init?.credentials, 'same-origin');
    assert.equal(posts[0]?.init?.keepalive, true);
    assert.equal(posts[0]?.init?.redirect, 'error');
    assert.deepEqual(JSON.parse(posts[0]?.body ?? '{}'), {
      errorClass: 'NonError_string',
      event: 'facetheory.hydration_failure',
      framework: 'vue',
      message: 'Vue hydration mismatch',
      path: '/account',
    });
  } finally {
    dom.window.close();
  }
});

test('client hydration beacon: rejects cross-origin endpoints before wiring', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://app.test/',
  });

  try {
    assert.throws(
      () =>
        reportHydrationFailure({
          document: dom.window.document,
          endpoint: 'https://evil.test/ops/hydration-failure',
        }),
      /hydration failure endpoint must be a same-origin/,
    );
  } finally {
    dom.window.close();
  }
});
