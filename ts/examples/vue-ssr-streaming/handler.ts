// Example sketch: Vue streaming SSR Face (body streamed, document wrapper handled by FaceApp).
//

import { createFaceApp } from '@theory-cloud/facetheory';
import { createVueStreamFace, h } from '@theory-cloud/facetheory/vue';

const Home = {
  setup() {
    return () => h('h1', null, 'FaceTheory + Vue (streaming SSR)');
  },
};

export const faceApp = createFaceApp({
  faces: [
    createVueStreamFace({
      route: '/',
      mode: 'ssr',
      render: () => h(Home),
      renderOptions: {
        headTags: [{ type: 'title', text: 'Vue Streaming Home' }],
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
