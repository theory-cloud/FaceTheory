import assert from 'node:assert/strict';
import test from 'node:test';

import { compile } from 'svelte/compiler';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertDocumentTagNonces } from '../helpers/csp.js';

import { createFaceApp } from '../../src/app.js';
import {
  type HtmlStore,
  type HtmlStoreReadResult,
  type HtmlStoreWriteInput,
  type HtmlStoreWriteResult,
} from '../../src/isr.js';
import { createSvelteFace, renderSvelte } from '../../src/svelte/index.js';
import type { FaceContext } from '../../src/types.js';
import { viteHydrationForEntry } from '../../src/vite.js';

const baseCtx: FaceContext = {
  request: {
    method: 'GET',
    path: '/',
    query: {},
    headers: { 'x-request-id': ['test-svelte'] },
    cookies: {},
    body: new Uint8Array(),
    isBase64: false,
    cspNonce: null,
  },
  params: {},
  proxy: null,
};

function decodeBody(body: Uint8Array): string {
  return new TextDecoder().decode(body);
}

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
    return { etag: `svelte-test-etag-${String(this.writes.length)}` };
  }
}

function externalHydrationHref(html: string): string {
  const tag = /<link\b[^>]*__FACETHEORY_DATA_URL__[^>]*>/i.exec(html)?.[0];
  assert.ok(tag, 'expected external hydration link tag');
  const href = /\bhref="([^"]+)"/i.exec(tag)?.[1];
  assert.ok(href, 'expected external hydration href');
  return href;
}

function parseJsonBody(responseBody: Uint8Array): unknown {
  return JSON.parse(decodeBody(responseBody));
}

