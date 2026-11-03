import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  RunError,
  assert,
  assertEqual,
  assertHeader,
  assertIncludes,
  assertMatch,
  assertNotIncludes,
  assertNotMatch,
} from './runtime.mjs';
import {
  assertProxyResult,
  dockerPrefixFor,
  functionUrlEvent,
  lambdaHeader,
  startInvokeSession,
} from './apptheory.mjs';
import {
  assertInvalidateUnsupported,
  describeTtl,
  gatewayBackendEndpoints,
  getObject,
  holdLease,
  listObjects,
  observeLease,
  rowSlug,
  scanTable,
  valueOf,
} from './storage.mjs';

const STRICT_CSP_ROW_PROFILES = {
  'vite-strict-csp-react': { label: 'React', marker: 'strict-csp-react' },
  'vite-strict-csp-svelte': { label: 'Svelte', marker: 'strict-csp-svelte' },
  'vite-strict-csp-vue': { label: 'Vue', marker: 'strict-csp-vue' },
};

const HANDLER_PROFILES = {
  facetheory: {
    rootBody:
      '<!doctype html><html lang="en"><head><title>FaceTheory</title></head><body><h1>hello (streaming)</h1></body></html>',
    catchAllBody:
      '<!doctype html><html lang="en"><head><title>Catch-all</title></head><body><pre>{\n  "path": "/anything",\n  "proxy": "anything"\n}</pre></body></html>',
    refusal: 'none',
  },
  apptheory: {
    rootBody:
      '<!doctype html><html lang="en"><head><title>FaceTheory (AppTheory)</title></head><body><h1>hello (streaming)</h1></body></html>',
    catchAllBody:
      '<!doctype html><html lang="en"><head><title>Catch-all</title></head><body><pre>{\n  "path": "/anything",\n  "proxy": "anything"\n}</pre></body></html>',
    refusal: '405',
  },
};

function html(response) {
  return response.body;
}

function expectOk(response, label) {
  assertEqual(response.status, 200, `${label} status`);
  assertHeader(response.headers, 'content-type', /^text\/html; charset=utf-8$/);
  return html(response);
}

function expectNotFound(response, label) {
  assertEqual(response.status, 404, `${label} status`);
}

function lambdaMarker(response) {
  return response.headers['x-facetheory-ssr'];
}

function strictCsp(response) {
  const csp = response.headers['content-security-policy'];
  assert(typeof csp === 'string' && csp.length > 0, 'strict CSP header is missing');
  assertIncludes(csp, "script-src 'self'", 'strict CSP script-src');
  assertIncludes(csp, "style-src 'self'", 'strict CSP style-src');
  assertIncludes(csp, "object-src 'none'", 'strict CSP object-src');
  assertNotIncludes(csp, "'unsafe-inline'", 'strict CSP must not allow inline sources');
  assertNotIncludes(csp, "'unsafe-eval'", 'strict CSP must not allow eval');
  return csp;
}

function assertNoInlineScripts(body, label) {
  const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>/i;
  assertNotMatch(body, inlineScript, `${label} inline script`);
  assertNotIncludes(body, '<style', `${label} inline style`);
}

function extractFirst(body, pattern, label) {
  const match = body.match(pattern);
  if (!match) throw new RunError(`${label}: no match for ${pattern}`);
  return match[0];
}

async function fetchAsset(request, assetPath, expectedType, label) {
  const response = await request(assetPath);
  assertEqual(response.status, 200, `${label} ${assetPath} status`);
  if (expectedType) assertHeader(response.headers, 'content-type', expectedType);
  return response;
}


