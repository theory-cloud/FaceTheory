import * as React from 'react';

import {
  buildStrictCspHeader,
  createFaceApp,
  InMemoryHtmlStore,
  viteAssetsForEntry,
  viteHydrationForEntry,
  type ViteManifest,
} from '@theory-cloud/facetheory';
import { createReactFace } from '@theory-cloud/facetheory/react';

import { App } from './App.js';
import logoUrl from './logo.svg';

export interface StrictCspReactExampleData {
  page: 'home' | 'next';
  message: string;
  detail: string;
}

const ENTRY = 'src/entry-client.tsx';
const STRICT_CSP = {
  inlineScripts: false,
  inlineStyles: false,
  rawHead: false,
} as const;

export function strictCspReactDataForPath(
  pathname: string,
): StrictCspReactExampleData {
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

export function createViteStrictCspReactExampleApp(manifest: ViteManifest) {
  return createFaceApp({
    ssrHydrationSidecars: {
      htmlStore: new InMemoryHtmlStore(),
      signingSecret:
        'vite-strict-csp-react-example-local-ssr-sidecar-signing-secret',
    },
    faces: [
      createReactFace<StrictCspReactExampleData>({
        route: '/',
        mode: 'ssr',
        load: async () => strictCspReactDataForPath('/'),
        render: (_ctx, data) =>
          React.createElement(
            'div',
            { id: 'root' },
            React.createElement(App, { ...data, logoUrl }),
          ),
        renderOptions: strictRenderOptions(manifest),
      }),
      createReactFace<StrictCspReactExampleData>({
        route: '/next',
        mode: 'ssr',
        load: async () => strictCspReactDataForPath('/next'),
        render: (_ctx, data) =>
          React.createElement(
            'div',
            { id: 'root' },
            React.createElement(App, { ...data, logoUrl }),
          ),
        renderOptions: strictRenderOptions(manifest),
      }),
    ],
  });
}

function strictRenderOptions(manifest: ViteManifest) {
  return async (_ctx: unknown, data: unknown) => {
    const exampleData = data as StrictCspReactExampleData;
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
          attrs: { name: 'example', content: 'strict-csp-react' },
        },
        { type: 'title' as const, text: 'FaceTheory Strict CSP React' },
      ],
      hydration,
    };
  };
}
