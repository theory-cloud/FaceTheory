# FaceTheory

`@theory-cloud/facetheory` is a TypeScript runtime for AWS-first SSR, SSG, and blocking ISR on Node.js `>=24`, with package exports for React, Vue, and Svelte adapters plus AppTheory and TableTheory integration surfaces.

## Install v0.5.6-rc <!-- x-release-please-version -->

```bash
export FACETHEORY_VERSION=0.5.6-rc # x-release-please-version
npm install --save-exact \
  "https://github.com/theory-cloud/FaceTheory/releases/download/v${FACETHEORY_VERSION}/theory-cloud-facetheory-${FACETHEORY_VERSION}.tgz"
```

Install the peers that match your adapter surface:

- React: `npm install react react-dom`
- React + AntD/Emotion: `npm install antd @emotion/react @emotion/cache @emotion/server`
- Vue: `npm install vue @vue/server-renderer`
- Svelte: `npm install svelte`

Optional companion packages:

- AppTheory runtime: `https://github.com/theory-cloud/AppTheory/releases/download/v0.24.3/theory-cloud-apptheory-0.24.3.tgz`
- AppTheory CDK: `https://github.com/theory-cloud/AppTheory/releases/download/v0.24.3/theory-cloud-apptheory-cdk-0.24.3.tgz`
- TableTheory runtime: `https://github.com/theory-cloud/TableTheory/releases/download/v1.5.4/theory-cloud-tabletheory-ts-1.5.4.tgz`

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
- `@theory-cloud/facetheory/stitch-tokens` shared Stitch design-token helpers for React, Vue, and Svelte apps
- `@theory-cloud/facetheory/stitch-shell` shared Stitch navigation contracts and active-route resolution
- `@theory-cloud/facetheory/stitch-admin` shared Stitch dense-admin contracts
- `@theory-cloud/facetheory/react` React buffered and streaming helpers
- `@theory-cloud/facetheory/react/antd` Ant Design integration
- `@theory-cloud/facetheory/react/emotion` Emotion integration
- `@theory-cloud/facetheory/react/antd-emotion` AntD token integration
- `@theory-cloud/facetheory/react/stitch-tokens` React AntD theme bridge plus the shared token helpers
- `@theory-cloud/facetheory/react/stitch-shell` React shell/layout primitives built on the shared Stitch navigation helpers
- `@theory-cloud/facetheory/react/stitch-hosted-auth` React hosted-auth primitives
- `@theory-cloud/facetheory/react/stitch-admin` React dense-admin primitives
- `@theory-cloud/facetheory/vue` Vue adapter
- `@theory-cloud/facetheory/vue/stitch-shell` Vue shell/layout primitives built on the shared Stitch navigation helpers
- `@theory-cloud/facetheory/vue/stitch-hosted-auth` Vue hosted-auth primitives
- `@theory-cloud/facetheory/vue/stitch-admin` Vue dense-admin primitives
- `@theory-cloud/facetheory/svelte` Svelte adapter
- `@theory-cloud/facetheory/svelte/stitch-shell` Svelte shell/layout primitives built on the shared Stitch navigation helpers
- `@theory-cloud/facetheory/svelte/stitch-hosted-auth` Svelte hosted-auth primitives
- `@theory-cloud/facetheory/svelte/stitch-admin` Svelte dense-admin primitives
- `@theory-cloud/facetheory/tabletheory` TableTheory ISR metadata adapter

## Documentation

<!-- x-release-please-start-version -->

- [Getting Started](https://github.com/theory-cloud/FaceTheory/blob/v0.5.6-rc/docs/getting-started.md)
- [API Reference](https://github.com/theory-cloud/FaceTheory/blob/v0.5.6-rc/docs/api-reference.md)
- [Core Patterns](https://github.com/theory-cloud/FaceTheory/blob/v0.5.6-rc/docs/core-patterns.md)
- [Testing Guide](https://github.com/theory-cloud/FaceTheory/blob/v0.5.6-rc/docs/testing-guide.md)
- [CDK And AWS Notes](https://github.com/theory-cloud/FaceTheory/blob/v0.5.6-rc/docs/cdk/README.md)
<!-- x-release-please-end -->

The `v0.5.6-rc` release also includes the matching `facetheory-reference-${FACETHEORY_VERSION}.tar.gz` bundle with the canonical docs, runnable examples, and reference deployment stacks. <!-- x-release-please-version -->
