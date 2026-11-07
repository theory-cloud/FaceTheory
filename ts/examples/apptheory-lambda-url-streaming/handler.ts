// Example: AWS Lambda Function URL handler using AppTheory streaming handler + FaceTheory runtime.
//

import { createApp, createLambdaFunctionURLStreamingHandler } from '@theory-cloud/apptheory';

import { createFaceApp } from '@theory-cloud/facetheory';
import { utf8 } from '@theory-cloud/facetheory';
import { createAppTheoryFaceHandler } from '@theory-cloud/facetheory/apptheory';

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
        head: { title: 'FaceTheory (AppTheory)' },
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

export const appTheoryApp = createApp();
const faceHandler = createAppTheoryFaceHandler({ app: faceApp });

// Lambda Function URL always hits the same handler; AppTheory routes by path.
appTheoryApp.get('/', faceHandler);
appTheoryApp.get('/{proxy+}', faceHandler);
appTheoryApp.handle('HEAD', '/', faceHandler);
appTheoryApp.handle('HEAD', '/{proxy+}', faceHandler);

export const handler = createLambdaFunctionURLStreamingHandler(appTheoryApp);
