import { createFaceApp } from '../../../src/app.js';
import type { ViteManifest } from '../../../src/vite.js';
import { viteAssetsForEntry, viteHydrationForEntry } from '../../../src/vite.js';
import { createVueFace, h } from '../../../src/vue/index.js';

import { App } from './app.js';

export function createViteVueSSRExampleApp(manifest: ViteManifest) {
  return createFaceApp({
    faces: [
      createVueFace({
        route: '/',
        mode: 'ssr',
        load: async () => ({ message: 'from server' }),
        render: (_ctx, data) =>
          h(
            'div',
            { id: 'root' },
            [h(App, { message: (data as { message: string }).message })],
          ),
        renderOptions: async (_ctx, data) => {
          const { headTags } = viteAssetsForEntry(manifest, 'src/entry-client.ts', {
            includeAssets: true,
          });
          const hydration = viteHydrationForEntry(manifest, 'src/entry-client.ts', data);

          return {
            headTags: [
              ...headTags,
              { type: 'title', text: 'FaceTheory Vue SSR' },
            ],
            styleTags: [
              {
                cssText: '.vue-inline{color:rgb(34,102,221);}',
                attrs: { id: 'vue-inline-style' },
              },
            ],
            hydration,
          };
        },
      }),
    ],
  });
}
