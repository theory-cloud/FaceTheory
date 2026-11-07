import assert from 'node:assert/strict';

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { compile } from 'svelte/compiler';

import { createFaceApp } from '@theory-cloud/facetheory';
import { createSvelteFace } from '@theory-cloud/facetheory/svelte';
import { RESPONSIVE_PRIMITIVES_CSS } from '@theory-cloud/facetheory/responsive-primitives';

export interface RenderedPrimitivePage {
  name: string;
  html: string;
}

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

async function decodeBody(body: unknown): Promise<string> {
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  const decoder = new TextDecoder();
  let html = '';
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    html += decoder.decode(chunk, { stream: true });
  }
  return html + decoder.decode();
}

export async function renderResponsivePrimitivesSveltePages(): Promise<RenderedPrimitivePage[]> {
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
    const shellApp = createFaceApp({
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

    const pages = [
      {
        name: 'spinner',
        app: createFaceApp({
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
        }),
      },
      {
        name: 'skeleton',
        app: createFaceApp({
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
        }),
      },
      {
        name: 'loading',
        app: createFaceApp({
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
        }),
      },
      {
        name: 'async',
        app: createFaceApp({
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
        }),
      },
      {
        name: 'button',
        app: createFaceApp({
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
        }),
      },
      {
        name: 'link',
        app: createFaceApp({
          faces: [
            createSvelteFace({
              route: '/',
              mode: 'ssr',
              render: () => ({ component: Link, props: { href: '/tenants' } }),
            }),
          ],
        }),
      },
      { name: 'shell', app: shellApp },
    ];

    const rendered = await Promise.all(
      pages.map(async (page) => ({
        name: page.name,
        html: await decodeBody((await page.app.handle({ method: 'GET', path: '/' })).body),
      })),
    );

    return rendered;
  } finally {
    await rm(path.resolve('examples/responsive-primitives-svelte/.tmp'), {
      recursive: true,
      force: true,
    });
  }
}

async function runCli(): Promise<void> {
  const pages = await renderResponsivePrimitivesSveltePages();
  const html = pages.map((page) => page.html).join('\n');

  assert.match(html, /facetheory-rcp-spinner/);
  assert.match(html, /facetheory-rcp-skeleton--width-two-thirds/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /href="\/tenants"/);
  assert.match(html, /prefers-reduced-motion/);
  assert.doesNotMatch(html, /style="/);

  console.log('responsive primitives Svelte example rendered');
  console.log(`bytes=${html.length}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}
