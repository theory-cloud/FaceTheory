import * as React from 'react';

import { createFaceApp } from '../../../src/app.js';
import { createReactFace } from '../../../src/adapters/react.js';
import type { ViteManifest } from '../../../src/vite.js';
import { viteAssetsForEntry, viteHydrationForEntry } from '../../../src/vite.js';

import { App } from './app.js';

export function createViteSSRExampleApp(manifest: ViteManifest) {
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
          const { headTags } = viteAssetsForEntry(manifest, 'src/entry-client.tsx', {
            includeAssets: true,
          });
          const hydration = viteHydrationForEntry(manifest, 'src/entry-client.tsx', data);
          return { headTags, hydration };
        },
      }),
    ],
  });
}
