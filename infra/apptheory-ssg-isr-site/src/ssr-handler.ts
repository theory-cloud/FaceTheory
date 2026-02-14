/* eslint-disable @typescript-eslint/no-explicit-any */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { createApp, createLambdaFunctionURLStreamingHandler } from '@theory-cloud/apptheory';

import { createFaceApp, type FaceResponse, type Headers, S3HtmlStore } from '../../../ts/dist/index.js';
import {
  appTheoryContextToFaceRequest,
  faceResponseToAppTheoryResponse,
  type FaceRequestHandler,
} from '../../../ts/dist/apptheory/index.js';
import { createAwsSdkS3HtmlStoreClient } from '../../../ts/dist/aws-s3/index.js';
import { createTableTheoryIsrMetaStore } from '../../../ts/dist/tabletheory/index.js';

function env(key: string): string {
  const value = String(process.env[key] ?? '').trim();
  if (!value) throw new Error(`missing env var: ${key}`);
  return value;
}

function hasHeader(headers: Headers | undefined, key: string): boolean {
  const values = headers?.[key.toLowerCase()];
  return Array.isArray(values) && values.length > 0;
}

function addHeader(headers: Headers | undefined, key: string, value: string): Headers {
  const out: Headers = { ...(headers ?? {}) };
  out[key.toLowerCase()] = [String(value)];
  return out;
}

function withSsrMarker(resp: FaceResponse): FaceResponse {
  const headers = addHeader(resp.headers, 'x-facetheory-ssr', '1');

  // Safety: never allow CloudFront to cache SSR/404/500 responses due to missing/incorrect headers.
  const safeHeaders = hasHeader(headers, 'cache-control')
    ? headers
    : addHeader(headers, 'cache-control', 'private, no-store');

  return { ...resp, headers: safeHeaders };
}

const s3 = new S3Client({});
const ddb = new DynamoDBClient({});

const cacheTableName =
  String(process.env.FACETHEORY_CACHE_TABLE_NAME ?? '').trim() ||
  String(process.env.APPTHEORY_CACHE_TABLE_NAME ?? '').trim();

if (!cacheTableName) {
  throw new Error('missing cache table env var (FACETHEORY_CACHE_TABLE_NAME or APPTHEORY_CACHE_TABLE_NAME)');
}

const isrBucket = env('FACETHEORY_ISR_BUCKET');
const isrPrefix = String(process.env.FACETHEORY_ISR_PREFIX ?? 'isr').trim() || 'isr';

const faceApp = createFaceApp({
  faces: [
    {
      route: '/',
      mode: 'ssr',
      render: () => ({
        headers: { 'cache-control': 'private, no-store' },
        head: { title: 'FaceTheory H3 (SSR)' },
        html: `
<main>
  <h1>FaceTheory H3 Infra Example</h1>
  <p>SSR route (always Lambda). Assets should load from S3.</p>
  <ul>
    <li><a href="/ssg-demo">SSG demo (S3-first)</a></li>
    <li><a href="/isr-demo">ISR demo (Lambda + S3 + Dynamo)</a></li>
  </ul>
</main>
<script type="module" src="/assets/entry.js"></script>
`.trim(),
      }),
    },
    {
      route: '/ssg-demo',
      mode: 'ssr',
      render: () => ({
        headers: { 'cache-control': 'private, no-store' },
        head: { title: 'FaceTheory H3 (SSR fallback)' },
        html: `
<main>
  <h1>SSR fallback for /ssg-demo</h1>
  <p>If you are seeing this, S3 did not have the SSG HTML key.</p>
  <p><a href="/">Back</a></p>
</main>
<script type="module" src="/assets/entry.js"></script>
`.trim(),
      }),
    },
    {
      route: '/isr-demo',
      mode: 'isr',
      revalidateSeconds: 5,
      render: () => ({
        head: { title: 'FaceTheory H3 (ISR)' },
        html: `
<main>
  <h1>ISR demo</h1>
  <p>Generated at: ${new Date().toISOString()}</p>
  <p>Revalidate: 5s</p>
  <p><a href="/">Back</a></p>
</main>
<script type="module" src="/assets/entry.js"></script>
`.trim(),
      }),
    },
    {
      route: '/{proxy+}',
      mode: 'ssr',
      render: (ctx) => ({
        status: 404,
        headers: { 'cache-control': 'private, no-store' },
        head: { title: 'Not Found' },
        html: `
<main>
  <h1>Not Found</h1>
  <pre>${JSON.stringify({ path: ctx.request.path, proxy: ctx.proxy }, null, 2)}</pre>
  <p><a href="/">Back</a></p>
</main>
`.trim(),
      }),
    },
  ],
  isr: {
    htmlStore: new S3HtmlStore({
      client: createAwsSdkS3HtmlStoreClient({ s3 }),
      bucket: isrBucket,
      keyPrefix: isrPrefix,
    }),
    metaStore: createTableTheoryIsrMetaStore({
      config: { ddb, tableName: cacheTableName },
    }),
    // When S3HtmlStore has a keyPrefix, keep pointers relative (no prefix) to avoid `prefix/prefix/...`.
    htmlPointerPrefix: '',
  },
});

const app = createApp();

const faceHandler: FaceRequestHandler = {
  handle: async (request) => withSsrMarker(await faceApp.handle(request)),
};

app.get('/', async (ctx) => {
  const faceReq = appTheoryContextToFaceRequest(ctx);
  const original = ctx.request.headers?.['x-facetheory-original-uri']?.[0];
  if (original) faceReq.path = original;
  return faceResponseToAppTheoryResponse(await faceHandler.handle(faceReq));
});
app.get('/{proxy+}', async (ctx) => {
  const faceReq = appTheoryContextToFaceRequest(ctx);
  const original = ctx.request.headers?.['x-facetheory-original-uri']?.[0];
  if (original) faceReq.path = original;
  return faceResponseToAppTheoryResponse(await faceHandler.handle(faceReq));
});
app.handle('HEAD', '/', async (ctx) => {
  const faceReq = appTheoryContextToFaceRequest(ctx);
  const original = ctx.request.headers?.['x-facetheory-original-uri']?.[0];
  if (original) faceReq.path = original;
  return faceResponseToAppTheoryResponse(await faceHandler.handle(faceReq));
});
app.handle('HEAD', '/{proxy+}', async (ctx) => {
  const faceReq = appTheoryContextToFaceRequest(ctx);
  const original = ctx.request.headers?.['x-facetheory-original-uri']?.[0];
  if (original) faceReq.path = original;
  return faceResponseToAppTheoryResponse(await faceHandler.handle(faceReq));
});

export const handler = createLambdaFunctionURLStreamingHandler(app);
