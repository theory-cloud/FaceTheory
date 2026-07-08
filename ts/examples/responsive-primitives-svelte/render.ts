import assert from 'node:assert/strict';

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { compile } from 'svelte/compiler';

import { createFaceApp } from '@theory-cloud/facetheory';
import { createSvelteFace } from '@theory-cloud/facetheory/svelte';
import { RESPONSIVE_PRIMITIVES_CSS } from '@theory-cloud/facetheory/responsive-primitives';

async function compileComponent(name: string): Promise<unknown> {
  const componentPath = path.resolve(
    'src/svelte/responsive-primitives',
    `${name}.svelte`,
  );
  const source = await readFile(componentPath, 'utf8');
  const compiled = compile(source, {
    generate: 'server',
    filename: path.basename(componentPath),
  } as never);

  const dir = path.resolve('examples/responsive-primitives-svelte/.tmp');
  await mkdir(dir, { recursive: true });
  const coreUrl = pathToFileURL(
    path.resolve('src/responsive-primitives/index.ts'),
  ).href;
  const rewrittenCode = compiled.js.code.replace(
    /from\s+(['"])\.\.\/\.\.\/responsive-primitives\/index\.js\1/g,
    `from "${coreUrl}"`,
  );
  const file = path.join(dir, `${name}-${process.pid}-${Date.now()}.mjs`);
  await writeFile(file, rewrittenCode, 'utf8');
  const mod = await import(pathToFileURL(file).href);
  return mod.default as unknown;
}

const [Spinner, Skeleton, LoadingState, AsyncStateBoundary, Button, Link] =
  await Promise.all([
    compileComponent('Spinner'),
    compileComponent('Skeleton'),
    compileComponent('LoadingState'),
    compileComponent('AsyncStateBoundary'),
    compileComponent('Button'),
    compileComponent('Link'),
  ]);

try {
  const app = createFaceApp({
    faces: [
      createSvelteFace({
        route: '/',
        mode: 'ssr',
        render: () => ({
          component: {
            render: () => ({
              html: '',
            }),
          },
        }),
        renderOptions: {
          styleTags: [{ cssText: RESPONSIVE_PRIMITIVES_CSS }],
        },
      }),
    ],
  });

  const rendered = await Promise.all([
    createFaceApp({
      faces: [
        createSvelteFace({
          route: '/',
          mode: 'ssr',
          render: () => ({
            component: Spinner,
            props: { label: 'Loading control plane data', size: 'sm' },
          }),
        }),
      ],
    }).handle({ method: 'GET', path: '/' }),
    createFaceApp({
      faces: [
        createSvelteFace({
          route: '/',
          mode: 'ssr',
          render: () => ({
            component: Skeleton,
            props: { width: 'two-thirds', height: 'lg' },
          }),
        }),
      ],
    }).handle({ method: 'GET', path: '/' }),
    createFaceApp({
      faces: [
        createSvelteFace({
          route: '/',
          mode: 'ssr',
          render: () => ({
            component: LoadingState,
            props: { message: 'Loading tenants' },
          }),
        }),
      ],
    }).handle({ method: 'GET', path: '/' }),
    createFaceApp({
      faces: [
        createSvelteFace({
          route: '/',
          mode: 'ssr',
          render: () => ({
            component: AsyncStateBoundary,
            props: { state: 'loading', loadingMessage: 'Loading tenants' },
          }),
        }),
      ],
    }).handle({ method: 'GET', path: '/' }),
    createFaceApp({
      faces: [
        createSvelteFace({
          route: '/',
          mode: 'ssr',
          render: () => ({
            component: Button,
            props: { loading: true, loadingPlacement: 'replace-prefix' },
          }),
        }),
      ],
    }).handle({ method: 'GET', path: '/' }),
    createFaceApp({
      faces: [
        createSvelteFace({
          route: '/',
          mode: 'ssr',
          render: () => ({ component: Link, props: { href: '/tenants' } }),
        }),
      ],
    }).handle({ method: 'GET', path: '/' }),
    app.handle({ method: 'GET', path: '/' }),
  ]);

  const html = rendered
    .map((response) => new TextDecoder().decode(response.body as Uint8Array))
    .join('\n');

  assert.match(html, /facetheory-rcp-spinner/);
  assert.match(html, /facetheory-rcp-skeleton--width-two-thirds/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /href="\/tenants"/);
  assert.match(html, /prefers-reduced-motion/);
  assert.doesNotMatch(html, /style="/);

  console.log('responsive primitives Svelte example rendered');
  console.log(`bytes=${html.length}`);
} finally {
  await rm(path.resolve('examples/responsive-primitives-svelte/.tmp'), {
    recursive: true,
    force: true,
  });
}
