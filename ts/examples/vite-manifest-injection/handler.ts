// Example sketch: inject Vite manifest assets into a Face render.
//
// This is not included in `tsc` builds (examples are excluded from tsconfig).

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { viteAssetsForEntry, viteHydrationForEntry } from '../../src/vite.js';

const manifest = {
  'src/entry-client.tsx': {
    file: 'assets/entry.aaa.js',
    css: ['assets/entry.aaa.css'],
    imports: ['_vendor.bbb.js'],
    isEntry: true,
  },
  '_vendor.bbb.js': { file: 'assets/vendor.bbb.js' },
} as const;

export const faceApp = createFaceApp({
  faces: [
    createReactFace({
      route: '/',
      mode: 'ssr',
      render: () => React.createElement('main', null, 'Hello'),
      renderOptions: {
        headTags: viteAssetsForEntry(manifest, 'src/entry-client.tsx').headTags,
        hydration: viteHydrationForEntry(manifest, 'src/entry-client.tsx', { hello: 'world' }),
      },
    }),
  ],
});

export async function handler(event: any): Promise<any> {
  return faceApp.handle({
    method: event?.requestContext?.http?.method ?? 'GET',
    path: event?.rawPath ?? '/',
    headers: {}, // map from event.headers if desired
    query: {}, // parse event.rawQueryString if desired
  });
}
