// Example: AWS Lambda Function URL handler using AppTheory streaming handler + FaceTheory runtime.
//
// This is not included in `tsc` builds (examples are excluded from tsconfig).

import { createApp, createLambdaFunctionURLStreamingHandler } from '@theory-cloud/apptheory';

import { createFaceApp } from '../../src/app.js';
import { streamFromString } from '../../src/bytes.js';
import { createAppTheoryFaceHandler } from '../../src/apptheory/index.js';

export const faceApp = createFaceApp({
  faces: [
    {
      route: '/',
      mode: 'ssr',
      render: () => ({
        head: { title: 'FaceTheory (AppTheory)' },
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

const app = createApp();
const faceHandler = createAppTheoryFaceHandler({ app: faceApp });

// Lambda Function URL always hits the same handler; AppTheory routes by path.
app.get('/', faceHandler);
app.get('/{proxy+}', faceHandler);
app.handle('HEAD', '/', faceHandler);
app.handle('HEAD', '/{proxy+}', faceHandler);

export const handler = createLambdaFunctionURLStreamingHandler(app);
