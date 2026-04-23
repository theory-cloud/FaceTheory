import assert from 'node:assert/strict';
import test from 'node:test';

import { compile } from 'svelte/compiler';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertDocumentTagNonces } from '../helpers/csp.js';

import { createFaceApp } from '../../src/app.js';
import { createSvelteFace } from '../../src/svelte/index.js';

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
                      attrs: { id: `style-int-${String((state as { id: number }).id)}` },
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
