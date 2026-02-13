import assert from 'node:assert/strict';
import test from 'node:test';

import { compile } from 'svelte/compiler';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
              { type: 'link', attrs: { rel: 'stylesheet', href: '/options-svelte.css' } },
              { type: 'script', attrs: { id: 'options-inline' }, body: 'window.__SVELTE_OPTIONS__=1;' },
            ],
            styleTags: [
              { cssText: '.from-options{font-weight:bold;}', attrs: { id: 'style-options' } },
            ],
            hydration: {
              data: { framework: 'svelte' },
              bootstrapModule: '/assets/svelte-entry.js',
            },
            integrations: [
              {
                name: 'svelte-wrap-contrib-finalize',
                wrapTree: (input) => ({
                  ...input,
                  props: {
                    ...(input.props ?? {}),
                    name: `${String((input.props as any)?.name ?? '')} + wrapped`,
                  },
                }),
                contribute: () => ({
                  headTags: [{ type: 'link', attrs: { rel: 'stylesheet', href: '/integration-a.css' } }],
                  styleTags: [
                    { cssText: '.from-int{letter-spacing:1px;}', attrs: { id: 'style-int' } },
                  ],
                }),
                finalize: (out) => ({
                  ...out,
                  headTags: [
                    ...(out.headTags ?? []),
                    { type: 'link', attrs: { rel: 'stylesheet', href: '/integration-b.css' } },
                  ],
                }),
              },
            ],
          },
        }),
      ],
    });

    const nonce = 'nonce-svelte-r6';
    const resp = await app.handle({ method: 'GET', path: '/', cspNonce: nonce });
    const body = new TextDecoder().decode(resp.body as Uint8Array);

    assert.ok(body.includes('<title>Svelte Integration Title</title>'));
    assert.ok(body.includes('Hello Svelte Integration + wrapped'));
    assert.ok(body.includes('name="svelte-head"'));
    assert.ok(body.includes('id="__FACETHEORY_DATA__"'));

    const idxIntegrationA = body.indexOf('/integration-a.css');
    const idxOptions = body.indexOf('/options-svelte.css');
    const idxIntegrationB = body.indexOf('/integration-b.css');
    assert.ok(idxIntegrationA >= 0 && idxOptions >= 0 && idxIntegrationB >= 0);
    assert.ok(idxIntegrationA < idxOptions);
    assert.ok(idxOptions < idxIntegrationB);

    const idxStyleInt = body.indexOf('id="style-int"');
    const idxStyleOptions = body.indexOf('id="style-options"');
    assert.ok(idxStyleInt >= 0 && idxStyleOptions >= 0);
    assert.ok(idxStyleInt < idxStyleOptions);

    const styleTags = Array.from(body.matchAll(/<style\b[^>]*>/g)).map((match) => match[0]);
    const scriptTags = Array.from(body.matchAll(/<script\b[^>]*>/g)).map((match) => match[0]);

    assert.ok(styleTags.length >= 3);
    assert.ok(scriptTags.length >= 2);
    for (const tag of [...styleTags, ...scriptTags]) {
      assert.ok(tag.includes(`nonce="${nonce}"`), `missing nonce on tag: ${tag}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
