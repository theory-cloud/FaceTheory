import {
  buildStrictCspHeader,
  createFaceApp,
  InMemoryHtmlStore,
  viteAssetsForEntry,
  viteHydrationForEntry,
  type ViteManifest,
} from '@theory-cloud/facetheory';
import { createVueFace, h } from '@theory-cloud/facetheory/vue';

import { App } from './app.js';
import logoUrl from './logo.svg';

export interface StrictCspVueExampleData {
  page: 'home' | 'next';
  message: string;
  detail: string;
}

const ENTRY = 'src/entry-client.ts';
const STRICT_CSP = {
  inlineScripts: false,
  inlineStyles: false,
  rawHead: false,
} as const;

export function strictCspVueDataForPath(
  pathname: string,
): StrictCspVueExampleData {
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

export function createViteStrictCspVueExampleApp(manifest: ViteManifest) {
  return createFaceApp({
    ssrHydrationSidecars: {
      htmlStore: new InMemoryHtmlStore(),
      signingSecret:
        'vite-strict-csp-vue-example-local-ssr-sidecar-signing-secret',
    },
    faces: [
      createVueFace<StrictCspVueExampleData>({
        route: '/',
        mode: 'ssr',
        load: async () => strictCspVueDataForPath('/'),
        render: (_ctx, data) =>
          h('div', { id: 'root' }, [h(App, { ...data, logoUrl })]),
        renderOptions: strictRenderOptions(manifest),
      }),
      createVueFace<StrictCspVueExampleData>({
        route: '/next',
        mode: 'ssr',
        load: async () => strictCspVueDataForPath('/next'),
        render: (_ctx, data) =>
          h('div', { id: 'root' }, [h(App, { ...data, logoUrl })]),
        renderOptions: strictRenderOptions(manifest),
      }),
    ],
  });
}

function strictRenderOptions(manifest: ViteManifest) {
  return async (_ctx: unknown, data: unknown) => {
    const exampleData = data as StrictCspVueExampleData;
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
          attrs: { name: 'example', content: 'strict-csp-vue' },
        },
        { type: 'title' as const, text: 'FaceTheory Strict CSP Vue' },
      ],
      hydration,
    };
  };
}
