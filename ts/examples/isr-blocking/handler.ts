// Example: blocking ISR.
//
// The example defaults to the in-memory stores its unit tests use. When the
// stack environment is present (`FACETHEORY_ISR_BUCKET`,
// `FACETHEORY_ISR_PREFIX`, `FACETHEORY_CACHE_TABLE_NAME` or
// `APPTHEORY_CACHE_TABLE_NAME`), `../local-storage` selects `S3HtmlStore` and
// the TableTheory-backed ISR metadata/lease store instead. The local harness
// points those names at its emulators; a deployed stack sets the same names.
//
// This example is intentionally tenant-invariant: it does not read tenant headers,
// auth headers, or cookies while rendering cached HTML. Tenant-varying ISR must
// configure an explicit, trusted `tenantKey`; a custom `cacheKey` alone no longer
// exempts a tenant-scoped route, and FaceTheory fails closed when known tenant
// boundary headers reach the ISR runtime without a trusted `tenantKey`.

import {
  createFaceApp,
  handleLambdaUrlEvent,
  InMemoryHtmlStore,
  InMemoryIsrMetaStore,
  type LambdaUrlEvent,
  type LambdaUrlResult,
} from '@theory-cloud/facetheory';

import { createExampleIsrStores } from '../local-storage.js';

const exampleStores = createExampleIsrStores();
const htmlStore = exampleStores?.htmlStore ?? new InMemoryHtmlStore();
const metaStore = exampleStores?.metaStore ?? new InMemoryIsrMetaStore();

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
    ...(exampleStores
      ? { htmlPointerPrefix: exampleStores.htmlPointerPrefix }
      : {}),
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
