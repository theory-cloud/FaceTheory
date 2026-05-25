import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import type {
  HtmlStore,
  HtmlStoreReadResult,
  HtmlStoreWriteInput,
  HtmlStoreWriteResult,
} from '../../src/isr.js';
import type { FaceResourceRoute } from '../../src/types.js';
import { parseCookiesFromHeaders, parseQueryString } from '../../src/types.js';
import { viteHydrationForEntry } from '../../src/vite.js';

const SIDECAR_SIGNING_SECRET =
  'synthetic app sidecar signing secret with enough entropy';

class RecordingHtmlStore implements HtmlStore {
  readonly writes: HtmlStoreWriteInput[] = [];
  readonly objects = new Map<string, Uint8Array>();

  async read(key: string): Promise<HtmlStoreReadResult | null> {
    const body = this.objects.get(key);
    if (!body) return null;
    return { body: Uint8Array.from(body) };
  }

  async write(input: HtmlStoreWriteInput): Promise<HtmlStoreWriteResult> {
    this.writes.push({
      ...input,
      body: Uint8Array.from(input.body),
      ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    });
    this.objects.set(input.key, Uint8Array.from(input.body));
    return { etag: `app-test-etag-${String(this.writes.length)}` };
  }
}

function decodeBody(body: Uint8Array): string {
  return new TextDecoder().decode(body);
}

function callerResource(
  route: string,
  body = 'caller resource',
): FaceResourceRoute {
  return {
    route,
    handle: () => ({
      status: 200,
      headers: { 'content-type': ['text/plain; charset=utf-8'] },
      cookies: [],
      body: new TextEncoder().encode(body),
      isBase64: false,
    }),
  };
}

function extractHydrationHref(html: string): string {
  const tag = /<link\b[^>]*rel="facetheory-hydration"[^>]*>/i.exec(html)?.[0];
  assert.ok(tag, 'expected FaceTheory hydration link');
  const href = /\bhref="([^"]+)"/i.exec(tag)?.[1];
  assert.ok(href, 'expected FaceTheory hydration href');
  return href;
}

function tokenFromHydrationHref(href: string): string {
  const encoded = href.slice(href.lastIndexOf('/') + 1);
  return decodeURIComponent(encoded);
}

function decodeTokenPayload(token: string): Record<string, unknown> {
  const [payload] = token.split('.');
  assert.ok(payload);
  return JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

function parseJsonBody(responseBody: Uint8Array): unknown {
  return JSON.parse(decodeBody(responseBody));
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
          seen =
            String(ctx.request.headers['x-request-id']?.[0] ?? '').trim() ||
            null;
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
  assert.equal(
    loadResp.headers['content-type']?.[0],
    'text/html; charset=utf-8',
  );
  assert.equal(
    renderResp.headers['content-type']?.[0],
    'text/html; charset=utf-8',
  );

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
    body.includes(
      '<body class="shell-body" data-density="compact"><div>ok</div></body>',
    ),
    body,
  );
});



test('FaceApp: strict CSP validates body HTML before returning a response', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          csp: {
            inlineScripts: false,
            inlineStyles: false,
            rawHead: false,
          },
          hydration: {
            type: 'external',
            data: { page: 'strict' },
            dataUrl: '/_facetheory/hydration/home.json',
            bootstrapModule: '/assets/entry.js',
          },
          html: '<main><button onclick="bad()">Unsafe</button></main>',
        }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 500);
  assert.ok(resp.body instanceof Uint8Array);

  const body = decodeBody(resp.body as Uint8Array);
  assert.ok(body.includes('<h1>Internal Server Error</h1>'));
  assert.equal(body.includes('onclick'), false);
  assert.equal(body.includes('Unsafe'), false);
});

