import { createApp, createLambdaFunctionURLStreamingHandler } from '@theory-cloud/apptheory';

import { createFaceApp, type FaceRenderResult } from '../../../ts/dist/index.js';
import { createAppTheoryFaceHandler } from '../../../ts/dist/apptheory/index.js';

function cleanAssetPrefix(value: string | undefined): string {
  const cleaned = String(value ?? 'assets')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  return cleaned || 'assets';
}

function assetPath(fileName: string): string {
  return `/${cleanAssetPrefix(process.env.APPTHEORY_ASSETS_PREFIX)}/${fileName}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function page(body: string, title = 'FaceTheory + AppTheorySsrSite'): FaceRenderResult {
  return {
    headers: { 'cache-control': 'private, no-store' },
    head: {
      title,
    },
    headTags: [
      { type: 'meta', attrs: { name: 'viewport', content: 'width=device-width,initial-scale=1' } },
      { type: 'link', attrs: { rel: 'stylesheet', href: assetPath('entry.css') } },
    ],
    html: `${body}\n<script type="module" src="${assetPath('entry.js')}"></script>`,
  };
}

const faceApp = createFaceApp({
  faces: [
    {
      route: '/',
      mode: 'ssr',
      render: () =>
        page(`
<main>
  <h1>FaceTheory Infra Example</h1>
  <p>This page is rendered by a real FaceTheory Face through AppTheorySsrSite.</p>
  <p>The CloudFront distribution serves <code>/assets</code> from S3 and routes this SSR document to Lambda.</p>
</main>
        `.trim()),
    },
    {
      route: '/{proxy+}',
      mode: 'ssr',
      render: (ctx) => ({
        ...page(`
<main>
  <h1>Not Found</h1>
  <p>No FaceTheory reference route matched <code>${escapeHtml(ctx.request.path)}</code>.</p>
  <p><a href="/">Back to the reference page</a></p>
</main>
        `.trim(), 'FaceTheory Reference Not Found'),
        status: 404,
      }),
    },
  ],
});

const app = createApp();
const faceHandler = createAppTheoryFaceHandler({ app: faceApp });

app.get('/', faceHandler);
app.get('/{proxy+}', faceHandler);
app.handle('HEAD', '/', faceHandler);
app.handle('HEAD', '/{proxy+}', faceHandler);

export const handler = createLambdaFunctionURLStreamingHandler(app);
