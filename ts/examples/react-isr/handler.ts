// Example: blocking ISR rendering a real React tree.
//
// Replace the in-memory stores with `S3HtmlStore` + a TableTheory-backed ISR
// metadata store (`FaceTheoryIsrMetaStore`) in production, wired from the Lambda
// environment. A typical deployment reads:
//   FACETHEORY_ISR_HTML_BUCKET   -> S3 bucket backing `new S3HtmlStore({ bucket })`
//   FACETHEORY_ISR_TABLE         -> TableTheory table backing the ISR metadata
//                                   store and its regeneration leases
// FaceTheory does not own that storage: cached HTML lives in S3, and the cache
// metadata + regeneration leases live in TableTheory. See the README.
//
// This example is intentionally tenant-invariant: it does not read tenant headers,
// auth headers, or cookies while rendering cached HTML. Tenant-varying ISR must
// configure an explicit `tenantKey` or custom `cacheKey`; otherwise FaceTheory
// fails closed when known tenant boundary headers reach the ISR runtime.

import * as React from 'react';

import {
  createFaceApp,
  handleLambdaUrlEvent,
  InMemoryHtmlStore,
  InMemoryIsrMetaStore,
  type LambdaUrlEvent,
  type LambdaUrlResult,
} from '@theory-cloud/facetheory';
import { createReactFace } from '@theory-cloud/facetheory/react';

const htmlStore = new InMemoryHtmlStore();
const metaStore = new InMemoryIsrMetaStore();

// Deterministic regeneration counter so a cache MISS regenerates and the next
// request serves the identical cached bytes on a HIT.
let revision = 0;

interface ArticleData {
  slug: string;
  revision: number;
}

function Article({ slug, revision: rev }: ArticleData): React.ReactElement {
  return React.createElement(
    'main',
    { id: 'root' },
    React.createElement('h1', null, slug),
    React.createElement('p', { className: 'revision' }, `revision ${rev}`),
  );
}

// `createReactFace` owns the React rendering; the ISR knobs (`revalidateSeconds`,
// `tenantKey`, `cacheKey`) live on the returned `FaceModule`.
const newsFace = createReactFace<ArticleData>({
  route: '/news/{slug}',
  mode: 'isr',
  load: async (ctx) => {
    revision += 1;
    return { slug: ctx.params.slug ?? 'home', revision };
  },
  render: (_ctx, data) => React.createElement(Article, data),
});
newsFace.revalidateSeconds = 30;

export const faceApp = createFaceApp({
  faces: [newsFace],
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
