// Example sketch: blocking ISR with in-memory stores.
//
// Replace the in-memory stores with `S3HtmlStore` + `DynamoDbIsrMetaStore`
// in production.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createFaceApp } from '../../src/app.js';
import { InMemoryHtmlStore, InMemoryIsrMetaStore } from '../../src/isr.js';

const htmlStore = new InMemoryHtmlStore();
const metaStore = new InMemoryIsrMetaStore();

let revision = 0;

export const faceApp = createFaceApp({
  faces: [
    {
      route: '/news/{slug}',
      mode: 'isr',
      revalidateSeconds: 30,
      load: async (ctx) => {
        revision += 1;
        return { slug: ctx.params.slug, revision };
      },
      render: (_ctx, data) => {
        const payload = data as { slug: string; revision: number };
        return {
          html: `<main><h1>${payload.slug}</h1><p>revision ${payload.revision}</p></main>`,
        };
      },
    },
  ],
  isr: {
    htmlStore,
    metaStore,
  },
});

export async function handler(event: any): Promise<any> {
  return faceApp.handle({
    method: event?.requestContext?.http?.method ?? 'GET',
    path: event?.rawPath ?? '/news/home',
    headers: event?.headers ? { ...event.headers } : {},
  });
}
