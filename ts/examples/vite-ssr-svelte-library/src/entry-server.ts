import { createFaceApp } from '../../../src/app.js';
import { createSvelteFace } from '../../../src/svelte/index.js';
import type { ViteManifest } from '../../../src/vite.js';
import { viteAssetsForEntry, viteHydrationForEntry } from '../../../src/vite.js';

import App from './App.svelte';

interface ExampleData {
  title: string;
  intro: string;
  initialCount: number;
}

export function createViteSvelteLibraryExampleApp(manifest: ViteManifest) {
  return createFaceApp({
    faces: [
      createSvelteFace({
        route: '/',
        mode: 'ssr',
        load: async (): Promise<ExampleData> => ({
          title: 'Hosted from a packaged library',
          intro: 'FaceTheory injects the package CSS and asset graph through the same client entry used for hydration.',
          initialCount: 3,
        }),
        render: (_ctx, data) => ({
          component: App,
          props: data as ExampleData,
        }),
        renderOptions: async (_ctx, data) => {
          const { headTags } = viteAssetsForEntry(manifest, 'src/entry-client.ts', {
            includeAssets: true,
          });

          return {
            headTags: [...headTags, { type: 'title', text: 'FaceTheory External Svelte Library' }],
            hydration: viteHydrationForEntry(manifest, 'src/entry-client.ts', data),
          };
        },
      }),
    ],
  });
}
