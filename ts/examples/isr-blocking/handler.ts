// Example: blocking ISR with in-memory stores.
//
// Replace the in-memory stores with `S3HtmlStore` + a TableTheory-backed `IsrMetaStore`
// (for DynamoDB use TableTheory `FaceTheoryIsrMetaStore`) in production.
//
// This example is intentionally tenant-invariant: it does not read tenant headers,
// auth headers, or cookies while rendering cached HTML. Tenant-varying ISR must
// configure an explicit `tenantKey` or custom `cacheKey`; otherwise FaceTheory
// fails closed when known tenant boundary headers reach the ISR runtime.

import {
  createFaceApp,
  handleLambdaUrlEvent,
  InMemoryHtmlStore,
  InMemoryIsrMetaStore,
  type LambdaUrlEvent,
  type LambdaUrlResult,
} from '@theory-cloud/facetheory';

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

export async function handler(
  event: LambdaUrlEvent,
): Promise<LambdaUrlResult> {
  return handleLambdaUrlEvent(faceApp, {
    rawPath: '/news/home',
    ...event,
  });
}
