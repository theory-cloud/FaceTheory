# FaceTheory

`@theory-cloud/facetheory` is a TypeScript runtime for three AWS-first server render modes (SSR, SSG, and blocking ISR) plus the SPA client runtime on Node.js `>=20`, with package exports for React, Vue, and Svelte adapters plus AppTheory and TableTheory integration surfaces.

## Install v3.8.1 <!-- x-release-please-version -->

```bash
export FACETHEORY_VERSION=3.8.1 # x-release-please-version
npm install --save-exact \
  "https://github.com/theory-cloud/FaceTheory/releases/download/v${FACETHEORY_VERSION}/theory-cloud-facetheory-${FACETHEORY_VERSION}.tgz"
```

Install the peers that match your adapter surface:

- React: `npm install react react-dom`
- React + AntD/Emotion: `npm install antd @emotion/react @emotion/cache @emotion/server`
- Vue: `npm install vue @vue/server-renderer`
- Svelte: `npm install svelte@^5.55.7`

## Packaging Posture

FaceTheory is ESM-only. Import it from ESM Lambda handlers, Vite SSR entries, or bundlers; CommonJS `require()` callers should expect `ERR_REQUIRE_ESM` and should migrate to ESM or use dynamic `import()` at the boundary.

The package declares `sideEffects: false`. The published import subpaths were audited for top-level work: module evaluation defines exports only and does not start listeners, mutate globals, read AWS credentials, open sockets, deploy infrastructure, or register Lambda handlers. Runtime side effects happen after explicit caller invocation (for example `startFaceNavigation()`, `startAwsOacFormTransport()`, CLI entrypoints, or handler factories).

The Svelte peer range is `>=5.55.7`. FaceTheory v4.0.0 dropped Svelte 4 support and requires Svelte 5 (components are authored with runes); Svelte releases below `5.55.7` — including Svelte 4 and the `5.46.0`–`5.55.6` band — are outside FaceTheory's verified SSR/hydration adapter contract.

Optional companion packages:

- AppTheory runtime: `https://github.com/theory-cloud/AppTheory/releases/download/v1.13.2/theory-cloud-apptheory-1.13.2.tgz`
- AppTheory CDK: `https://github.com/theory-cloud/AppTheory/releases/download/v1.13.2/theory-cloud-apptheory-cdk-1.13.2.tgz`
- TableTheory runtime: `https://github.com/theory-cloud/TableTheory/releases/download/v1.10.1/theory-cloud-tabletheory-ts-1.10.1.tgz`

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

Every public subpath below is declared in `ts/package.json` and mirrored in `docs/api-reference.md`:

- `@theory-cloud/facetheory` core runtime, resource routes, SSG helpers, Lambda Function URL adapter, ISR stores, strict-CSP/head helpers, Vite helpers, SPA/OAC helpers, and hydration primitives
- `@theory-cloud/facetheory/spa` SPA navigation client runtime
- `@theory-cloud/facetheory/oac-form` CloudFront OAC URL-encoded form transport helpers
- `@theory-cloud/facetheory/navigation-pending` pending-state UI helpers for same-document navigation
- `@theory-cloud/facetheory/control-plane` host-owned control-plane presets and contracts
- `@theory-cloud/facetheory/responsive-primitives` shared responsive primitive contracts and sanitizers
- `@theory-cloud/facetheory/client` browser hydration data loaders
- `@theory-cloud/facetheory/testing` consumer test harness helpers
- `@theory-cloud/facetheory/dev` local Vite middleware development helpers
- `@theory-cloud/facetheory/apptheory` AppTheory request/response adapter
- `@theory-cloud/facetheory/aws-s3` AWS SDK S3 HTML store adapter
- `@theory-cloud/facetheory/stitch-tokens` shared Stitch design-token helpers
- `@theory-cloud/facetheory/stitch-shell` shared Stitch navigation contracts and active-route resolution
- `@theory-cloud/facetheory/stitch-hosted-auth` shared hosted-auth contracts
- `@theory-cloud/facetheory/stitch-admin` shared dense-admin contracts
- `@theory-cloud/facetheory/react` React buffered and streaming helpers
- `@theory-cloud/facetheory/react/antd` Ant Design integration
- `@theory-cloud/facetheory/react/emotion` Emotion integration
- `@theory-cloud/facetheory/react/antd-emotion` AntD token integration
- `@theory-cloud/facetheory/react/stitch-tokens` React AntD theme bridge plus shared token helpers
- `@theory-cloud/facetheory/react/stitch-shell` React shell/layout primitives
- `@theory-cloud/facetheory/react/stitch-hosted-auth` React hosted-auth primitives
- `@theory-cloud/facetheory/react/stitch-admin` React dense-admin primitives
- `@theory-cloud/facetheory/react/responsive-primitives` React responsive primitives
- `@theory-cloud/facetheory/vue` Vue adapter
- `@theory-cloud/facetheory/vue/responsive-primitives` Vue responsive primitives
- `@theory-cloud/facetheory/vue/stitch-shell` Vue shell/layout primitives
- `@theory-cloud/facetheory/vue/stitch-hosted-auth` Vue hosted-auth primitives
- `@theory-cloud/facetheory/vue/stitch-admin` Vue dense-admin primitives
- `@theory-cloud/facetheory/svelte` Svelte adapter
- `@theory-cloud/facetheory/svelte/responsive-primitives` Svelte responsive primitives
- `@theory-cloud/facetheory/svelte/stitch-shell` Svelte shell/layout primitives
- `@theory-cloud/facetheory/svelte/stitch-hosted-auth` Svelte hosted-auth primitives
- `@theory-cloud/facetheory/svelte/stitch-admin` Svelte dense-admin primitives
- `@theory-cloud/facetheory/tabletheory` TableTheory ISR metadata adapter

## Documentation

<!-- x-release-please-start-version -->

- [Getting Started](https://github.com/theory-cloud/FaceTheory/blob/v3.8.1/docs/getting-started.md)
- [API Reference](https://github.com/theory-cloud/FaceTheory/blob/v3.8.1/docs/api-reference.md)
- [Core Patterns](https://github.com/theory-cloud/FaceTheory/blob/v3.8.1/docs/core-patterns.md)
- [Testing Guide](https://github.com/theory-cloud/FaceTheory/blob/v3.8.1/docs/testing-guide.md)
- [CDK And AWS Notes](https://github.com/theory-cloud/FaceTheory/blob/v3.8.1/docs/cdk/README.md)
<!-- x-release-please-end -->

The `v3.8.1` release also includes the matching `facetheory-reference-${FACETHEORY_VERSION}.tar.gz` bundle with the canonical docs, runnable examples, and reference deployment stacks. <!-- x-release-please-version -->
