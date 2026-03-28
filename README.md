# FaceTheory

FaceTheory is a TypeScript runtime for AWS-first SSR, SSG, and blocking ISR with deterministic head and style rendering plus adapter surfaces for React, Vue, and Svelte.

Canonical documentation lives under [docs/README.md](./docs/README.md).

## Install v0.1.1 <!-- x-release-please-version -->

Install the exact GitHub release tarball:

```bash
export FACETHEORY_VERSION=0.1.1 # x-release-please-version
npm install --save-exact \
  "https://github.com/theory-cloud/FaceTheory/releases/download/v${FACETHEORY_VERSION}/theory-cloud-facetheory-${FACETHEORY_VERSION}.tgz"
```

Add the framework peers that match your adapter surface:

- React: `npm install react react-dom`
- React + AntD/Emotion: `npm install antd @emotion/react @emotion/cache @emotion/server`
- Vue: `npm install vue @vue/server-renderer`
- Svelte: `npm install svelte`

Optional companion packages from pinned GitHub releases:

- AppTheory runtime: `https://github.com/theory-cloud/AppTheory/releases/download/v0.17.1/theory-cloud-apptheory-0.17.1.tgz`
- AppTheory CDK: `https://github.com/theory-cloud/AppTheory/releases/download/v0.17.1/theory-cloud-apptheory-cdk-0.17.1.tgz`
- TableTheory runtime: `https://github.com/theory-cloud/TableTheory/releases/download/v1.4.2/theory-cloud-tabletheory-ts-1.4.2.tgz`

## Quickstart

Create a minimal app:

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

Expose it through Lambda Function URLs directly:

```ts
import { createLambdaUrlStreamingHandler } from '@theory-cloud/facetheory';
import { app } from './app';

export const handler = createLambdaUrlStreamingHandler({ app });
```

`createLambdaUrlStreamingHandler()` expects Lambda's `awslambda.streamifyResponse` global at runtime. Outside Lambda, test request handling with `handleLambdaUrlEvent(app, event)` or pass the optional `awslambda` adapter explicitly.

The `v0.1.1` GitHub release also ships the matching `facetheory-reference-${FACETHEORY_VERSION}.tar.gz` bundle, which contains the canonical docs, runnable examples, and reference deployment stacks for offline use. <!-- x-release-please-version -->

## Repository Development

```bash
cd ts
npm ci
npm run typecheck
npm test
```

High-signal examples:
- React streaming: `npm run example:streaming:serve`
- Vue Vite SSR: `npm run example:vite:vue:build && npm run example:vite:vue:serve`
- Svelte Vite SSR: `npm run example:vite:svelte:build && npm run example:vite:svelte:serve`
- Svelte external library host: `npm run example:vite:svelte:library:build && npm run example:vite:svelte:library:serve`
- SSG: `npm run example:ssg:build && npm run example:ssg:serve`

## Repository Layout

- `docs/` canonical documentation
- `ts/` runtime package, tests, and local examples
- `infra/` reference CloudFront and Lambda deployment stacks

## Documentation Pointers

- [Getting Started](./docs/getting-started.md)
- [API Reference](./docs/api-reference.md)
- [Core Patterns](./docs/core-patterns.md)
- [Testing Guide](./docs/testing-guide.md)
- [CDK And AWS Notes](./docs/cdk/README.md)
- [Changelog](./CHANGELOG.md)
