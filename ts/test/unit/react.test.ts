import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import {
  createReactFace,
  createReactStreamFace,
  renderReact,
} from '../../src/adapters/react.js';
import {
  InMemoryHtmlStore,
  InMemoryIsrMetaStore,
  type HtmlStore,
  type HtmlStoreReadResult,
  type HtmlStoreWriteInput,
  type HtmlStoreWriteResult,
} from '../../src/isr.js';
import { buildSsgSite } from '../../src/ssg.js';
import type { FaceContext } from '../../src/types.js';
import { viteHydrationForEntry } from '../../src/vite.js';

const baseCtx: FaceContext = {
  request: {
    method: 'GET',
    path: '/',
    query: {},
    headers: { 'x-request-id': ['test-react'] },
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
    return { etag: `react-test-etag-${String(this.writes.length)}` };
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

test('react adapter: renders ReactNode + head tags + hydration', async () => {
  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: () => React.createElement('main', null, 'Hello from React'),
        renderOptions: {
          headTags: [{ type: 'title', text: 'Home' }],
          hydration: {
            data: { message: '<hi>&</hi>' },
            bootstrapModule: '/assets/entry.js',
          },
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 200);

  const body = new TextDecoder().decode(resp.body as Uint8Array);
  assert.ok(body.startsWith('<!doctype html>'));
  assert.ok(body.includes('<title>Home</title>'));
  assert.ok(body.includes('<main>Hello from React</main>'));

  assert.ok(body.includes('id="__FACETHEORY_DATA__"'));
  assert.ok(body.includes('\\u003c'));
  assert.ok(!body.includes('<hi>'));

  const m = body.match(
    /<script[^>]*id="__FACETHEORY_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  assert.ok(m?.[1]);
  assert.deepEqual(JSON.parse(m![1]), { message: '<hi>&</hi>' });

  assert.ok(
    body.includes('<script src="/assets/entry.js" type="module"></script>'),
  );
});

test('react adapter: renders non-element ReactNode', async () => {
  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: () => 'ok',
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  const body = new TextDecoder().decode(resp.body as Uint8Array);
  assert.ok(body.includes('<body>ok</body>'));
});

test('react adapter: strict CSP emits external hydration without inline data', async () => {
  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: () => React.createElement('main', null, 'Strict React'),
        renderOptions: {
          csp: { inlineScripts: false, inlineStyles: false, rawHead: false },
          hydration: {
            type: 'external',
            data: { message: '<strict-react>' },
            dataUrl: '/_facetheory/data/react.json',
            bootstrapModule: '/assets/react-entry.js',
          },
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 200);

  const body = new TextDecoder().decode(resp.body as Uint8Array);
  assert.ok(body.includes('Strict React'));
  assert.ok(body.includes('id="__FACETHEORY_DATA_URL__"'));
  assert.ok(body.includes('href="/_facetheory/data/react.json"'));
  assert.ok(
    body.includes(
      '<script src="/assets/react-entry.js" type="module"></script>',
    ),
  );
  assert.ok(!body.includes('id="__FACETHEORY_DATA__"'));
  assert.ok(!body.includes('<strict-react>'));
});

test('react adapter: strict SSR sidecars serve the exact React hydration payload without rerendering', async () => {
  const htmlStore = new RecordingHtmlStore();
  const manifest = {
    'src/react-client.tsx': { file: 'assets/react-client.123abc.js' },
  };
  const payloadSecret = 'react-ssr-sidecar-secret';
  const sidecarSigningSecret =
    'react adapter ssr sidecar signing secret with enough entropy';
  let loadCount = 0;
  let renderCount = 0;
  let reactRenderPayload: unknown = null;

  const app = createFaceApp({
    faces: [
      createReactFace<{
        hydrationPayload: {
          profile: { displayName: string };
          requestId: string;
          payloadSecret: string;
          terminator: string;
        };
      }>({
        route: '/react-ssr-sidecar',
        mode: 'ssr',
        load: async (ctx) => {
          loadCount += 1;
          return {
            hydrationPayload: {
              profile: { displayName: 'React Sidecar' },
              requestId: ctx.request.headers['x-request-id']?.[0] ?? '',
              payloadSecret,
              terminator: '</script><script>alert("react")</script>',
            },
          };
        },
        render: (_ctx, data) => {
          renderCount += 1;
          return React.createElement(
            'main',
            { 'data-request-id': data.hydrationPayload.requestId },
            data.hydrationPayload.profile.displayName,
          );
        },
        renderOptions: (_ctx, data) => {
          reactRenderPayload = data.hydrationPayload;
          return {
            csp: {
              inlineScripts: false,
              inlineStyles: false,
              rawHead: false,
            },
            hydration: viteHydrationForEntry(
              manifest,
              'src/react-client.tsx',
              data.hydrationPayload,
            ),
          };
        },
      }),
    ],
    ssrHydrationSidecars: {
      htmlStore,
      signingSecret: sidecarSigningSecret,
      now: () => 6_000,
    },
  });

  const page = await app.handle({
    method: 'GET',
    path: '/react-ssr-sidecar',
    headers: { 'x-request-id': ['react-ssr-sidecar-request'] },
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
      '<main data-request-id="react-ssr-sidecar-request">React Sidecar</main>',
    ),
  );
  assert.ok(
    html.includes(
      '<script src="/assets/react-client.123abc.js" type="module"></script>',
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
    reactRenderPayload,
  );
  assert.deepEqual(
    parseJsonBody(htmlStore.writes[0]!.body),
    reactRenderPayload,
  );
  assert.equal(loadCount, 1);
  assert.equal(renderCount, 1);
});

test('react adapter: strict SSR without sidecar runtime fails closed before inline hydration succeeds', async () => {
  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/react-ssr-without-sidecars',
        mode: 'ssr',
        render: () => React.createElement('main', null, 'React strict SSR'),
        renderOptions: {
          csp: {
            inlineScripts: false,
            inlineStyles: false,
            rawHead: false,
          },
          hydration: {
            data: {
              secret: 'react strict SSR inline payload',
              terminator: '</script>',
            },
            bootstrapModule: '/assets/react-entry.js',
          },
        },
      }),
    ],
  });

  const response = await app.handle({
    method: 'GET',
    path: '/react-ssr-without-sidecars',
  });
  assert.equal(response.status, 500);

  const html = decodeBody(response.body as Uint8Array);
  assert.ok(html.includes('Internal Server Error'));
  assert.equal(html.includes('React strict SSR'), false);
  assert.equal(html.includes('__FACETHEORY_DATA__'), false);
  assert.equal(html.includes('react strict SSR inline payload'), false);
});

