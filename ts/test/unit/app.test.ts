import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp, defineFace } from '../../src/app.js';
import type {
  HtmlStore,
  HtmlStoreReadResult,
  HtmlStoreWriteInput,
  HtmlStoreWriteResult,
} from '../../src/isr.js';
import type { FaceModule, FaceResourceRoute } from '../../src/types.js';
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

test('FaceApp: typed FaceModule load data flows into render', async () => {
  type ProfileData = {
    name: string;
    visitCount: number;
  };

  const annotatedFace: FaceModule<ProfileData> = {
    route: '/typed/annotated',
    mode: 'ssr',
    load: async () => ({ name: 'Ada', visitCount: 7 }),
    render: (_ctx, data) => ({
      head: { title: data.name },
      html: `<main>${data.name}:${data.visitCount.toFixed(0)}</main>`,
    }),
  };

  const inferredFace = defineFace({
    route: '/typed/inferred',
    mode: 'ssr',
    load: async () => ({ title: 'Inferred', score: 42 }),
    render: (_ctx, data) => ({
      head: { title: data.title },
      html: `<main>${data.title}:${data.score.toFixed(0)}</main>`,
    }),
  });

  const app = createFaceApp({ faces: [annotatedFace, inferredFace] });

  const annotated = await app.handle({
    method: 'GET',
    path: '/typed/annotated',
  });
  assert.equal(annotated.status, 200);
  assert.ok(
    decodeBody(annotated.body as Uint8Array).includes('<main>Ada:7</main>'),
  );

  const inferred = await app.handle({ method: 'GET', path: '/typed/inferred' });
  assert.equal(inferred.status, 200);
  assert.ok(
    decodeBody(inferred.body as Uint8Array).includes(
      '<main>Inferred:42</main>',
    ),
  );
});

test('FaceApp: validates face contracts at construction', () => {
  assert.throws(
    () =>
      createFaceApp({
        faces: [
          {
            route: '/',
            mode: 'spa',
            render: () => ({ html: '<div>unreachable</div>' }),
          } as unknown as FaceModule,
        ],
      }),
    /invalid face mode for route "\/": expected ssr, ssg, or isr/,
  );

  assert.throws(
    () =>
      createFaceApp({
        faces: [
          {
            route: '   ',
            mode: 'ssr',
            render: () => ({ html: '<div>unreachable</div>' }),
          },
        ],
      }),
    /face route must be a non-empty string/,
  );

  assert.throws(
    () =>
      createFaceApp({
        faces: [
          {
            route: '/missing-render',
            mode: 'ssr',
          } as unknown as FaceModule,
        ],
      }),
    /face render for route "\/missing-render" must be a function/,
  );
});

test('FaceApp: warns for soft face contract gaps at construction', () => {
  const records: Array<Record<string, unknown>> = [];

  createFaceApp({
    faces: [
      {
        route: '/news/{slug}',
        mode: 'ssg',
        render: () => ({ html: '<div>news</div>' }),
      },
      {
        route: '/preview',
        mode: 'isr',
        render: () => ({ html: '<div>preview</div>' }),
      },
      {
        route: '/docs/{slug}',
        mode: 'ssg',
        generateStaticParams: async () => [{ slug: 'intro' }],
        render: () => ({ html: '<div>docs</div>' }),
      },
    ],
    observability: {
      log: (record) => records.push(record as unknown as Record<string, unknown>),
    },
  });

  assert.deepEqual(
    records.map((record) => ({
      event: record.event,
      level: record.level,
      warningCode: record.warningCode,
      routePattern: record.routePattern,
      mode: record.mode,
    })),
    [
      {
        event: 'facetheory.app.contract.warning',
        level: 'warn',
        warningCode: 'ssg.generate_static_params_missing',
        routePattern: '/news/{slug}',
        mode: 'ssg',
      },
      {
        event: 'facetheory.app.contract.warning',
        level: 'warn',
        warningCode: 'isr.revalidate_seconds_missing',
        routePattern: '/preview',
        mode: 'isr',
      },
    ],
  );
  assert.match(String(records[0]?.message ?? ''), /generateStaticParams/);
  assert.match(String(records[1]?.message ?? ''), /revalidateSeconds/);
});


