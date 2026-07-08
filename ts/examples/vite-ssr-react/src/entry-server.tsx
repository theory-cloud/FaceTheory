import * as React from 'react';

import { createFaceApp } from '@theory-cloud/facetheory';
import { createReactFace } from '@theory-cloud/facetheory/react';
import type { ViteManifest } from '@theory-cloud/facetheory';
import {
  viteAssetsForEntry,
  viteDevAssetsForEntry,
  viteDevHydrationForEntry,
  viteHydrationForEntry,
} from '@theory-cloud/facetheory';

import { App } from './app.js';

const CLIENT_ENTRY = 'src/entry-client.tsx';

function createViteSSRExampleAppWithAssets(manifest: ViteManifest | null) {
  return createFaceApp({
    faces: [
      createReactFace<{ message: string }>({
        route: '/',
        mode: 'ssr',
        load: async () => ({ message: 'from server' }),
        render: (_ctx, data) => React.createElement(
          'div',
          { id: 'root' },
          React.createElement(App, { message: data.message }),
        ),
        renderOptions: async (_ctx, data) => {
          const { headTags } = manifest
            ? viteAssetsForEntry(manifest, CLIENT_ENTRY, {
                includeAssets: true,
              })
            : viteDevAssetsForEntry(CLIENT_ENTRY);
          const hydration = manifest
            ? viteHydrationForEntry(manifest, CLIENT_ENTRY, data)
            : viteDevHydrationForEntry(CLIENT_ENTRY, data);
          return { headTags, hydration };
        },
      }),
    ],
  });
}

export function createViteSSRExampleApp(manifest: ViteManifest) {
  return createViteSSRExampleAppWithAssets(manifest);
}

export function createViteSSRExampleDevApp() {
  return createViteSSRExampleAppWithAssets(null);
}