test('FaceApp: strict SSR inline hydration is served from framework sidecars', async () => {
  const htmlStore = new RecordingHtmlStore();
  let loadCount = 0;
  let renderCount = 0;
  const hydrationData = {
    route: '/account',
    profile: { displayName: 'A. Example' },
  };

  const app = createFaceApp({
    faces: [
      {
        route: '/account',
        mode: 'ssr',
        load: async () => {
          loadCount += 1;
          return hydrationData;
        },
        render: (_ctx, data) => {
          renderCount += 1;
          return {
            csp: {
              inlineScripts: false,
              inlineStyles: true,
              rawHead: false,
            },
            hydration: {
              data,
              bootstrapModule: '/assets/account.js',
            },
            html: '<main>account</main>',
          };
        },
      },
    ],
    ssrHydrationSidecars: {
      htmlStore,
      signingSecret: SIDECAR_SIGNING_SECRET,
      now: () => 1_000,
    },
  });

  const page = await app.handle({ method: 'GET', path: '/account' });
  assert.equal(page.status, 200);
  assert.equal(loadCount, 1);
  assert.equal(renderCount, 1);
  assert.equal(htmlStore.writes.length, 1);

  const html = decodeBody(page.body as Uint8Array);
  const dataUrl = extractHydrationHref(html);
  assert.ok(dataUrl.startsWith('/_facetheory/ssr-data/'));
  assert.ok(html.includes('rel="facetheory-hydration"'));
  assert.equal(html.includes('__FACETHEORY_DATA__'), false);

  const sidecar = await app.handle({ method: 'GET', path: dataUrl });
  assert.equal(sidecar.status, 200);
  assert.equal(sidecar.headers['cache-control']?.[0], 'no-store');
  assert.equal(
    sidecar.headers['content-type']?.[0],
    'application/json; charset=utf-8',
  );
  assert.deepEqual(parseJsonBody(sidecar.body as Uint8Array), hydrationData);
  assert.equal(loadCount, 1);
  assert.equal(renderCount, 1);
});

test('FaceApp: strict SSR Vite hydration uses the same framework sidecar path', async () => {
  const htmlStore = new RecordingHtmlStore();
  const manifest = {
    'src/entry-client.ts': { file: 'assets/entry.aaa.js' },
  };
  const hydrationData = { page: 'vite-strict' };

  const app = createFaceApp({
    faces: [
      {
        route: '/vite',
        mode: 'ssr',
        render: () => ({
          csp: {
            inlineScripts: false,
            inlineStyles: true,
            rawHead: false,
          },
          hydration: viteHydrationForEntry(
            manifest,
            'src/entry-client.ts',
            hydrationData,
          ),
          html: '<main>vite</main>',
        }),
      },
    ],
    ssrHydrationSidecars: {
      htmlStore,
      signingSecret: SIDECAR_SIGNING_SECRET,
      now: () => 2_000,
    },
  });

  const page = await app.handle({ method: 'GET', path: '/vite' });
  assert.equal(page.status, 200);
  assert.equal(htmlStore.writes.length, 1);

  const html = decodeBody(page.body as Uint8Array);
  const dataUrl = extractHydrationHref(html);
  assert.ok(html.includes('<script src="/assets/entry.aaa.js" type="module">'));
  assert.equal(html.includes('__FACETHEORY_DATA__'), false);

  const sidecar = await app.handle({ method: 'GET', path: dataUrl });
  assert.equal(sidecar.status, 200);
  assert.deepEqual(parseJsonBody(sidecar.body as Uint8Array), hydrationData);
});

test('FaceApp: caller-managed strict external hydration is preserved', async () => {
  const htmlStore = new RecordingHtmlStore();
  const app = createFaceApp({
    faces: [
      {
        route: '/external',
        mode: 'ssr',
        render: () => ({
          csp: {
            inlineScripts: false,
            inlineStyles: true,
            rawHead: false,
          },
          hydration: {
            type: 'external',
            data: { page: 'external' },
            dataUrl: '/caller/hydration.json',
            bootstrapModule: '/assets/external.js',
          },
          html: '<main>external</main>',
        }),
      },
    ],
    ssrHydrationSidecars: {
      htmlStore,
      signingSecret: SIDECAR_SIGNING_SECRET,
      now: () => 3_000,
    },
  });

  const page = await app.handle({ method: 'GET', path: '/external' });
  assert.equal(page.status, 200);
  assert.equal(htmlStore.writes.length, 0);

  const html = decodeBody(page.body as Uint8Array);
  assert.equal(extractHydrationHref(html), '/caller/hydration.json');
  assert.equal(html.includes('__FACETHEORY_DATA__'), false);
});