async function runStrictCsp(request, label, marker) {
  const response = await request('/');
  const body = expectOk(response, `strict CSP ${label} page`);
  strictCsp(response);
  assertNoInlineScripts(body, `strict CSP ${label}`);
  assertIncludes(body, `<title>FaceTheory Strict CSP ${label}</title>`, `strict CSP ${label} title`);
  assertIncludes(body, `content="${marker}" name="example"`, `strict CSP ${label} marker`);
  assertIncludes(body, 'rel="stylesheet"', `strict CSP ${label} external CSS`);
  assertIncludes(body, 'type="module"', `strict CSP ${label} module bootstrap`);
  const sidecarPath = extractFirst(body, /\/_facetheory\/ssr-data\/[^"']+/, `strict CSP ${label} sidecar`);
  const sidecar = await request(sidecarPath);
  assertEqual(sidecar.status, 200, `strict CSP ${label} sidecar status`);
  assertHeader(sidecar.headers, 'content-type', /^application\/json; charset=utf-8$/);
  assertHeader(sidecar.headers, 'cache-control', 'no-store');
  assertIncludes(sidecar.body, '"page":"home"', `strict CSP ${label} sidecar payload`);
  expectNotFound(await request('/missing-route'), `strict CSP ${label} missing route`);
  return {
    detail: `strict CSP header without unsafe sources, no inline script/style, external assets, sidecar served no-store; 404 refusal`,
    sidecarPath,
    sidecarBody: sidecar.body,
    pageBody: body,
  };
}

export const RUNNERS = {
  'react-ssr-buffered': async ({ request }) => {
    const response = await request.rawChunks('/');
    const body = expectOk(response, 'buffered page');
    assertIncludes(body, '<title>Home</title>', 'buffered title');
    assertIncludes(body, '<h1>FaceTheory + React (buffered SSR)</h1>', 'buffered body');
    assertIncludes(body, '__FACETHEORY_DATA__', 'buffered hydration data');
    assertIncludes(body, '"hello":"world"', 'buffered hydration payload');
    assertIncludes(body, '/assets/client-entry.js', 'buffered bootstrap module');
    assertEqual(response.chunks.length, 1, 'buffered response must be one complete body chunk');
    expectNotFound(await request('/missing'), 'buffered missing route');
    return { detail: 'one complete buffered document; hydration data and bootstrap tag; 404 refusal' };
  },

  'react-ssr-streaming': async ({ request }) => {
    const response = await request.rawChunks('/');
    expectOk(response, 'streaming page');
    assertHeader(response.headers, 'transfer-encoding', 'chunked');
    assert(response.chunks.length >= 2, `streaming response must have multiple chunks, got ${response.chunks.length}`);
    const first = response.chunks[0].toString('utf8');
    assertIncludes(first, '<!doctype html>', 'streaming first chunk document head');
    assertIncludes(first, '<title>Home</title>', 'streaming first chunk title');
    assertNotIncludes(first, '<h1>FaceTheory + React (streaming SSR)</h1>', 'streaming body must not be in the first chunk');
    assertIncludes(html(response), '<h1>FaceTheory + React (streaming SSR)</h1>', 'streaming body');
    assertIncludes(html(response), '</body></html>', 'streaming document close');
    expectNotFound(await request('/missing'), 'streaming missing route');
    return { detail: `head-first streaming in ${response.chunks.length} chunks; body arrives after the head; 404 refusal` };
  },

  'vue-ssr-streaming': async ({ request }) => {
    const response = await request.rawChunks('/');
    expectOk(response, 'Vue streaming page');
    assertHeader(response.headers, 'transfer-encoding', 'chunked');
    assert(response.chunks.length >= 2, `Vue streaming response must have multiple chunks, got ${response.chunks.length}`);
    const first = response.chunks[0].toString('utf8');
    assertIncludes(first, '<title>Vue Streaming Home</title>', 'Vue streaming first chunk title');
    assertNotIncludes(first, '<h1>FaceTheory + Vue (streaming SSR)</h1>', 'Vue body must not be in the first chunk');
    assertIncludes(html(response), '<h1>FaceTheory + Vue (streaming SSR)</h1>', 'Vue streaming body');
    expectNotFound(await request('/missing'), 'Vue streaming missing route');
    return { detail: `head-first streaming in ${response.chunks.length} chunks; Vue body after the head; 404 refusal` };
  },

  'vite-ssr-react': async ({ request }) => {
    const response = await request('/');
    const body = expectOk(response, 'Vite React page');
    assertIncludes(body, '<div id="root"><main>Hello from server (chunk)</main></div>', 'Vite React rendered markup');
    assertIncludes(body, '__FACETHEORY_DATA__', 'Vite React hydration data');
    assertIncludes(body, '"message":"from server"', 'Vite React hydration payload');
    assertIncludes(body, 'rel="modulepreload"', 'Vite React modulepreload tag');
    assertIncludes(body, 'rel="stylesheet"', 'Vite React stylesheet tag');
    const entry = extractFirst(body, /\/assets\/entry-client-[A-Za-z0-9_-]+\.js/, 'Vite React entry asset');
    await fetchAsset(request, entry, /^text\/javascript; charset=utf-8$/, 'Vite React');
    expectNotFound(await request('/assets/missing.js'), 'Vite React missing asset');
    expectNotFound(await request('/missing-route'), 'Vite React missing route');
    return { detail: `built Vite client manifest tags, hydration, served ${entry}; asset and route 404 refusals` };
  },

  'vite-ssr-react#dev': async ({ request }) => {
    const response = await request('/');
    const body = expectOk(response, 'Vite React dev page');
    assertIncludes(body, '/@vite/client', 'Vite dev client script');
    assertIncludes(body, '/src/entry-client.tsx', 'Vite dev client entry');
    assertIncludes(body, '<div id="root"><main>Hello from server (chunk)</main></div>', 'Vite dev rendered markup');
    expectNotFound(await request('/missing-route'), 'Vite dev missing route');
    return { detail: 'in-example npm run dev served the Vite middleware loop; @vite/client and source entry present' };
  },

  'vite-ssr-vue': async ({ request }) => {
    const response = await request('/');
    const body = expectOk(response, 'Vite Vue page');
    assertIncludes(body, '<title>FaceTheory Vue SSR</title>', 'Vite Vue title');
    assertIncludes(body, '<div id="root">', 'Vite Vue root');
    assertIncludes(body, '<h1>Vue SSR Example</h1>', 'Vite Vue rendered markup');
    assertIncludes(body, '__FACETHEORY_DATA__', 'Vite Vue hydration data');
    const entry = extractFirst(body, /\/assets\/entry-client-[A-Za-z0-9_-]+\.js/, 'Vite Vue entry asset');
    await fetchAsset(request, entry, /^text\/javascript; charset=utf-8$/, 'Vite Vue');
    expectNotFound(await request('/missing-route'), 'Vite Vue missing route');
    return { detail: `built Vue client manifest, hydration, served ${entry}; route 404 refusal` };
  },

  'vite-ssr-svelte': async ({ request }) => {
    const response = await request('/');
    const body = expectOk(response, 'Vite Svelte page');
    assertIncludes(body, '<title>FaceTheory Svelte SSR</title>', 'Vite Svelte title');
    assertIncludes(body, 'Svelte SSR Example', 'Vite Svelte rendered markup');
    assertIncludes(body, '__FACETHEORY_DATA__', 'Vite Svelte hydration data');
    const entry = extractFirst(body, /\/assets\/entry-client-[A-Za-z0-9_-]+\.js/, 'Vite Svelte entry asset');
    await fetchAsset(request, entry, /^text\/javascript; charset=utf-8$/, 'Vite Svelte');
    expectNotFound(await request('/missing-route'), 'Vite Svelte missing route');
    return { detail: `built Svelte client manifest, hydration, served ${entry}; route 404 refusal` };
  },

  'vite-ssr-svelte-library': async ({ request }) => {
    const response = await request('/');
    const body = expectOk(response, 'Svelte library host page');
    assertIncludes(body, '<title>FaceTheory External Svelte Library</title>', 'library host title');
    assertIncludes(body, 'data-library-panel', 'packaged LibraryPanel markup');
    assertIncludes(body, 'library-panel__title', 'packaged LibraryPanel title class');
    assertIncludes(body, 'External Svelte Package', 'packaged LibraryPanel eyebrow');
    assertIncludes(body, 'Library clicks 3', 'packaged LibraryPanel initial count');
    assertIncludes(body, 'Hosted from a packaged library', 'host-supplied title');
    const entry = extractFirst(body, /\/assets\/entry-client-[A-Za-z0-9_-]+\.js/, 'Svelte library entry asset');
    await fetchAsset(request, entry, /^text\/javascript; charset=utf-8$/, 'Svelte library host');
    const css = extractFirst(body, /\/assets\/[A-Za-z0-9_-]+\.css/, 'Svelte library CSS asset');
    await fetchAsset(request, css, /^text\/css; charset=utf-8$/, 'Svelte library host');
    const badge = extractFirst(body, /\/assets\/badge-[A-Za-z0-9_-]+\.svg/, 'Svelte library badge asset');
    await fetchAsset(request, badge, /^image\/svg\+xml$/, 'Svelte library host');
    expectNotFound(await request('/missing-route'), 'Svelte library host missing route');
    return {
      detail: `host served packaged library markup, CSS ${css} and badge ${badge}; route 404 refusal`,
      library: true,
    };
  },

  'ssg-basic': async ({ request }) => {
    const home = await request('/');
    const homeBody = expectOk(home, 'SSG home');
    assertIncludes(homeBody, '<title>FaceTheory SSG</title>', 'SSG home title');
    assertIncludes(homeBody, '<h1>FaceTheory SSG</h1>', 'SSG home body');
    const about = await request('/about/');
    assertIncludes(expectOk(about, 'SSG about'), '<h1>About</h1>', 'SSG about body');
    const post = await request('/blog/hello-ssg/');
    assertIncludes(expectOk(post, 'SSG dynamic post'), '<h1>hello-ssg</h1>', 'SSG dynamic post body');
    const notFoundPage = await request('/404');
    assertIncludes(notFoundPage.body, '<h1>Not Found</h1>', 'SSG 404 page body');
    const missing = await request('/missing');
    assertEqual(missing.status, 404, 'SSG missing route status');
    assertIncludes(missing.body, '<h1>Not Found</h1>', 'SSG missing route body');
    const manifest = await request('/.facetheory/ssg-manifest.json');
    assertEqual(manifest.status, 200, 'SSG manifest status');
    assertHeader(manifest.headers, 'content-type', /^application\/json; charset=utf-8$/);
    return { detail: 'built pages for /, /about/, /blog/hello-ssg/, 404 and the SSG manifest; missing route 404' };
  },

  'vue-ssg': async ({ request }) => {
    const home = await request('/');
    const homeBody = expectOk(home, 'Vue SSG catalog');
    assertIncludes(homeBody, '<title>Catalog — FaceTheory Vue SSG</title>', 'Vue SSG catalog title');
    assertIncludes(homeBody, 'FaceTheory Vue SSG catalog', 'Vue SSG catalog body');
    const product = await request('/products/aurora-lamp/');
    const productBody = expectOk(product, 'Vue SSG product');
    assertIncludes(productBody, 'Aurora Lamp', 'Vue SSG product body');
    assertIncludes(productBody, '__FACETHEORY_DATA__', 'Vue SSG product hydration data');
    const css = extractFirst(homeBody, /\/assets\/[A-Za-z0-9_-]+\.css/, 'Vue SSG CSS asset');
    await fetchAsset(request, css, /^text\/css; charset=utf-8$/, 'Vue SSG');
    expectNotFound(await request('/missing'), 'Vue SSG missing route');
    return { detail: `build-time Vue pages for / and /products/{slug}; served ${css}; missing route 404` };
  },

  'operator-visibility-react': async ({ request }) => {
    const response = await request('/');
    const body = expectOk(response, 'operator visibility page');
    assertHeader(response.headers, 'cache-control', 'no-store');
    assertIncludes(body, 'data-example="operator-visibility-react"', 'operator visibility example marker');
    assertIncludes(body, 'data-source="facetheory-load"', 'operator visibility load source');
    assertIncludes(body, 'data-snapshot-at=', 'operator visibility snapshot');
    assertIncludes(body, 'matrix', 'operator visibility matrix');
    assertIncludes(body, 'guard', 'operator visibility guard');
    assertIncludes(body, 'authority', 'operator visibility authority');
    assertIncludes(body, 'confidence', 'operator visibility confidence');
    expectNotFound(await request('/missing-route'), 'operator visibility missing route');
    return { detail: 'deterministic dashboard from the real React Face; no-store header; route 404 refusal' };
  },

  'spa-navigation': async ({ request }) => {
    const home = await request('/');
    const homeBody = expectOk(home, 'SPA home');
    assertIncludes(homeBody, 'data-facetheory-view', 'SPA persistent view');
    assertIncludes(homeBody, '__FACETHEORY_DATA_URL__', 'SPA external hydration data link');
    assertIncludes(homeBody, '/spa-data/home.json', 'SPA home sidecar URL');
    assertIncludes(homeBody, '/assets/spa-navigation-entry.js', 'SPA client entry');
    const details = await request('/details');
    const detailsBody = expectOk(details, 'SPA details');
    assertIncludes(detailsBody, '<title>Order details</title>', 'SPA details title');
    assertIncludes(detailsBody, '/spa-data/details.json', 'SPA details sidecar URL');
    const sidecar = await request('/spa-data/home.json');
    assertEqual(sidecar.status, 200, 'SPA sidecar status');
    assertHeader(sidecar.headers, 'content-type', /^application\/json; charset=utf-8$/);
    assertIncludes(sidecar.body, '"page":"home"', 'SPA sidecar payload');
    await fetchAsset(request, '/assets/spa-navigation-entry.js', /^text\/javascript; charset=utf-8$/, 'SPA');
    expectNotFound(await request('/missing-page'), 'SPA missing route');
    return { detail: 'two Faces, external sidecars and the bundled client entry served; missing route 404' };
  },

  'navigation-pending': async ({ request }) => {
    const page = await request('/');
    const body = expectOk(page, 'navigation-pending host page');
    assertIncludes(body, 'id="same-origin-link"', 'host same-origin link');
    assertIncludes(body, 'id="external-link"', 'host external link');
    assertIncludes(body, '<form method="post" action="/submit">', 'host form');
    assertIncludes(body, '/navigation-pending.js', 'host loads the built helper');
    assertIncludes(body, '/navigation-pending-entry.js', 'host loads the example entry');
    const helper = await fetchAsset(
      request,
      '/navigation-pending.js',
      /^text\/javascript; charset=utf-8$/,
      'navigation-pending helper',
    );
    assertIncludes(helper.body, 'startNavigationPending', 'built helper export');
    assertIncludes(helper.body, 'data-facetheory-navigation-pending', 'built helper attribute');
    const entry = await fetchAsset(
      request,
      '/navigation-pending-entry.js',
      /^text\/javascript; charset=utf-8$/,
      'navigation-pending entry',
    );
    assertIncludes(entry.body, 'startNavigationPending', 'example entry starts the helper');
    expectNotFound(await request('/missing.js'), 'navigation-pending missing asset');
    return {
      detail: 'real host page loads the built helper and the bundled example entry; both served over HTTP; missing asset 404',
    };
  },

  'control-plane-preset': async ({ request, row }) => {
    const mode = row.expect?.mode ?? 'relaxed';
    const delivery = row.expect?.delivery ?? 'client-fill';
    const response = await request('/');
    const body = expectOk(response, `control-plane preset ${mode}/${delivery}`);
    assertIncludes(body, 'Theory Cloud control-plane preset', 'control-plane preset shell');
    assertIncludes(body, 'data-facetheory-control-plane', 'control-plane body marker');
    assertIncludes(body, `data-facetheory-control-plane-csp-mode="${mode}"`, 'control-plane CSP mode marker');
    assertIncludes(body, `data-facetheory-control-plane-delivery="${delivery}"`, 'control-plane delivery marker');
    assertIncludes(body, '/_facetheory/control-plane/control-plane.js', 'control-plane bootstrap asset');
    assertIncludes(body, '/_facetheory/control-plane/responsive-primitives.css', 'control-plane stylesheet asset');
    assertHeader(response.headers, 'x-facetheory-control-plane-strict-csp-supported', 'true');

    if (mode === 'strict') {
      strictCsp(response);
      assertNoInlineScripts(body, 'control-plane strict');
    }

    if (delivery === 'client-fill') {
      assertNotIncludes(body, 'bounded agents loaded', 'client-fill initial shell must not contain section data');
      const section = await request('/_facetheory/control-plane/sections/root-0/agents');
      assertEqual(section.status, 200, 'control-plane section status');
      assertIncludes(section.body, 'bounded agents loaded', 'control-plane section payload');
    } else {
      assertIncludes(body, 'bounded agents loaded', 'streaming delivery section payload');
    }

    const asset = await request('/_facetheory/control-plane/control-plane.js', { method: 'HEAD' });
    assertEqual(asset.status, 200, 'control-plane bootstrap HEAD status');
    assertHeader(asset.headers, 'content-type', 'text/javascript; charset=utf-8');
    assertHeader(asset.headers, 'x-content-type-options', 'nosniff');
    expectNotFound(await request('/missing-route'), 'control-plane missing route');
    return {
      detail: `${mode}/${delivery}: ${delivery === 'client-fill' ? 'section fetched' : 'section streamed'}, bootstrap HEAD served${mode === 'strict' ? ', strict CSP without inline sources' : ''}; 404 refusal`,
    };
  },

  'control-plane-host-owned-contracts': async ({ request }) => {
    const response = await request('/');
    const body = expectOk(response, 'host-owned control-plane page');
    assertIncludes(body, 'Host-owned control-plane section reads', 'host-owned shell title');
    assertIncludes(body, 'FaceTheory renders the shell; the host owns auth and section data.', 'host-owned boundary copy');
    assertIncludes(body, 'data-facetheory-control-plane', 'host-owned control-plane marker');
    const section = await request('/_facetheory/control-plane/sections/root-0/operator-summary');
    assertEqual(section.status, 200, 'host-owned section status');
    assertIncludes(section.body, 'data-example="host-owned-section-read"', 'host-owned section marker');
    assertIncludes(section.body, 'data-contract-id="host.tabletheory.key-m1.section-read"', 'host-owned contract id');
    assertIncludes(section.body, 'Section data came from a host-owned bounded read.', 'host-owned section copy');
    assertIncludes(section.body, 'Host accepted tenant:', 'host-owned tenant row');
    assertIncludes(section.body, 'tenant_example_safe', 'host-owned tenant value');
    assertIncludes(section.body, 'Host accepted scope:', 'host-owned scope row');
    expectNotFound(await request('/missing-route'), 'host-owned missing route');
    return {
      detail: 'real control-plane pipeline with the host-owned auth and section-read stubs; contract id and escaped rows asserted; 404 refusal',
    };
  },

  'isr-blocking': async ({ request }) => {
    const first = await request('/news/home');
    const firstBody = expectOk(first, 'isr-blocking first request');
    assertHeader(first.headers, 'x-facetheory-isr', 'miss');
    assertIncludes(firstBody, '<h1>home</h1>', 'isr-blocking first body');
    assertIncludes(firstBody, 'revision 1', 'isr-blocking first revision');
    assertHeader(first.headers, 'cache-control', /public/);
    const second = await request('/news/home');
    assertEqual(second.status, 200, 'isr-blocking second status');
    assertHeader(second.headers, 'x-facetheory-isr', 'hit');
    assertEqual(second.body, first.body, 'isr-blocking hit bytes');
    expectNotFound(await request('/'), 'isr-blocking missing route');
    return { detail: 'in-memory ISR: first request miss and generation, second hit with identical bytes; route 404 refusal' };
  },

  'isr-real-storage': async ({ row, root, request, storage }) => {
    if (!storage) throw new RunError(`${row.id}: no local storage context`);
    const first = await request('/news/home');
    const firstBody = expectOk(first, `${row.id} first request`);
    assertHeader(first.headers, 'x-facetheory-isr', 'miss');
    assertIncludes(firstBody, '<h1>home</h1>', `${row.id} first body`);
    assertIncludes(firstBody, 'revision 1', `${row.id} first revision`);

    const second = await request('/news/home');
    assertEqual(second.status, 200, `${row.id} second status`);
    assertHeader(second.headers, 'x-facetheory-isr', 'hit');
    assertEqual(second.body, first.body, `${row.id} hit bytes`);

    const items = await scanTable({
      endpoint: storage.endpoints.dynamodb,
      tableName: storage.tableName,
    });
    const metadata = items.filter((item) => valueOf(item, 'sk') === 'META');
    assertEqual(metadata.length, 1, `${row.id} metadata item count`);
    const meta = metadata[0];
    const expectedPk = 'CACHE#default::/news/{slug}?slug=home';
    assertEqual(valueOf(meta, 'pk'), expectedPk, `${row.id} metadata pk`);
    assertEqual(valueOf(meta, 'sk'), 'META', `${row.id} metadata sk`);
    const pointer = valueOf(meta, 's3_key');
    assert(typeof pointer === 'string' && pointer.length > 0, `${row.id} metadata s3_key is missing`);
    const generatedAt = valueOf(meta, 'generated_at');
    assert(Number.isFinite(generatedAt) && generatedAt > 0, `${row.id} metadata generated_at is missing`);
    assertEqual(valueOf(meta, 'revalidate_seconds'), 30, `${row.id} metadata revalidate_seconds`);
    const etag = valueOf(meta, 'etag');
    assert(typeof etag === 'string' && etag.length > 0, `${row.id} metadata etag is missing`);

    const key = storage.prefix ? `${storage.prefix}/${pointer}` : pointer;
    const object = await getObject({
      endpoint: storage.endpoints.s3,
      bucket: storage.bucket,
      key,
    });
    assertEqual(object.body.toString('utf8'), firstBody, `${row.id} stored HTML bytes`);
    assertMatch(object.contentType ?? '', /^text\/html;\s?charset=utf-8$/, `${row.id} stored content type`);
    assertEqual(object.metadata['facetheory-status'], '200', `${row.id} stored status metadata`);
    assertEqual(
      object.metadata['facetheory-content-type'],
      'text/html; charset=utf-8',
      `${row.id} stored content-type metadata`,
    );
    assertIncludes(object.cacheControl ?? '', 'must-revalidate', `${row.id} stored cache-control`);
    assertEqual(object.etag, etag, `${row.id} metadata etag matches the S3 object`);

    const ttl = await describeTtl({
      endpoint: storage.endpoints.dynamodb,
      tableName: storage.tableName,
    });
    assertEqual(ttl.TimeToLiveStatus, 'ENABLED', `${row.id} table TTL status`);
    assertEqual(ttl.AttributeName, 'ttl', `${row.id} table TTL attribute`);
    assert(
      !items.some((item) => valueOf(item, 'sk') === 'LOCK'),
      `${row.id} committed generation left a lease item behind`,
    );

    const lease = await observeLease({
      root,
      storage,
      cacheKey: `ft3-lease-probe-${rowSlug(row.id)}`,
    });
    const invalidateMessage = await assertInvalidateUnsupported({
      root,
      storage,
      cacheKey: `ft3-invalidate-probe-${rowSlug(row.id)}`,
    });

    const contentionParam = `lease-${rowSlug(row.id)}`;
    const contentionKey = `default::/news/{slug}?slug=${contentionParam}`;
    const held = await holdLease({ root, storage, cacheKey: contentionKey });
    const blocked = await request(`/news/${contentionParam}`);
    assertEqual(blocked.status, 500, `${row.id} lease contention status`);
    assertHeader(blocked.headers, 'content-type', /^text\/html; charset=utf-8$/);
    assertIncludes(blocked.body, 'Internal Server Error', `${row.id} lease contention body`);
    await held.release();

    const recovered = await request(`/news/${contentionParam}`);
    assertEqual(recovered.status, 200, `${row.id} post-contention status`);
    assertHeader(recovered.headers, 'x-facetheory-isr', 'miss');
    assertIncludes(recovered.body, `revision`, `${row.id} post-contention revision`);
    const recoveredHit = await request(`/news/${contentionParam}`);
    assertHeader(recoveredHit.headers, 'x-facetheory-isr', 'hit');
    assertEqual(recoveredHit.body, recovered.body, `${row.id} post-contention hit bytes`);

    return {
      detail: `real S3 HTML (${key}) and DynamoDB metadata (${expectedPk}) asserted; lease token/expires/ttl ${lease.token.slice(0, 8)}…/${lease.expiresAt}/${lease.ttl}; invalidate refused (IsrInvalidateUnsupportedError); held lease produced a 500, then recovery miss and hit`,
    };
  },

  'strict-csp-real-storage': async ({ row, root, request, storage }) => {
    if (!storage) throw new RunError(`${row.id}: no local storage context`);
    const name = row.directory.split('/').pop();
    const profile = STRICT_CSP_ROW_PROFILES[name];
    if (!profile) throw new RunError(`${row.id}: unknown strict-CSP example ${name}`);
    const first = await runStrictCsp(request, profile.label, profile.marker);

    const secondPage = await request('/');
    const secondBody = expectOk(secondPage, `${row.id} second page`);
    const secondSidecarPath = extractFirst(
      secondBody,
      /\/_facetheory\/ssr-data\/[^"']+/,
      `${row.id} second sidecar`,
    );
    const secondSidecar = await request(secondSidecarPath);
    assertEqual(secondSidecar.status, 200, `${row.id} second sidecar status`);
    assertEqual(
      secondSidecar.body,
      first.sidecarBody,
      `${row.id} two renders wrote identical sidecar payloads`,
    );
    const reread = await request(first.sidecarPath);
    assertEqual(reread.status, 200, `${row.id} sidecar reread status`);
    assertEqual(reread.body, first.sidecarBody, `${row.id} stored sidecar reread bytes`);

    const keys = await listObjects({
      endpoint: storage.endpoints.s3,
      bucket: storage.bucket,
    });
    assertEqual(keys.length, 2, `${row.id} sidecar object count`);
    const bodies = [];
    const bodyDigests = [];
    for (const key of keys) {
      const object = await getObject({
        endpoint: storage.endpoints.s3,
        bucket: storage.bucket,
        key,
      });
      const body = object.body.toString('utf8');
      bodies.push(body);
      assertMatch(object.contentType ?? '', /^application\/json;\s?charset=utf-8$/, `${row.id} sidecar content type`);
      assertEqual(object.cacheControl, 'no-store', `${row.id} sidecar cache-control`);
      assertEqual(
        object.metadata['facetheory-kind'],
        'ssr-hydration-sidecar',
        `${row.id} sidecar metadata kind`,
      );
      assertMatch(
        object.metadata['facetheory-body'] ?? '',
        /^[A-Za-z0-9_-]{43}$/,
        `${row.id} sidecar body digest metadata`,
      );
      bodyDigests.push(object.metadata['facetheory-body']);
      assert(
        Number(object.metadata['facetheory-expires-at']) > Date.now(),
        `${row.id} sidecar expiry metadata`,
      );
      assertIncludes(body, '"page":"home"', `${row.id} sidecar payload`);
    }
    assert(bodies.includes(first.sidecarBody), `${row.id} a stored sidecar is not the served payload`);
    assertEqual(new Set(bodyDigests).size, 1, `${row.id} identical sidecars share one body digest`);
    const items = await scanTable({
      endpoint: storage.endpoints.dynamodb,
      tableName: storage.tableName,
    });
    assertEqual(items.length, 0, `${row.id} SSR sidecars must not write ISR metadata`);
    const invalidateMessage = await assertInvalidateUnsupported({
      root,
      storage,
      cacheKey: `ft3-invalidate-probe-${rowSlug(row.id)}`,
    });

    return {
      detail: `real S3 sidecars ${keys.join(', ')} asserted with metadata; two renders produced identical payload bytes; reread served the stored bytes; no ISR metadata item was written; invalidate refused (${invalidateMessage.slice(0, 40)}…)`,
    };
  },

  'react-isr': async ({ request }) => {
    const first = await request('/news/home');
    const firstBody = expectOk(first, 'react-isr first request');
    assertHeader(first.headers, 'x-facetheory-isr', 'miss');
    assertIncludes(firstBody, '<main id="root">', 'react-isr React root');
    assertIncludes(firstBody, '<h1>home</h1>', 'react-isr first body');
    assertIncludes(firstBody, 'revision 1', 'react-isr first revision');
    const second = await request('/news/home');
    assertEqual(second.status, 200, 'react-isr second status');
    assertHeader(second.headers, 'x-facetheory-isr', 'hit');
    assertEqual(second.body, first.body, 'react-isr hit bytes');
    expectNotFound(await request('/'), 'react-isr missing route');
    return { detail: 'real React tree through in-memory ISR: miss, generation, hit with identical bytes; route 404 refusal' };
  },

  'vite-manifest-injection': async ({ request }) => {
    const response = await request('/');
    const body = expectOk(response, 'vite-manifest page');
    assertIncludes(body, 'rel="modulepreload"', 'manifest modulepreload tag');
    assertIncludes(body, '/assets/vendor.bbb.js', 'manifest vendor asset');
    assertIncludes(body, 'rel="stylesheet"', 'manifest stylesheet tag');
    assertIncludes(body, '/assets/entry.aaa.css', 'manifest CSS asset');
    assertIncludes(body, '<script src="/assets/entry.aaa.js" type="module"></script>', 'manifest hydration bootstrap');
    assertIncludes(body, '"hello":"world"', 'manifest hydration payload');
    expectNotFound(await request('/missing'), 'vite-manifest missing route');
    return { detail: 'manifest-derived preload, stylesheet, module bootstrap and hydration tags; missing route 404' };
  },

  'responsive-primitives-react': async ({ request }) => {
    const response = await request('/');
    const body = expectOk(response, 'responsive React page');
    assertIncludes(body, 'facetheory-rcp-spinner', 'responsive React spinner class');
    assertIncludes(body, 'facetheory-rcp-skeleton--width-two-thirds', 'responsive React skeleton width');
    assertIncludes(body, 'aria-busy="true"', 'responsive React busy state');
    assertIncludes(body, 'href="/tenants"', 'responsive React link');
    assertIncludes(body, 'prefers-reduced-motion', 'responsive CSS media query');
    assertNotIncludes(body, 'style="', 'responsive React inline style');
    expectNotFound(await request('/missing'), 'responsive React missing route');
    return { detail: 'all six React primitives rendered with shared CSS; no inline style; route 404 refusal' };
  },

  'responsive-primitives-vue': async ({ request }) => {
    const response = await request('/');
    const body = expectOk(response, 'responsive Vue page');
    assertIncludes(body, 'facetheory-rcp-spinner', 'responsive Vue spinner class');
    assertIncludes(body, 'facetheory-rcp-skeleton--width-two-thirds', 'responsive Vue skeleton width');
    assertIncludes(body, 'aria-busy="true"', 'responsive Vue busy state');
    assertIncludes(body, 'href="/tenants"', 'responsive Vue link');
    assertIncludes(body, 'prefers-reduced-motion', 'responsive CSS media query');
    assertNotIncludes(body, 'style="', 'responsive Vue inline style');
    expectNotFound(await request('/missing'), 'responsive Vue missing route');
    return { detail: 'all six Vue primitives rendered with shared CSS; no inline style; route 404 refusal' };
  },

  'responsive-primitives-svelte': async ({ request }) => {
    const index = await request('/');
    const indexBody = expectOk(index, 'responsive Svelte index');
    for (const name of ['spinner', 'skeleton', 'loading', 'async', 'button', 'link', 'shell']) {
      assertIncludes(indexBody, `href="/${name}"`, `responsive Svelte index link ${name}`);
    }
    const spinner = await request('/spinner');
    assertIncludes(expectOk(spinner, 'responsive Svelte spinner'), 'facetheory-rcp-spinner', 'responsive Svelte spinner class');
    const skeleton = await request('/skeleton');
    assertIncludes(expectOk(skeleton, 'responsive Svelte skeleton'), 'facetheory-rcp-skeleton--width-two-thirds', 'responsive Svelte skeleton width');
    const loading = await request('/loading');
    assertIncludes(expectOk(loading, 'responsive Svelte loading'), 'aria-busy="true"', 'responsive Svelte busy state');
    const button = await request('/button');
    assertIncludes(expectOk(button, 'responsive Svelte button'), 'facetheory-rcp-button--loading', 'responsive Svelte loading button');
    const link = await request('/link');
    assertIncludes(expectOk(link, 'responsive Svelte link'), 'href="/tenants"', 'responsive Svelte link target');
    const shell = await request('/shell');
    assertIncludes(expectOk(shell, 'responsive Svelte styles shell'), 'prefers-reduced-motion', 'responsive Svelte CSS media query');
    expectNotFound(await request('/missing'), 'responsive Svelte missing route');
    return { detail: 'compiled Svelte primitives served as real pages: spinner, skeleton, loading, async, button, link; shared CSS shell; 404 refusal' };
  },

  'vite-strict-csp-react': async ({ request }) => runStrictCsp(request, 'React', 'strict-csp-react'),
  'vite-strict-csp-svelte': async ({ request }) => runStrictCsp(request, 'Svelte', 'strict-csp-svelte'),
  'vite-strict-csp-vue': async ({ request }) => runStrictCsp(request, 'Vue', 'strict-csp-vue'),

  'apptheory-local-handler': async ({ row, root, apptheory, env }) => {
    const profile = HANDLER_PROFILES[row.expect?.profile];
    if (!profile) throw new RunError(`${row.id}: unknown handler profile ${String(row.expect?.profile)}`);
    const session = await startInvokeSession({ root, row, runner: apptheory, env });
    try {
      const rootEvent = functionUrlEvent({ rowId: row.id });
      const rootResult = await session.call(rootEvent);
      assertProxyResult(rootResult, `${row.id} GET /`);
      assertEqual(rootResult.statusCode, 200, `${row.id} GET / status`);
      assertEqual(lambdaHeader(rootResult, 'content-type'), 'text/html; charset=utf-8', `${row.id} GET / content-type`);
      assertEqual(rootResult.body, profile.rootBody, `${row.id} GET / body`);
      if (row.expect?.echoRequestId === true) {
        assertEqual(
          lambdaHeader(rootResult, 'x-request-id'),
          rootEvent.requestContext.requestId,
          `${row.id} GET / echoes the Function URL request id`,
        );
      }

      const catchEvent = functionUrlEvent({ rowId: row.id, path: '/anything' });
      const catchResult = await session.call(catchEvent);
      assertProxyResult(catchResult, `${row.id} GET /anything`);
      assertEqual(catchResult.statusCode, 200, `${row.id} GET /anything status`);
      assertEqual(lambdaHeader(catchResult, 'content-type'), 'text/html; charset=utf-8', `${row.id} GET /anything content-type`);
      assertEqual(catchResult.body, profile.catchAllBody, `${row.id} GET /anything body`);

      const postEvent = functionUrlEvent({ rowId: row.id, method: 'POST', body: 'hello' });
      const postResult = await session.call(postEvent);
      assertProxyResult(postResult, `${row.id} POST /`);
      if (profile.refusal === '405') {
        assertEqual(postResult.statusCode, 405, `${row.id} POST / status`);
        assertEqual(lambdaHeader(postResult, 'allow'), 'GET, HEAD', `${row.id} POST / allow`);
        assertIncludes(postResult.body, '"code":"app.method_not_allowed"', `${row.id} POST / refusal code`);
      } else {
        assertEqual(postResult.statusCode, 200, `${row.id} POST / status (this example has no refusal path)`);
        assertEqual(postResult.body, profile.rootBody, `${row.id} POST / body (this example has no refusal path)`);
      }

      if (profile.refusal === '405') {
        return {
          detail:
            'real handler in the official Lambda Node image via apptheory-local; complete buffered streaming bodies, catch-all proxy and the 405 method refusal; chunk timing is the named gap',
        };
      }
      return {
        detail:
          'real handler in the official Lambda Node image via apptheory-local; complete buffered streaming bodies and catch-all proxy; this example has no refusal path (POST is method-agnostic); chunk timing is the named gap',
      };
    } finally {
      await session.close();
    }
  },

  'apptheory-local-gateway': async ({ row, root, request }) => {
    const page = await request('/', { headers: { 'x-request-id': 'ft2-gateway-check' } });
    assertEqual(page.status, 200, 'SSR page status');
    assertHeader(page.headers, 'content-type', /^text\/html; charset=utf-8$/);
    assertHeader(page.headers, 'cache-control', 'private, no-store');
    assertHeader(page.headers, 'x-request-id', 'ft2-gateway-check');
    assertHeader(page.headers, 'x-frame-options', 'DENY');
    assertHeader(page.headers, 'x-content-type-options', 'nosniff');
    assertHeader(page.headers, 'referrer-policy', 'strict-origin-when-cross-origin');
    assertMatch(page.headers['strict-transport-security'] ?? '', /^max-age=\d+/, 'SSR page HSTS policy');
    assertIncludes(page.body, '<title>FaceTheory + AppTheorySsrSite</title>', 'SSR page title');
    assertIncludes(page.body, '<h1>FaceTheory Infra Example</h1>', 'SSR page body');
    assertIncludes(page.body, '<link href="/assets/entry.css" rel="stylesheet">', 'SSR page stylesheet tag');
    assertIncludes(page.body, '<script type="module" src="/assets/entry.js"></script>', 'SSR page module script');

    const css = await request('/assets/entry.css');
    assertEqual(css.status, 200, 'asset status');
    assertHeader(css.headers, 'content-type', 'text/css');
    assertHeader(css.headers, 'cache-control', 'public,max-age=31536000,immutable');
    assertHeader(css.headers, 'x-content-type-options', 'nosniff');
    const cssSource = await readFile(path.join(root, 'infra/apptheory-ssr-site/deploy/assets/entry.css'), 'utf8');
    assertEqual(css.body, cssSource, 'asset bytes match the deployed source');

    const manifest = await request('/.vite/manifest.json');
    assertEqual(manifest.status, 200, 'Vite manifest status');
    assertHeader(manifest.headers, 'content-type', 'application/json');
    assertHeader(manifest.headers, 'cache-control', 'public,max-age=0,must-revalidate');
    assertIncludes(manifest.body, '"file": "assets/entry.js"', 'Vite manifest content');

    const data = await request('/_facetheory/data/index.json');
    assertEqual(data.status, 200, 'SSG data status');
    assertHeader(data.headers, 'content-type', 'application/json');
    assertHeader(data.headers, 'cache-control', 'public,max-age=0,s-maxage=600');
    const dataSource = await readFile(
      path.join(root, 'infra/apptheory-ssr-site/deploy/ssg/_facetheory/data/index.json'),
      'utf8',
    );
    assertEqual(data.body, dataSource, 'SSG data bytes match the deployed source');

    const missing = await request('/assets/missing.css');
    assertEqual(missing.status, 403, 'missing asset status (OAC S3 origin)');
    assertHeader(missing.headers, 'content-type', 'application/xml');
    assertIncludes(missing.body, 'AccessDenied', 'missing asset refusal body');

    const notFound = await request('/missing-route');
    assertEqual(notFound.status, 404, 'missing SSR route status');
    assertHeader(notFound.headers, 'content-type', /^text\/html; charset=utf-8$/);
    assertIncludes(notFound.body, '<h1>Not Found</h1>', 'missing SSR route body');
    assertIncludes(notFound.body, 'No FaceTheory reference route matched', 'missing SSR route message');

    return {
      detail:
        'gateway served the real SSR handler through the AWS_IAM Function URL origin, the deployed CSS and Vite manifest from the S3 origin, the SSG data path, a 403 missing asset and the handler 404; CloudFront caching, the edge network/TLS, IAM policy evaluation and buffered streaming are the named gaps',
    };
  },

  'apptheory-local-gateway-isr': async ({ row, root, request, logPath }) => {
    const prefix = dockerPrefixFor(row);
    const endpoints = gatewayBackendEndpoints(prefix);
    const log = await readFile(logPath, 'utf8').catch(() => '');
    const tableName = /provisioned DynamoDB table (\S+) for CacheTable\w*/.exec(log)?.[1];
    const isrBucket = /provisioned s3 bucket (\S+) for IsrBucket\w*/.exec(log)?.[1];
    const assetsBucket = /provisioned s3 bucket (\S+) for AssetsBucket\w*/.exec(log)?.[1];
    assert(tableName, 'the gateway run did not provision the CacheTable');
    assert(isrBucket, 'the gateway run did not provision the IsrBucket');
    assert(assetsBucket, 'the gateway run did not provision the AssetsBucket');

    const page = await request('/', { headers: { 'x-request-id': 'ft3-gateway-check' } });
    assertEqual(page.status, 200, 'SSG page status');
    // SSG HTML is served from S3, where the local deployment emulation stores
    // .html with the AWS CLI's extension-inferred "text/html" (no charset) and
    // the origin passes that object header through; the Lambda-origin ISR
    // responses below keep the strict framework "text/html; charset=utf-8".
    assertHeader(page.headers, 'content-type', /^text\/html(?:; charset=utf-8)?$/);
    assertHeader(page.headers, 'x-request-id', 'ft3-gateway-check');
    assertHeader(page.headers, 'x-frame-options', 'DENY');
    assertHeader(page.headers, 'x-content-type-options', 'nosniff');
    assertHeader(page.headers, 'referrer-policy', 'strict-origin-when-cross-origin');
    assertMatch(page.headers['strict-transport-security'] ?? '', /^max-age=\d+/, 'SSG page HSTS policy');
    assert(lambdaMarker(page) === undefined, 'SSG HTML must come from S3, not the Lambda origin');
    const indexSource = await readFile(
      path.join(root, 'infra/apptheory-ssg-isr-site/deploy/ssg/index.html'),
      'utf8',
    );
    assertEqual(page.body, indexSource, 'SSG HTML bytes match the deployed source');

    const ssgDemo = await request('/ssg-demo');
    assertEqual(ssgDemo.status, 200, 'SSG demo status');
    assert(lambdaMarker(ssgDemo) === undefined, 'SSG demo must come from S3');
    const ssgDemoSource = await readFile(
      path.join(root, 'infra/apptheory-ssg-isr-site/deploy/ssg/ssg-demo/index.html'),
      'utf8',
    );
    assertEqual(ssgDemo.body, ssgDemoSource, 'SSG demo bytes match the deployed source');

    const css = await request('/assets/entry.css');
    assertEqual(css.status, 200, 'asset status');
    assertHeader(css.headers, 'content-type', 'text/css');
    assertHeader(css.headers, 'cache-control', 'public,max-age=31536000,immutable');
    const cssSource = await readFile(
      path.join(root, 'infra/apptheory-ssg-isr-site/deploy/assets/entry.css'),
      'utf8',
    );
    assertEqual(css.body, cssSource, 'asset bytes match the deployed source');

    const manifest = await request('/.vite/manifest.json');
    assertEqual(manifest.status, 200, 'Vite manifest status');
    assertHeader(manifest.headers, 'content-type', 'application/json');
    const manifestSource = await readFile(
      path.join(root, 'infra/apptheory-ssg-isr-site/deploy/vite-manifest/.vite/manifest.json'),
      'utf8',
    );
    assertEqual(manifest.body, manifestSource, 'Vite manifest bytes match the deployed source');

    const data = await request('/_facetheory/data/index.json');
    assertEqual(data.status, 200, 'SSG data status');
    assertHeader(data.headers, 'content-type', 'application/json');
    const dataSource = await readFile(
      path.join(root, 'infra/apptheory-ssg-isr-site/deploy/ssg/_facetheory/data/index.json'),
      'utf8',
    );
    assertEqual(data.body, dataSource, 'SSG data bytes match the deployed source');

    const first = await request('/isr-demo');
    assertEqual(first.status, 200, 'ISR page status');
    assertHeader(first.headers, 'content-type', /^text\/html; charset=utf-8$/);
    assertHeader(first.headers, 'x-facetheory-ssr', '1');
    assertHeader(first.headers, 'x-facetheory-isr', 'miss');
    assertIncludes(first.body, '<h1>ISR demo</h1>', 'ISR page body');
    assertIncludes(first.body, 'Generated at:', 'ISR page generation');
    const second = await request('/isr-demo');
    assertEqual(second.status, 200, 'ISR hit status');
    assertHeader(second.headers, 'x-facetheory-isr', 'hit');
    assertEqual(second.body, first.body, 'ISR hit bytes');

    const items = await scanTable({ endpoint: endpoints.dynamodb, tableName });
    const metadata = items.filter((item) => valueOf(item, 'sk') === 'META');
    assertEqual(metadata.length, 1, 'ISR metadata item count');
    const meta = metadata[0];
    assert(
      String(valueOf(meta, 'pk')).startsWith('CACHE#default::/isr-demo?'),
      `ISR metadata pk: ${String(valueOf(meta, 'pk'))}`,
    );
    const pointer = valueOf(meta, 's3_key');
    assert(typeof pointer === 'string' && pointer.length > 0, 'ISR metadata s3_key is missing');
    assertEqual(valueOf(meta, 'revalidate_seconds'), 5, 'ISR metadata revalidate_seconds');
    assert(Number(valueOf(meta, 'generated_at')) > 0, 'ISR metadata generated_at is missing');
    const etag = valueOf(meta, 'etag');
    assert(typeof etag === 'string' && etag.length > 0, 'ISR metadata etag is missing');

    const key = `isr/${pointer}`;
    const object = await getObject({ endpoint: endpoints.s3, bucket: isrBucket, key });
    assertEqual(object.body.toString('utf8'), first.body, 'stored ISR HTML bytes');
    assertMatch(object.contentType ?? '', /^text\/html;\s?charset=utf-8$/, 'stored ISR content type');
    assertEqual(object.metadata['facetheory-status'], '200', 'stored ISR status metadata');
    assertEqual(object.etag, etag, 'ISR metadata etag matches the S3 object');

    const ttl = await describeTtl({ endpoint: endpoints.dynamodb, tableName });
    assertEqual(ttl.TimeToLiveStatus, 'ENABLED', 'ISR table TTL status');
    assertEqual(ttl.AttributeName, 'ttl', 'ISR table TTL attribute');
    assert(
      !items.some((item) => valueOf(item, 'sk') === 'LOCK'),
      'the committed ISR generation left a lease item behind',
    );
    const lease = await observeLease({
      root,
      storage: { endpoints, tableName },
      cacheKey: `ft3-gateway-lease-probe-${rowSlug(row.id)}`,
    });
    const invalidateMessage = await assertInvalidateUnsupported({
      root,
      storage: { endpoints, tableName },
      cacheKey: `ft3-gateway-invalidate-probe-${rowSlug(row.id)}`,
    });

    const missingAsset = await request('/assets/missing.css');
    assertEqual(missingAsset.status, 403, 'missing asset status (OAC S3 origin)');
    assertHeader(missingAsset.headers, 'content-type', 'application/xml');
    assertIncludes(missingAsset.body, 'AccessDenied', 'missing asset refusal body');

    const notFound = await request('/missing-route');
    assertEqual(notFound.status, 404, 'missing SSR route status');
    assertHeader(notFound.headers, 'content-type', /^text\/html; charset=utf-8$/);
    assertIncludes(notFound.body, '<h1>Not Found</h1>', 'missing SSR route body');
    assertIncludes(notFound.body, '&quot;path&quot;: &quot;/missing-route&quot;', 'missing SSR route context');

    return {
      detail: `gateway served SSG HTML and assets from the S3 origin, the ISR miss/generation/hit through the AWS_IAM Function URL origin with stored object ${key} and metadata ${String(valueOf(meta, 'pk'))}, lease ${lease.token.slice(0, 8)}…/${lease.expiresAt}/${lease.ttl}, invalidate refused, a 403 missing asset and the handler 404; CloudFront caching/edge/TLS, IAM policy evaluation, S3 policies/CORS, viewer protocol enforcement and buffered streaming remain the named gaps`,
    };
  },

  'via-host': async ({ row, results }) => {
    const host = results.get(row.verifiedBy);
    if (!host || host.status !== 'passed') {
      throw new RunError(`host row ${row.verifiedBy} did not pass`);
    }
    assert(host.library === true, `host row ${row.verifiedBy} did not assert packaged library markup`);
    return { detail: `verified through ${row.verifiedBy}: packaged LibraryPanel markup, package CSS and badge asset served` };
  },

  'infra-synth': async ({ row, root }) => {
    const snapshot = row.snapshot;
    assert(typeof snapshot === 'string' && snapshot.length > 0, 'infra-synth row must name its snapshot');
    const content = await readFile(path.join(root, snapshot), 'utf8');
    assertIncludes(content, '"AWS::CloudFront::Distribution"', 'infra snapshot CloudFront distribution');
    assertIncludes(content, '"AWS::Lambda::Function"', 'infra snapshot Lambda function');
    assertIncludes(content, '"AWS::S3::Bucket"', 'infra snapshot S3 bucket');
    if (row.stack === 'ssg-isr') {
      assertIncludes(content, '"AWS::DynamoDB::Table"', 'infra snapshot DynamoDB table');
      assertIncludes(content, 'FACETHEORY_ISR_BUCKET', 'infra snapshot ISR bucket env');
      assertIncludes(content, 'FACETHEORY_ISR_PREFIX', 'infra snapshot ISR prefix env');
    }
    return { detail: `synth snapshot ${snapshot} asserted: CloudFront, Lambda, S3${row.stack === 'ssg-isr' ? ', DynamoDB and ISR env' : ''}` };
  },

  pending: async () => ({ detail: 'pending' }),
};