test('FaceApp: strict trailing-slash policy preserves current 404 behavior', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/docs',
        mode: 'ssr',
        render: () => ({ html: '<main>docs</main>' }),
      },
    ],
  });

  const canonical = await app.handle({ method: 'GET', path: '/docs' });
  assert.equal(canonical.status, 200);

  const trailing = await app.handle({ method: 'GET', path: '/docs/' });
  assert.equal(trailing.status, 404);
});

test('FaceApp: redirect trailing-slash policy returns a 308 canonical URL', async () => {
  let renderCount = 0;
  const app = createFaceApp({
    trailingSlash: 'redirect',
    faces: [
      {
        route: '/docs',
        mode: 'ssr',
        render: () => {
          renderCount += 1;
          return { html: '<main>docs</main>' };
        },
      },
    ],
  });

  const trailing = await app.handle({ method: 'GET', path: '/docs/' });
  assert.equal(trailing.status, 308);
  assert.equal(trailing.headers.location?.[0], '/docs');
  assert.equal(renderCount, 0);

  const canonical = await app.handle({ method: 'GET', path: '/docs' });
  assert.equal(canonical.status, 200);
  assert.equal(renderCount, 1);
});

test('FaceApp: normalize trailing-slash policy matches both silently', async () => {
  const app = createFaceApp({
    trailingSlash: 'normalize',
    faces: [
      {
        route: '/docs',
        mode: 'ssr',
        render: () => ({ html: '<main>docs</main>' }),
      },
    ],
  });

  const canonical = await app.handle({ method: 'GET', path: '/docs' });
  const trailing = await app.handle({ method: 'GET', path: '/docs/' });

  assert.equal(canonical.status, 200);
  assert.equal(trailing.status, 200);
  assert.ok(decodeBody(trailing.body as Uint8Array).includes('<main>docs</main>'));
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
  const loadError = new Error('sensitive load message');
  const renderError = new Error('sensitive render message');
  const observedErrors: Array<{ err: unknown; ctx: Record<string, unknown> }> = [];
  const app = createFaceApp({
    faces: [
      {
        route: '/load-error',
        mode: 'ssr',
        load: async () => {
          throw loadError;
        },
        render: () => ({ html: '<div>unreachable</div>' }),
      },
      {
        route: '/render-error',
        mode: 'ssr',
        render: async () => {
          throw renderError;
        },
      },
    ],
    observability: {
      onError: (err, ctx) =>
        observedErrors.push({
          err,
          ctx: ctx as unknown as Record<string, unknown>,
        }),
    },
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
  assert.equal(observedErrors.length, 2);
  assert.equal(observedErrors[0]?.err, loadError);
  assert.equal(observedErrors[0]?.ctx.phase, 'render');
  assert.equal(observedErrors[0]?.ctx.routePattern, '/load-error');
  assert.equal(observedErrors[1]?.err, renderError);
  assert.equal(observedErrors[1]?.ctx.phase, 'render');
  assert.equal(observedErrors[1]?.ctx.routePattern, '/render-error');
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

test('FaceApp: default sidecar variant ignores arbitrary cookie drift', async () => {
  const htmlStore = new RecordingHtmlStore();
  const pageOnlyCookieValue = ['page', 'path', 'cookie'].join('-');
  const sidecarOnlyCookieValue = ['sidecar', 'path', 'toss'].join('-');
  const sharedCookieValue = ['shared', 'root', 'cookie'].join('-');
  const hydrationData = { page: 'cookie-drift' };

  const app = createFaceApp({
    faces: [
      {
        route: '/cookie-drift',
        mode: 'ssr',
        render: () => ({
          csp: {
            inlineScripts: false,
            inlineStyles: true,
            rawHead: false,
          },
          hydration: {
            data: hydrationData,
            bootstrapModule: '/assets/cookie-drift.js',
          },
          html: '<main>cookie drift</main>',
        }),
      },
    ],
    ssrHydrationSidecars: {
      htmlStore,
      signingSecret: SIDECAR_SIGNING_SECRET,
      now: () => 3_500,
    },
  });

  const page = await app.handle({
    method: 'GET',
    path: '/cookie-drift',
    headers: {
      cookie: [
        `shared=${sharedCookieValue}; account_path=${pageOnlyCookieValue}`,
      ],
    },
  });
  assert.equal(page.status, 200);
  const dataUrl = extractHydrationHref(decodeBody(page.body as Uint8Array));
  const token = tokenFromHydrationHref(dataUrl);
  const write = htmlStore.writes[0];
  assert.ok(write);

  const persistedControlPlane = JSON.stringify({
    key: write.key,
    metadata: write.metadata,
    tokenPayload: decodeTokenPayload(token),
  });
  assert.equal(persistedControlPlane.includes(sharedCookieValue), false);
  assert.equal(persistedControlPlane.includes(pageOnlyCookieValue), false);
  assert.equal(persistedControlPlane.includes(sidecarOnlyCookieValue), false);

  const sidecar = await app.handle({
    method: 'GET',
    path: dataUrl,
    headers: {
      cookie: [
        `shared=${sharedCookieValue}; tossed=${sidecarOnlyCookieValue}`,
      ],
    },
  });
  assert.equal(sidecar.status, 200);
  assert.deepEqual(parseJsonBody(sidecar.body as Uint8Array), hydrationData);
});

test('FaceApp: custom sidecar requestVariant fails closed for mismatched cookie variants', async () => {
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
      requestVariant: (request) => ({
        cookies: {
          [cookieName]: request.cookies[cookieName] ?? '',
        },
      }),
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


test('FaceApp: onError receives original resource and sidecar exceptions', async () => {
  const resourceError = new Error('sensitive resource failure');
  const sidecarError = new Error('sensitive sidecar failure');
  const observedErrors: Array<{ err: unknown; ctx: Record<string, unknown> }> = [];

  const app = createFaceApp({
    faces: [],
    resources: [
      {
        route: '/resource',
        handle: () => {
          throw resourceError;
        },
      },
    ],
    ssrHydrationSidecars: {
      htmlStore: new RecordingHtmlStore(),
      signingSecret: SIDECAR_SIGNING_SECRET,
      requestVariant: () => {
        throw sidecarError;
      },
    },
    observability: {
      onError: (err, ctx) =>
        observedErrors.push({
          err,
          ctx: ctx as unknown as Record<string, unknown>,
        }),
    },
  });

  const resource = await app.handle({ method: 'GET', path: '/resource' });
  const sidecar = await app.handle({
    method: 'GET',
    path: '/_facetheory/ssr-data/not-a-valid-token',
  });

  assert.equal(resource.status, 500);
  assert.equal(sidecar.status, 404);
  assert.equal(observedErrors.length, 2);
  assert.equal(observedErrors[0]?.err, resourceError);
  assert.equal(observedErrors[0]?.ctx.phase, 'resource');
  assert.equal(observedErrors[0]?.ctx.routePattern, '/resource');
  assert.equal(observedErrors[1]?.err, sidecarError);
  assert.equal(observedErrors[1]?.ctx.phase, 'ssr-hydration-sidecar');
  assert.equal(
    observedErrors[1]?.ctx.routePattern,
    '/_facetheory/ssr-data/{token}',
  );
});

test('FaceApp: streaming body error before first chunk falls back to buffered 500', async () => {
  const streamError = new Error('stream failed before bytes');
  const observedErrors: Array<{ err: unknown; ctx: Record<string, unknown> }> = [];
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          html: (async function* () {
            await Promise.resolve();
            throw streamError;
            // Unreachable, but required to satisfy eslint `require-yield`.
            // This test depends on the stream failing before the first chunk.
            yield new Uint8Array();
          })(),
        }),
      },
    ],
    observability: {
      onError: (err, ctx) =>
        observedErrors.push({
          err,
          ctx: ctx as unknown as Record<string, unknown>,
        }),
    },
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
  assert.equal(observedErrors.length, 1);
  assert.equal(observedErrors[0]?.err, streamError);
  assert.equal(observedErrors[0]?.ctx.phase, 'stream-preflight');
});
