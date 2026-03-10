# FaceTheory

`@theory-cloud/facetheory` is a TypeScript runtime for AWS-first SSR, SSG, and blocking ISR on Node.js `>=24`, with package exports for React, Vue, and Svelte adapters plus AppTheory and TableTheory integration surfaces.

## Install v0.1.1

```bash
npm install --save-exact \
  https://github.com/theory-cloud/FaceTheory/releases/download/v0.1.1/theory-cloud-facetheory-0.1.1.tgz
```

Install the peers that match your adapter surface:

- React: `npm install react react-dom`
- React + AntD/Emotion: `npm install antd @emotion/react @emotion/cache @emotion/server`
- Vue: `npm install vue @vue/server-renderer`
- Svelte: `npm install svelte`

Optional companion packages:

- AppTheory runtime: `https://github.com/theory-cloud/AppTheory/releases/download/v0.17.1/theory-cloud-apptheory-0.17.1.tgz`
- AppTheory CDK: `https://github.com/theory-cloud/AppTheory/releases/download/v0.17.1/theory-cloud-apptheory-cdk-0.17.1.tgz`
- TableTheory runtime: `https://github.com/theory-cloud/TableTheory/releases/download/v1.4.2/theory-cloud-tabletheory-ts-1.4.2.tgz`

## Minimal App

```ts
import { createFaceApp, type FaceModule } from '@theory-cloud/facetheory';

const faces: FaceModule[] = [
  {
    route: '/',
    mode: 'ssr',
    render: async () => ({ html: '<h1>Hello FaceTheory</h1>' }),
  },
];

export const app = createFaceApp({ faces });
```

Expose it directly through Lambda Function URLs:

```ts
import { createLambdaUrlStreamingHandler } from '@theory-cloud/facetheory';
import { app } from './app';

export const handler = createLambdaUrlStreamingHandler({ app });
```

`createLambdaUrlStreamingHandler()` expects Lambda's `awslambda.streamifyResponse` global at runtime. Outside Lambda, use `handleLambdaUrlEvent(app, event)` for local checks or pass the optional `awslambda` adapter explicitly.

## Public Exports

- `@theory-cloud/facetheory` core runtime, SSG helpers, Lambda Function URL adapter, and ISR stores
- `@theory-cloud/facetheory/apptheory` AppTheory request/response adapter
- `@theory-cloud/facetheory/aws-s3` AWS SDK S3 HTML store adapter
- `@theory-cloud/facetheory/react` React buffered and streaming helpers
- `@theory-cloud/facetheory/react/antd` Ant Design integration
- `@theory-cloud/facetheory/react/emotion` Emotion integration
- `@theory-cloud/facetheory/react/antd-emotion` AntD token integration
- `@theory-cloud/facetheory/vue` Vue adapter
- `@theory-cloud/facetheory/svelte` Svelte adapter
- `@theory-cloud/facetheory/tabletheory` TableTheory ISR metadata adapter

## Documentation

- [Getting Started](https://github.com/theory-cloud/FaceTheory/blob/v0.1.1/docs/getting-started.md)
- [API Reference](https://github.com/theory-cloud/FaceTheory/blob/v0.1.1/docs/api-reference.md)
- [Core Patterns](https://github.com/theory-cloud/FaceTheory/blob/v0.1.1/docs/core-patterns.md)
- [Testing Guide](https://github.com/theory-cloud/FaceTheory/blob/v0.1.1/docs/testing-guide.md)
- [CDK And AWS Notes](https://github.com/theory-cloud/FaceTheory/blob/v0.1.1/docs/cdk/README.md)

The `v0.1.1` release also includes `facetheory-reference-0.1.1.tar.gz` with the canonical docs, runnable examples, and reference deployment stacks.
