import { createFaceApp } from '@theory-cloud/facetheory';
import { InMemoryHtmlStore } from '@theory-cloud/facetheory';
import { buildStrictCspHeader } from '@theory-cloud/facetheory';
import { createSvelteFace } from '@theory-cloud/facetheory/svelte';
import type { ViteManifest } from '@theory-cloud/facetheory';
import {
  viteAssetsForEntry,
  viteHydrationForEntry,
} from '@theory-cloud/facetheory';

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

export function createViteStrictCspSvelteExampleApp(manifest: ViteManifest) {
  return createFaceApp({
    ssrHydrationSidecars: {
      htmlStore: new InMemoryHtmlStore(),
      signingSecret:
        'vite-strict-csp-svelte-example-local-ssr-sidecar-signing-secret',
    },
    faces: [
      createSvelteFace({
        route: '/',
        mode: 'ssr',
        load: async () => strictCspSvelteDataForPath('/'),
        render: (_ctx, data) => ({
          component: App,
          props: { ...(data as StrictCspSvelteExampleData), logoUrl },
        }),
        renderOptions: strictRenderOptions(manifest),
      }),
      createSvelteFace({
        route: '/next',
        mode: 'ssr',
        load: async () => strictCspSvelteDataForPath('/next'),
        render: (_ctx, data) => ({
          component: App,
          props: { ...(data as StrictCspSvelteExampleData), logoUrl },
        }),
        renderOptions: strictRenderOptions(manifest),
      }),
    ],
  });
}

function strictRenderOptions(manifest: ViteManifest) {
  return async (_ctx: unknown, data: unknown) => {
    const exampleData = data as StrictCspSvelteExampleData;
    const { headTags } = viteAssetsForEntry(manifest, ENTRY, {
      includeAssets: true,
    });
    const hydration = viteHydrationForEntry(manifest, ENTRY, exampleData);

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
