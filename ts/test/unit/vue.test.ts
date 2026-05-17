import assert from 'node:assert/strict';
import test from 'node:test';

import { assertDocumentTagNonces } from '../helpers/csp.js';

import { createFaceApp } from '../../src/app.js';
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
