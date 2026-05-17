import { createFaceApp } from '../../../src/app.js';
import { buildStrictCspHeader } from '../../../src/security.js';
import { createSvelteFace } from '../../../src/svelte/index.js';
import type { ViteManifest } from '../../../src/vite.js';
import {
  externalHydrationForEntry,
  viteAssetsForEntry,
} from '../../../src/vite.js';

import App from './App.svelte';
import logoUrl from './logo.svg';

export interface StrictCspSvelteExampleData {
  page: 'home' | 'next';
  message: string;
  detail: string;
}

export interface StrictCspSvelteExampleRenderData extends StrictCspSvelteExampleData {
  logoUrl: string;
}

const ENTRY = 'src/entry-client.ts';
const STRICT_CSP = {
  inlineScripts: false,
  inlineStyles: false,
  rawHead: false,
} as const;

export function strictCspSvelteDataForPath(
  pathname: string,
): StrictCspSvelteExampleData {
  if (pathname === '/next') {
    return {
      page: 'next',
      message: 'from strict external hydration next',
      detail:
        'The next page is hydrated from same-origin JSON before the navigation hook runs.',
    };
  }

  return {
    page: 'home',
    message: 'from strict external hydration home',
    detail:
      'The home page uses external CSS, a same-origin module, and a JSON sidecar.',
  };
}

export function strictCspSvelteHydrationDataUrl(pathname: string): string {
  return pathname === '/next'
    ? '/_facetheory/data/strict-csp-svelte-next.json'
    : '/_facetheory/data/strict-csp-svelte-home.json';
}

export function strictCspSvelteHydrationJsonForPath(pathname: string): string {
  return JSON.stringify(strictCspSvelteDataForPath(pathname));
}

export function createViteStrictCspSvelteExampleApp(manifest: ViteManifest) {
  return createFaceApp({
    faces: [
      createSvelteFace({
        route: '/',
        mode: 'ssr',
        load: async () => strictCspSvelteDataForPath('/'),
        render: (_ctx, data) => ({
          component: App,
          props: { ...(data as StrictCspSvelteExampleData), logoUrl },
        }),
        renderOptions: strictRenderOptions(manifest, '/'),
      }),
      createSvelteFace({
        route: '/next',
        mode: 'ssr',
        load: async () => strictCspSvelteDataForPath('/next'),
        render: (_ctx, data) => ({
          component: App,
          props: { ...(data as StrictCspSvelteExampleData), logoUrl },
        }),
        renderOptions: strictRenderOptions(manifest, '/next'),
      }),
    ],
  });
}

function strictRenderOptions(manifest: ViteManifest, pathname: string) {
  return async (_ctx: unknown, data: unknown) => {
    const exampleData = data as StrictCspSvelteExampleData;
    const { headTags } = viteAssetsForEntry(manifest, ENTRY, {
      includeAssets: true,
    });
    const hydration = externalHydrationForEntry(manifest, ENTRY, exampleData, {
      dataUrl: strictCspSvelteHydrationDataUrl(pathname),
    });

    return {
      csp: STRICT_CSP,
      headers: {
        'content-security-policy': buildStrictCspHeader(),
      },
      headTags: [
        ...headTags,
        {
          type: 'meta' as const,
          attrs: { name: 'example', content: 'strict-csp-svelte' },
        },
        { type: 'title' as const, text: 'FaceTheory Strict CSP Svelte' },
      ],
      hydration,
    };
  };
}
