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