test('FaceApp: sidecar reads fail closed for mismatched cookie variants', async () => {
  const htmlStore = new RecordingHtmlStore();
  const cookieName = ['ft', 'variant'].join('_');
  const firstCookieValue = ['alpha', 'partition'].join('-');
  const secondCookieValue = ['beta', 'partition'].join('-');
  const bodyMarker = ['body', 'marker'].join('-');

  const app = createFaceApp({
    faces: [
      {
        route: '/variant',
        mode: 'ssr',
        render: () => ({
          csp: {
            inlineScripts: false,
            inlineStyles: true,
            rawHead: false,
          },
          hydration: {
            data: { bodyMarker },
            bootstrapModule: '/assets/variant.js',
          },
          html: '<main>variant</main>',
        }),
      },
    ],
    ssrHydrationSidecars: {
      htmlStore,
      signingSecret: SIDECAR_SIGNING_SECRET,
      now: () => 4_000,
    },
  });

  const page = await app.handle({
    method: 'GET',
    path: '/variant',
    headers: { cookie: [`${cookieName}=${firstCookieValue}`] },
  });
  const dataUrl = extractHydrationHref(decodeBody(page.body as Uint8Array));
  const token = tokenFromHydrationHref(dataUrl);
  const write = htmlStore.writes[0];
  assert.ok(write);

  const persistedControlPlane = JSON.stringify({
    key: write.key,
    metadata: write.metadata,
    tokenPayload: decodeTokenPayload(token),
  });
  assert.equal(persistedControlPlane.includes(firstCookieValue), false);
  assert.equal(persistedControlPlane.includes(secondCookieValue), false);
  assert.equal(persistedControlPlane.includes(SIDECAR_SIGNING_SECRET), false);
  assert.equal(persistedControlPlane.includes(bodyMarker), false);

  const ok = await app.handle({
    method: 'GET',
    path: dataUrl,
    headers: { cookie: [`${cookieName}=${firstCookieValue}`] },
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(parseJsonBody(ok.body as Uint8Array), { bodyMarker });

  const rejected = await app.handle({
    method: 'GET',
    path: dataUrl,
    headers: { cookie: [`${cookieName}=${secondCookieValue}`] },
  });
  assert.equal(rejected.status, 404);
  assert.equal(rejected.headers['cache-control']?.[0], 'no-store');
  const rejectionBody = decodeBody(rejected.body as Uint8Array);
  assert.equal(rejectionBody, 'Not Found');
  assert.equal(rejectionBody.includes(token), false);
  assert.equal(rejectionBody.includes(firstCookieValue), false);
  assert.equal(rejectionBody.includes(SIDECAR_SIGNING_SECRET), false);
});

test('FaceApp: framework sidecar resource keeps precedence over broad faces', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/{proxy+}',
        mode: 'ssr',
        render: (ctx) => ({ html: `<main>face:${ctx.proxy}</main>` }),
      },
    ],
    ssrHydrationSidecars: {
      htmlStore: new RecordingHtmlStore(),
      signingSecret: SIDECAR_SIGNING_SECRET,
      now: () => 5_000,
    },
  });

  for (const path of [
    '/_facetheory/ssr-data',
    '/_facetheory/ssr-data/not-a-valid-token',
    '/_facetheory/ssr-data/not/a/valid/token',
  ]) {
    const sidecar = await app.handle({ method: 'GET', path });
    assert.equal(sidecar.status, 404);
    assert.equal(sidecar.headers['cache-control']?.[0], 'no-store');
    assert.equal(
      sidecar.headers['content-type']?.[0],
      'text/plain; charset=utf-8',
    );
    assert.equal(decodeBody(sidecar.body as Uint8Array), 'Not Found');
  }

  const face = await app.handle({ method: 'GET', path: '/dashboard' });
  assert.equal(face.status, 200);
  assert.ok(
    decodeBody(face.body as Uint8Array).includes(
      '<main>face:dashboard</main>',
    ),
  );
});