test('react adapter: ISR strict CSP lets runtime externalize legacy hydration sidecars', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  const secret = 'REACT_ISR_HYDRATION_SECRET';
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/react-isr',
        mode: 'isr',
        render: () =>
          React.createElement('main', null, `React ISR ${++renderCount}`),
        renderOptions: {
          csp: {
            inlineScripts: false,
            inlineStyles: false,
            rawHead: false,
          },
          hydration: {
            data: {
              secret,
              terminator: '</script>',
            },
            bootstrapModule: '/assets/react-entry.js',
          },
        },
      }),
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => 1_000,
    },
  });

  const response = await app.handle({ method: 'GET', path: '/react-isr' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['x-facetheory-isr']?.[0], 'miss');

  const html = decodeBody(response.body as Uint8Array);
  const sidecarHref = externalHydrationHref(html);
  assert.ok(html.includes('<main>React ISR 1</main>'));
  assert.ok(html.includes('src="/assets/react-entry.js"'));
  assert.equal(html.includes('id="__FACETHEORY_DATA__"'), false);
  assert.equal(html.includes(secret), false);
  assert.match(sidecarHref, /^\/react-isr\?__facetheory_isr_hydration=/);

  const sidecar = await app.handle({ method: 'GET', path: sidecarHref });
  assert.equal(sidecar.status, 200);
  assert.equal(
    sidecar.headers['content-type']?.[0],
    'application/json; charset=utf-8',
  );
  assert.equal(renderCount, 1);
  assert.deepEqual(JSON.parse(decodeBody(sidecar.body as Uint8Array)), {
    secret,
    terminator: '</script>',
  });
});

test('react adapter: SSG strict CSP lets build externalize legacy streaming hydration sidecars', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-react-ssg-'));
  const outDir = path.resolve(tempRoot, 'out');

  try {
    const result = await buildSsgSite({
      faces: [
        createReactStreamFace({
          route: '/',
          mode: 'ssg',
          render: () =>
            React.createElement('main', null, 'React SSG strict stream'),
          renderOptions: {
            csp: {
              inlineScripts: false,
              inlineStyles: false,
              rawHead: false,
            },
            hydration: {
              data: {
                message: '</script><script>alert("react")</script>',
              },
              bootstrapModule: '/assets/react-entry.js',
            },
          },
        }),
      ],
      outDir,
    });

    assert.equal(
      result.pages[0]?.hydrationDataFile,
      '_facetheory/data/index.json',
    );

    const html = await readFile(path.resolve(outDir, 'index.html'), 'utf8');
    assert.ok(html.includes('<main>React SSG strict stream</main>'));
    assert.ok(html.includes('id="__FACETHEORY_DATA_URL__"'));
    assert.ok(html.includes('href="/_facetheory/data/index.json"'));
    assert.ok(html.includes('src="/assets/react-entry.js"'));
    assert.equal(html.includes('id="__FACETHEORY_DATA__"'), false);
    assert.equal(html.includes('</script><script>alert'), false);

    const hydrationJson = await readFile(
      path.resolve(outDir, '_facetheory/data/index.json'),
      'utf8',
    );
    assert.equal(
      hydrationJson,
      '{"message":"\\u003c/script\\u003e\\u003cscript\\u003ealert(\\"react\\")\\u003c/script\\u003e"}\n',
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('react adapter: strict CSP rejects inline hydration before head emission', async () => {
  await assert.rejects(
    () =>
      renderReact(
        baseCtx,
        React.createElement('main', null, 'Inline hydration'),
        {
          csp: { inlineScripts: false },
          hydration: {
            data: { unsafe: true },
            bootstrapModule: '/assets/react-entry.js',
          },
        },
      ),
    /React adapter strict CSP requires external hydration data/,
  );
});
