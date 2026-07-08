// Example: AWS Lambda Function URL handler using the FaceTheory Lambda adapter.
//

import { createFaceApp } from '@theory-cloud/facetheory';
import { streamFromString } from '@theory-cloud/facetheory';
import { createLambdaUrlStreamingHandler } from '@theory-cloud/facetheory';

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