test('FaceApp: framework sidecar resources reject structural caller route conflicts', () => {
  const cases: Array<{ route: string; message: RegExp }> = [
    {
      route: '/_facetheory/ssr-data',
      message: /duplicate resource route: \/_facetheory\/ssr-data/,
    },
    {
      route: '/_facetheory/ssr-data/{token}',
      message:
        /duplicate resource route: \/_facetheory\/ssr-data\/\{token\}/,
    },
    {
      route: '/_facetheory/ssr-data/{id}',
      message:
        /ambiguous resource routes: \/_facetheory\/ssr-data\/\{token\} and \/_facetheory\/ssr-data\/\{id\}/,
    },
    {
      route: '/_facetheory/ssr-data/{id+}',
      message:
        /ambiguous resource routes: \/_facetheory\/ssr-data\/\{token\+\} and \/_facetheory\/ssr-data\/\{id\+\}/,
    },
    {
      route: '/_facetheory/ssr-data/{proxy+}',
      message:
        /ambiguous resource routes: \/_facetheory\/ssr-data\/\{token\+\} and \/_facetheory\/ssr-data\/\{proxy\+\}/,
    },
  ];

  for (const { route, message } of cases) {
    assert.throws(
      () =>
        createFaceApp({
          faces: [],
          resources: [callerResource(route)],
          ssrHydrationSidecars: {
            htmlStore: new RecordingHtmlStore(),
            signingSecret: SIDECAR_SIGNING_SECRET,
          },
        }),
      message,
      route,
    );
  }
});

test('FaceApp: framework sidecar resource keeps precedence over broad caller resources', async () => {
  let callerResourceHits = 0;
  const app = createFaceApp({
    faces: [],
    resources: [
      {
        ...callerResource('/{proxy+}'),
        handle: (ctx) => {
          callerResourceHits += 1;
          return {
            status: 200,
            headers: { 'content-type': ['text/plain; charset=utf-8'] },
            cookies: [],
            body: new TextEncoder().encode(`resource:${ctx.proxy}`),
            isBase64: false,
          };
        },
      },
    ],
    ssrHydrationSidecars: {
      htmlStore: new RecordingHtmlStore(),
      signingSecret: SIDECAR_SIGNING_SECRET,
      now: () => 5_500,
    },
  });

  const sidecar = await app.handle({
    method: 'GET',
    path: '/_facetheory/ssr-data/not-a-valid-token',
  });
  assert.equal(sidecar.status, 404);
  assert.equal(sidecar.headers['cache-control']?.[0], 'no-store');
  assert.equal(decodeBody(sidecar.body as Uint8Array), 'Not Found');
  assert.equal(callerResourceHits, 0);

  const fallback = await app.handle({ method: 'GET', path: '/dashboard' });
  assert.equal(fallback.status, 200);
  assert.equal(decodeBody(fallback.body as Uint8Array), 'resource:dashboard');
  assert.equal(callerResourceHits, 1);
});

test('FaceApp: non-strict routes preserve legacy inline body output', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          html: '<main><button onclick="legacy()" style="color:red">Legacy</button></main>',
        }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 200);

  const body = decodeBody(resp.body as Uint8Array);
  assert.ok(body.includes('onclick="legacy()"'));
  assert.ok(body.includes('style="color:red"'));
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

test('parseQueryString: preserves special keys without prototype mutation', () => {
  const parsed = parseQueryString(
    '__proto__=first&constructor=second&__proto__=third',
  );

  assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, '__proto__'), true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(parsed, 'constructor'),
    true,
  );
  assert.deepEqual(parsed['__proto__'], ['first', 'third']);
  assert.deepEqual(parsed['constructor'], ['second']);
  assert.equal(({} as Record<string, unknown>)['first'], undefined);
});

test('parseCookiesFromHeaders: preserves special keys without prototype mutation', () => {
  const parsed = parseCookiesFromHeaders({
    cookie: ['__proto__=polluted; constructor=shadowed'],
  });

  assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, '__proto__'), true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(parsed, 'constructor'),
    true,
  );
  assert.equal(parsed['__proto__'], 'polluted');
  assert.equal(parsed['constructor'], 'shadowed');
  assert.equal(({} as Record<string, unknown>)['polluted'], undefined);
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
  assert.ok(
    decodeBody(resp.body as Uint8Array).includes(
      '<h1>Internal Server Error</h1>',
    ),
  );
});
