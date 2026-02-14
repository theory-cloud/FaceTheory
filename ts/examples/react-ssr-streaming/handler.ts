// Example sketch: React streaming SSR Face (body streamed, document wrapper handled by FaceApp).
//
// This is not included in `tsc` builds (examples are excluded from tsconfig).

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactStreamFace } from '../../src/adapters/react.js';

function Home() {
  return React.createElement('h1', null, 'FaceTheory + React (streaming SSR)');
}

export const faceApp = createFaceApp({
  faces: [
    createReactStreamFace({
      route: '/',
      mode: 'ssr',
      render: () => React.createElement(Home),
      renderOptions: {
        headTags: [{ type: 'title', text: 'Home' }],
        // Default `all-ready` favors style correctness with Suspense/async boundaries.
        // For lower TTFB, set `styleStrategy: 'shell'`.
        styleStrategy: 'all-ready',
      },
    }),
  ],
});

export async function handler(event: any): Promise<any> {
  return faceApp.handle({
    method: event?.requestContext?.http?.method ?? 'GET',
    path: event?.rawPath ?? '/',
    headers: {},
    query: {},
  });
}
