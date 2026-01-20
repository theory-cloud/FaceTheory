// Example sketch: AWS Lambda Function URL streaming handler.
//
// This is not included in `tsc` builds (examples are excluded from tsconfig).
// It exists to illustrate the intended integration shape for FaceTheory streaming.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createFaceApp } from '../../src/app.js';
import { streamFromString } from '../../src/bytes.js';

export const faceApp = createFaceApp({
  faces: [
    {
      route: '/',
      mode: 'ssr',
      render: () => ({
        head: { title: 'FaceTheory' },
        html: streamFromString('<h1>hello (streaming)</h1>'),
      }),
    },
    {
      route: '/{proxy+}',
      mode: 'ssr',
      render: (ctx) => ({
        status: 200,
        head: { title: 'Catch-all' },
        html: `<pre>${JSON.stringify({ path: ctx.request.path, proxy: ctx.proxy }, null, 2)}</pre>`,
      }),
    },
  ],
});

// Pseudocode: wrap with `awslambda.streamifyResponse(...)` in production.
export async function handler(event: any): Promise<any> {
  const resp = await faceApp.handle({
    method: event?.requestContext?.http?.method ?? 'GET',
    path: event?.rawPath ?? '/',
    headers: {}, // map from event.headers if desired
    query: {}, // parse event.rawQueryString if desired
  });

  // In streaming mode, write `resp.body` chunks into the Lambda response stream.
  return resp;
}

