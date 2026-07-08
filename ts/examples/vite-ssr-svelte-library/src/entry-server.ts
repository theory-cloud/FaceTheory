import { createFaceApp } from '@theory-cloud/facetheory';
import { createSvelteFace } from '@theory-cloud/facetheory/svelte';
import type { ViteManifest } from '@theory-cloud/facetheory';
import { viteAssetsForEntry, viteHydrationForEntry } from '@theory-cloud/facetheory';

import App from './App.svelte';

interface ExampleData extends Record<string, unknown> {
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
