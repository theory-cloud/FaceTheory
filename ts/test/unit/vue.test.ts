import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { assertDocumentTagNonces } from '../helpers/csp.js';

import { createFaceApp } from '../../src/app.js';
import { InMemoryHtmlStore, InMemoryIsrMetaStore } from '../../src/isr.js';
import { buildSsgSite } from '../../src/ssg.js';
import { createVueFace, h, renderVue } from '../../src/vue/index.js';
import type { FaceContext } from '../../src/types.js';

const baseCtx: FaceContext = {
  request: {
    method: 'GET',
    path: '/',
    query: {},
    headers: { 'x-request-id': ['test-vue'] },
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

function externalHydrationHref(html: string): string {
  const tag = /<link\b[^>]*__FACETHEORY_DATA_URL__[^>]*>/i.exec(html)?.[0];
  assert.ok(tag, 'expected external hydration link tag');
  const href = /\bhref="([^"]+)"/i.exec(tag)?.[1];
  assert.ok(href, 'expected external hydration href');
  return href;
}

test('vue adapter: renders VNode + head tags', async () => {
  const app = createFaceApp({
    faces: [
      createVueFace({
        route: '/',
        mode: 'ssr',
        render: () => h('main', null, 'Hello Vue'),
        renderOptions: {
          headTags: [{ type: 'title', text: 'Vue' }],
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  const body = new TextDecoder().decode(resp.body as Uint8Array);

  assert.ok(body.includes('<title>Vue</title>'));
  assert.ok(body.includes('<main>Hello Vue</main>'));
});

test('vue adapter: integration hooks provide deterministic head/style ordering and nonce coverage', async () => {
  let nextStateId = 0;
  const app = createFaceApp({
    faces: [
      createVueFace({
        route: '/',
        mode: 'ssr',
        load: async () => ({ message: 'Vue Integration' }),
        render: (_ctx, data) =>
          h('main', { class: 'from-int from-options' }, (data as any).message),
        renderOptions: {
          head: { title: 'Vue Integration Title' },
          headTags: [
            {
              type: 'link',
              attrs: { rel: 'stylesheet', href: '/options.css' },
            },
            {
              type: 'script',
              attrs: { id: 'options-inline' },
              body: 'window.__VUE_OPTIONS__=1;',
            },
          ],
          styleTags: [
            {
              cssText: '.from-options{color:rgb(20,30,40);}',
              attrs: { id: 'style-options' },
            },
          ],
          hydration: {
            data: { framework: 'vue' },
            bootstrapModule: '/assets/vue-entry.js',
          },
          integrations: [
            {
              name: 'vue-wrap-contrib-finalize',
              createState: () => ({ id: ++nextStateId }),
              wrapTree: (tree, _ctx, state) =>
                h(
                  'section',
                  {
                    class: `wrapped wrapped-${String((state as { id: number }).id)}`,
                  },
                  [tree],
                ),
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
                    cssText: `.from-int{color:rgb(1,2,3);} .from-int-state-${String((state as { id: number }).id)}{display:block;}`,
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

  const nonce = 'nonce-vue-r6';
  const resp = await app.handle({ method: 'GET', path: '/', cspNonce: nonce });
  const body = new TextDecoder().decode(resp.body as Uint8Array);

  assert.ok(body.includes('<title>Vue Integration Title</title>'));
  assert.ok(body.includes('Vue Integration'));
  assert.ok(body.includes('class="wrapped wrapped-1"'));
  assert.ok(body.includes('id="__FACETHEORY_DATA__"'));

  const idxIntegrationA = body.indexOf('/integration-a-1.css');
  const idxOptions = body.indexOf('/options.css');
  const idxIntegrationB = body.indexOf('/integration-b-1.css');
  assert.ok(idxIntegrationA >= 0 && idxOptions >= 0 && idxIntegrationB >= 0);
  assert.ok(idxIntegrationA < idxOptions);
  assert.ok(idxOptions < idxIntegrationB);

  const idxStyleInt = body.indexOf('id="style-int-1"');
  const idxStyleOptions = body.indexOf('id="style-options"');
  assert.ok(idxStyleInt >= 0 && idxStyleOptions >= 0);
  assert.ok(idxStyleInt < idxStyleOptions);

  assertDocumentTagNonces(body, nonce, 2, 2);

  const secondResp = await app.handle({ method: 'GET', path: '/' });
  const secondBody = new TextDecoder().decode(secondResp.body as Uint8Array);
  assert.ok(secondBody.includes('class="wrapped wrapped-2"'));
  assert.ok(secondBody.includes('/integration-a-2.css'));
  assert.ok(secondBody.includes('/integration-b-2.css'));
  assert.ok(secondBody.includes('id="style-int-2"'));
});

test('vue adapter: strict CSP emits external hydration without inline data', async () => {
  const app = createFaceApp({
    faces: [
      createVueFace({
        route: '/',
        mode: 'ssr',
        render: () => h('main', null, 'Strict Vue'),
        renderOptions: {
          csp: { inlineScripts: false, inlineStyles: false, rawHead: false },
          hydration: {
            type: 'external',
            data: { message: '<strict-vue>' },
            dataUrl: '/_facetheory/data/vue.json',
            bootstrapModule: '/assets/vue-entry.js',
          },
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 200);

  const body = new TextDecoder().decode(resp.body as Uint8Array);
  assert.ok(body.includes('Strict Vue'));
  assert.ok(body.includes('id="__FACETHEORY_DATA_URL__"'));
  assert.ok(body.includes('href="/_facetheory/data/vue.json"'));
  assert.ok(
    body.includes('<script src="/assets/vue-entry.js" type="module"></script>'),
  );
  assert.ok(!body.includes('id="__FACETHEORY_DATA__"'));
  assert.ok(!body.includes('<strict-vue>'));
});

test('vue adapter: ISR strict CSP lets runtime externalize legacy hydration sidecars', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  const secret = 'VUE_ISR_HYDRATION_SECRET';
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      createVueFace({
        route: '/vue-isr',
        mode: 'isr',
        render: () => h('main', null, `Vue ISR ${++renderCount}`),
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
            bootstrapModule: '/assets/vue-entry.js',
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

  const response = await app.handle({ method: 'GET', path: '/vue-isr' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['x-facetheory-isr']?.[0], 'miss');

  const html = decodeBody(response.body as Uint8Array);
  const sidecarHref = externalHydrationHref(html);
  assert.ok(html.includes('<main>Vue ISR 1</main>'));
  assert.ok(html.includes('src="/assets/vue-entry.js"'));
  assert.equal(html.includes('id="__FACETHEORY_DATA__"'), false);
  assert.equal(html.includes(secret), false);
  assert.match(sidecarHref, /^\/vue-isr\?__facetheory_isr_hydration=/);

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

test('vue adapter: SSG strict CSP lets build externalize legacy hydration sidecars', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-vue-ssg-'));
  const outDir = path.resolve(tempRoot, 'out');

  try {
    const result = await buildSsgSite({
      faces: [
        createVueFace({
          route: '/',
          mode: 'ssg',
          render: () => h('main', null, 'Vue SSG strict'),
          renderOptions: {
            csp: {
              inlineScripts: false,
              inlineStyles: false,
              rawHead: false,
            },
            hydration: {
              data: {
                message: '</script><script>alert("vue")</script>',
              },
              bootstrapModule: '/assets/vue-entry.js',
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
    assert.ok(html.includes('<main>Vue SSG strict</main>'));
    assert.ok(html.includes('id="__FACETHEORY_DATA_URL__"'));
    assert.ok(html.includes('href="/_facetheory/data/index.json"'));
    assert.ok(html.includes('src="/assets/vue-entry.js"'));
    assert.equal(html.includes('id="__FACETHEORY_DATA__"'), false);
    assert.equal(html.includes('</script><script>alert'), false);

    const hydrationJson = await readFile(
      path.resolve(outDir, '_facetheory/data/index.json'),
      'utf8',
    );
    assert.equal(
      hydrationJson,
      '{"message":"\\u003c/script\\u003e\\u003cscript\\u003ealert(\\"vue\\")\\u003c/script\\u003e"}\n',
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('vue adapter: strict CSP rejects inline hydration and styles', async () => {
  await assert.rejects(
    () =>
      renderVue(baseCtx, h('main', null, 'Unsafe Vue hydration'), {
        csp: { inlineScripts: false },
        hydration: {
          data: { unsafe: true },
          bootstrapModule: '/assets/vue-entry.js',
        },
      }),
    /Vue adapter strict CSP requires external hydration data/,
  );

  await assert.rejects(
    () =>
      renderVue(baseCtx, h('main', null, 'Unsafe Vue style'), {
        csp: { inlineStyles: false },
        styleTags: [{ cssText: '.unsafe-vue{color:red;}' }],
      }),
    /Vue adapter strict CSP rejects inline adapter style output/,
  );
});
