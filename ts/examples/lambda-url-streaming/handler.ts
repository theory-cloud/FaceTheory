// Example: AWS Lambda Function URL handler using the FaceTheory Lambda adapter.
//
// This is not included in `tsc` builds (examples are excluded from tsconfig).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createFaceApp } from '../../src/app.js';
import { streamFromString } from '../../src/bytes.js';
import { createLambdaUrlStreamingHandler } from '../../src/lambda-url.js';

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

export const handler = createLambdaUrlStreamingHandler({ app: faceApp });