test('svelte adapter: renders component + extracts css', async () => {
  const source = `
    <script>
      export let name;
    </script>

    <style>
      main { color: rgb(9, 8, 7); }
    </style>

    <main>Hello {name}</main>
  `;

  const compiled = compile(source, { generate: 'server' } as any);
  assert.ok(compiled.css);
  const cssText = compiled.css.code;

  const dir = path.resolve('.tmp-facetheory-svelte');
  await mkdir(dir, { recursive: true });

  const file = path.join(dir, `component-${Date.now()}.mjs`);
  await writeFile(file, compiled.js.code, 'utf8');

  try {
    const mod = await import(pathToFileURL(file).href);
    const Component = mod.default as unknown;

    const app = createFaceApp({
      faces: [
        createSvelteFace({
          route: '/',
          mode: 'ssr',
          render: () => ({
            component: Component,
            props: { name: 'Svelte' },
            cssText,
          }),
          renderOptions: { headTags: [{ type: 'title', text: 'Svelte' }] },
        }),
      ],
    });

    const resp = await app.handle({ method: 'GET', path: '/' });
    const body = new TextDecoder().decode(resp.body as Uint8Array);

    assert.ok(body.includes('<title>Svelte</title>'));
    assert.ok(body.includes('Hello Svelte'));
    assert.ok(body.includes('<style'));
    assert.ok(body.includes('rgb(9, 8, 7)'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('svelte adapter: integration hooks provide deterministic head/style ordering and nonce coverage', async () => {
  let nextStateId = 0;
  const source = `
    <script>
      export let name;
    </script>

    <svelte:head>
      <meta name="svelte-head" content="yes" />
    </svelte:head>

    <style>
      main { color: rgb(90, 80, 70); }
    </style>

    <main class="from-int from-options">Hello {name}</main>
  `;

  const compiled = compile(source, { generate: 'server' } as any);
  assert.ok(compiled.css);
  const cssText = compiled.css.code;

  const dir = path.resolve('.tmp-facetheory-svelte');
  await mkdir(dir, { recursive: true });

  const file = path.join(dir, `component-${Date.now()}-integration.mjs`);
  await writeFile(file, compiled.js.code, 'utf8');

  try {
    const mod = await import(pathToFileURL(file).href);
    const Component = mod.default as unknown;

    const app = createFaceApp({
      faces: [
        createSvelteFace({
          route: '/',
          mode: 'ssr',
          load: async () => ({ name: 'Svelte Integration' }),
          render: (_ctx, data) => ({
            component: Component,
            props: { name: (data as { name: string }).name },
            cssText,
          }),
          renderOptions: {
            head: { title: 'Svelte Integration Title' },
            headTags: [
              {
                type: 'link',
                attrs: { rel: 'stylesheet', href: '/options-svelte.css' },
              },
              {
                type: 'script',
                attrs: { id: 'options-inline' },
                body: 'window.__SVELTE_OPTIONS__=1;',
              },
            ],
            styleTags: [
              {
                cssText: '.from-options{font-weight:bold;}',
                attrs: { id: 'style-options' },
              },
            ],
            hydration: {
              data: { framework: 'svelte' },
              bootstrapModule: '/assets/svelte-entry.js',
            },
            integrations: [
              {
                name: 'svelte-wrap-contrib-finalize',
                createState: () => ({ id: ++nextStateId }),
                wrapTree: (input, _ctx, state) => ({
                  ...input,
                  props: {
                    ...(input.props ?? {}),
                    name: `${String((input.props as any)?.name ?? '')} + wrapped ${String((state as { id: number }).id)}`,
                  },
                }),
                contribute: (_ctx, state) => ({
                  headTags: [
                    {
                      type: 'link',
                      attrs: {
                        rel: 'stylesheet',
                        href: `/integration-a-${String((state as { id: number }).id)}.css`,
                      },
                    },
                  ],
                  styleTags: [
                    {
                      cssText: `.from-int{letter-spacing:1px;} .from-int-state-${String((state as { id: number }).id)}{display:block;}`,
                      attrs: {
                        id: `style-int-${String((state as { id: number }).id)}`,
                      },
                    },
                  ],
                }),
                finalize: (out, _ctx, state) => ({
                  ...out,
                  headTags: [
                    ...(out.headTags ?? []),
                    {
                      type: 'link',
                      attrs: {
                        rel: 'stylesheet',
                        href: `/integration-b-${String((state as { id: number }).id)}.css`,
                      },
                    },
                  ],
                }),
              },
            ],
          },
        }),
      ],
    });

    const nonce = 'nonce-svelte-r6';
    const resp = await app.handle({
      method: 'GET',
      path: '/',
      cspNonce: nonce,
    });
    const body = new TextDecoder().decode(resp.body as Uint8Array);

    assert.ok(body.includes('<title>Svelte Integration Title</title>'));
    assert.ok(body.includes('Hello Svelte Integration + wrapped 1'));
    assert.ok(body.includes('name="svelte-head"'));
    assert.ok(body.includes('id="__FACETHEORY_DATA__"'));

    const idxIntegrationA = body.indexOf('/integration-a-1.css');
    const idxOptions = body.indexOf('/options-svelte.css');
    const idxIntegrationB = body.indexOf('/integration-b-1.css');
    assert.ok(idxIntegrationA >= 0 && idxOptions >= 0 && idxIntegrationB >= 0);
    assert.ok(idxIntegrationA < idxOptions);
    assert.ok(idxOptions < idxIntegrationB);

    const idxStyleInt = body.indexOf('id="style-int-1"');
    const idxStyleOptions = body.indexOf('id="style-options"');
    assert.ok(idxStyleInt >= 0 && idxStyleOptions >= 0);
    assert.ok(idxStyleInt < idxStyleOptions);

    assertDocumentTagNonces(body, nonce, 3, 2);

    const secondResp = await app.handle({ method: 'GET', path: '/' });
    const secondBody = new TextDecoder().decode(secondResp.body as Uint8Array);
    assert.ok(secondBody.includes('Hello Svelte Integration + wrapped 2'));
    assert.ok(secondBody.includes('/integration-a-2.css'));
    assert.ok(secondBody.includes('/integration-b-2.css'));
    assert.ok(secondBody.includes('id="style-int-2"'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('svelte adapter: strict CSP emits external hydration without inline data', async () => {
  const Component = {
    render: () => ({ html: '<main>Strict Svelte</main>' }),
  };

  const app = createFaceApp({
    faces: [
      createSvelteFace({
        route: '/',
        mode: 'ssr',
        render: () => ({ component: Component }),
        renderOptions: {
          csp: { inlineScripts: false, inlineStyles: false, rawHead: false },
          hydration: {
            type: 'external',
            data: { message: '<strict-svelte>' },
            dataUrl: '/_facetheory/data/svelte.json',
            bootstrapModule: '/assets/svelte-entry.js',
          },
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 200);

  const body = new TextDecoder().decode(resp.body as Uint8Array);
  assert.ok(body.includes('Strict Svelte'));
  assert.ok(body.includes('id="__FACETHEORY_DATA_URL__"'));
  assert.ok(body.includes('href="/_facetheory/data/svelte.json"'));
  assert.ok(
    body.includes(
      '<script src="/assets/svelte-entry.js" type="module"></script>',
    ),
  );
  assert.ok(!body.includes('id="__FACETHEORY_DATA__"'));
  assert.ok(!body.includes('<strict-svelte>'));
});

test('svelte adapter: strict SSR sidecars serve the exact Svelte hydration payload without rerendering', async () => {
  const htmlStore = new RecordingHtmlStore();
  const manifest = {
    'src/svelte-client.ts': { file: 'assets/svelte-client.123abc.js' },
  };
  const payloadSecret = 'svelte-ssr-sidecar-secret';
  const sidecarSigningSecret =
    'svelte adapter ssr sidecar signing secret with enough entropy';
  let loadCount = 0;
  let renderCount = 0;
  let svelteRenderPayload: unknown = null;

  const app = createFaceApp({
    faces: [
      createSvelteFace<{
        hydrationPayload: {
          profile: { displayName: string };
          requestId: string;
          payloadSecret: string;
          terminator: string;
        };
      }>({
        route: '/svelte-ssr-sidecar',
        mode: 'ssr',
        load: async (ctx) => {
          loadCount += 1;
          return {
            hydrationPayload: {
              profile: { displayName: 'Svelte Sidecar' },
              requestId: ctx.request.headers['x-request-id']?.[0] ?? '',
              payloadSecret,
              terminator: '</script><script>alert("svelte")</script>',
            },
          };
        },
        render: (_ctx, data) => {
          renderCount += 1;
          return {
            component: {
              render: () => ({
                html: `<main data-request-id="${data.hydrationPayload.requestId}">${data.hydrationPayload.profile.displayName}</main>`,
              }),
            },
          };
        },
        renderOptions: (_ctx, data) => {
          svelteRenderPayload = data.hydrationPayload;
          return {
            csp: {
              inlineScripts: false,
              inlineStyles: false,
              rawHead: false,
            },
            hydration: viteHydrationForEntry(
              manifest,
              'src/svelte-client.ts',
              data.hydrationPayload,
            ),
          };
        },
      }),
    ],
    ssrHydrationSidecars: {
      htmlStore,
      signingSecret: sidecarSigningSecret,
      now: () => 8_000,
    },
  });

  const page = await app.handle({
    method: 'GET',
    path: '/svelte-ssr-sidecar',
    headers: { 'x-request-id': ['svelte-ssr-sidecar-request'] },
  });
  assert.equal(page.status, 200);
  assert.equal(loadCount, 1);
  assert.equal(renderCount, 1);
  assert.equal(htmlStore.writes.length, 1);

  const html = decodeBody(page.body as Uint8Array);
  const dataUrl = externalHydrationHref(html);
  assert.match(dataUrl, /^\/_facetheory\/ssr-data\//);
  assert.ok(
    html.includes(
      '<main data-request-id="svelte-ssr-sidecar-request">Svelte Sidecar</main>',
    ),
  );
  assert.ok(
    html.includes(
      '<script src="/assets/svelte-client.123abc.js" type="module"></script>',
    ),
  );
  assert.equal(html.includes('id="__FACETHEORY_DATA__"'), false);
  assert.equal(html.includes('__FACETHEORY_DATA__'), false);
  assert.equal(html.includes(payloadSecret), false);
  assert.equal(html.includes('</script><script>alert'), false);

  const sidecar = await app.handle({ method: 'GET', path: dataUrl });
  assert.equal(sidecar.status, 200);
  assert.equal(sidecar.headers['cache-control']?.[0], 'no-store');
  assert.equal(
    sidecar.headers['content-type']?.[0],
    'application/json; charset=utf-8',
  );

  const storedJson = decodeBody(htmlStore.writes[0]!.body);
  const sidecarJson = decodeBody(sidecar.body as Uint8Array);
  assert.equal(sidecarJson, storedJson);
  assert.deepEqual(
    parseJsonBody(sidecar.body as Uint8Array),
    svelteRenderPayload,
  );
  assert.deepEqual(
    parseJsonBody(htmlStore.writes[0]!.body),
    svelteRenderPayload,
  );
  assert.equal(loadCount, 1);
  assert.equal(renderCount, 1);
});

test('svelte adapter: strict SSR without sidecar runtime fails closed before inline hydration succeeds', async () => {
  const app = createFaceApp({
    faces: [
      createSvelteFace({
        route: '/svelte-ssr-without-sidecars',
        mode: 'ssr',
        render: () => ({
          component: {
            render: () => ({ html: '<main>Svelte strict SSR</main>' }),
          },
        }),
        renderOptions: {
          csp: {
            inlineScripts: false,
            inlineStyles: false,
            rawHead: false,
          },
          hydration: {
            data: {
              secret: 'svelte strict SSR inline payload',
              terminator: '</script>',
            },
            bootstrapModule: '/assets/svelte-entry.js',
          },
        },
      }),
    ],
  });

  const response = await app.handle({
    method: 'GET',
    path: '/svelte-ssr-without-sidecars',
  });
  assert.equal(response.status, 500);

  const html = decodeBody(response.body as Uint8Array);
  assert.ok(html.includes('Internal Server Error'));
  assert.equal(html.includes('Svelte strict SSR'), false);
  assert.equal(html.includes('__FACETHEORY_DATA__'), false);
  assert.equal(html.includes('svelte strict SSR inline payload'), false);
});

test('svelte adapter: strict CSP rejects inline hydration before head emission', async () => {
  await assert.rejects(
    () =>
      renderSvelte(
        baseCtx,
        {
          component: {
            render: () => ({ html: '<main>Unsafe Svelte hydration</main>' }),
          },
        },
        {
          csp: { inlineScripts: false },
          hydration: {
            data: { unsafe: true },
            bootstrapModule: '/assets/svelte-entry.js',
          },
        },
      ),
    /Svelte adapter strict CSP requires external hydration data/,
  );
});

test('svelte adapter: strict CSP rejects raw SSR head and CSS fallback', async () => {
  await assert.rejects(
    () =>
      renderSvelte(
        baseCtx,
        {
          component: {
            render: () => ({
              html: '<main>Unsafe head</main>',
              head: '<meta name="svelte-raw" content="yes">',
            }),
          },
        },
        { csp: { inlineScripts: false } },
      ),
    /Svelte adapter strict CSP rejects raw adapter head output/,
  );

  await assert.rejects(
    () =>
      renderSvelte(
        baseCtx,
        {
          component: {
            render: () => ({
              html: '<main>Unsafe CSS</main>',
              css: { code: 'main{color:red;}' },
            }),
          },
        },
        { csp: { inlineStyles: false } },
      ),
    /Svelte adapter strict CSP rejects inline adapter style output/,
  );
});
