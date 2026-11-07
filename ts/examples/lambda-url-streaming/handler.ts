// Example: AWS Lambda Function URL handler using the FaceTheory Lambda adapter.
//

import { createFaceApp } from '@theory-cloud/facetheory';
import { utf8 } from '@theory-cloud/facetheory';
import { createLambdaUrlStreamingHandler } from '@theory-cloud/facetheory';

// The body arrives in two parts with a controlled pause between them. A
// streaming transport lets the client read the first part while the handler is
// still running; a buffered transport can only deliver the complete document.
// https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html
async function* streamedBody() {
  yield utf8('<h1>hello (streaming)</h1>');
  await new Promise((resolve) => setTimeout(resolve, 200));
  yield utf8('<!-- streamed:tail -->');
}

export const faceApp = createFaceApp({
  faces: [
    {
      route: '/',
      mode: 'ssr',
      render: () => ({
        head: { title: 'FaceTheory' },
        html: streamedBody(),
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
