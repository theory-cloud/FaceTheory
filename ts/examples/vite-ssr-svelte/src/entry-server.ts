import { createFaceApp } from '../../../src/app.js';
import { createSvelteFace } from '../../../src/svelte/index.js';
import type { ViteManifest } from '../../../src/vite.js';
import { viteAssetsForEntry, viteHydrationForEntry } from '../../../src/vite.js';

import App from './App.svelte';

export function createViteSvelteSSRExampleApp(manifest: ViteManifest) {
  return createFaceApp({
    faces: [
      createSvelteFace({
        route: '/',
        mode: 'ssr',
        load: async () => ({ message: 'from server' }),
        render: (_ctx, data) => ({
          component: App,
          props: { message: (data as { message: string }).message },
        }),
        renderOptions: async (_ctx, data) => {
          const { headTags } = viteAssetsForEntry(manifest, 'src/entry-client.ts', {
            includeAssets: true,
          });
          const hydration = viteHydrationForEntry(manifest, 'src/entry-client.ts', data);
          return {
            headTags: [...headTags, { type: 'title', text: 'FaceTheory Svelte SSR' }],
            styleTags: [
              {
                cssText: '.svelte-inline{color:rgb(214,80,121);}',
                attrs: { id: 'svelte-inline-style' },
              },
            ],
            hydration,
          };
        },
      }),
    ],
  });
}
