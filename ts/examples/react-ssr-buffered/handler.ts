// Example sketch: buffered React SSR Face.
//

import * as React from 'react';

import { createFaceApp } from '@theory-cloud/facetheory';
import { createReactFace } from '@theory-cloud/facetheory/react';

function Home() {
  return React.createElement('h1', null, 'FaceTheory + React (buffered SSR)');
}

export const faceApp = createFaceApp({
  faces: [
    createReactFace({
      route: '/',
      mode: 'ssr',
      render: () => React.createElement(Home),
      renderOptions: {
        headTags: [{ type: 'title', text: 'Home' }],
        hydration: {
          data: { hello: 'world' },
          bootstrapModule: '/assets/client-entry.js',
        },
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
