# FaceTheory

FaceTheory is a TypeScript runtime for AWS-first SSR, SSG, and blocking ISR with deterministic head and style rendering plus adapter surfaces for React, Vue, and Svelte.

Canonical documentation lives under [docs/README.md](./docs/README.md).

## Status

FaceTheory is pre-1.0 and under active development. The runtime covers SSR, SSG, and blocking ISR with adapter
support for React, Vue, and Svelte. First production use is underway at [Pay Theory](https://paytheory.com)
(checkout page). See [CHANGELOG](CHANGELOG.md) for release history.

## Theory Cloud

FaceTheory is the client application layer of the
[Theory Cloud](https://github.com/theory-cloud/AppTheory/blob/main/THEORY_CLOUD.md) stack. It builds on
[TableTheory](https://github.com/theory-cloud/TableTheory) (data access, ISR cache schema) and
[AppTheory](https://github.com/theory-cloud/AppTheory) (serverless runtime, CDK constructs).

The single-path philosophy extends to client delivery: one way to render, one way to cache, one way to deploy.
FaceTheory's ISR implementation uses TableTheory for cache metadata and regeneration leases, ensuring the same
deterministic patterns that govern the backend also govern the frontend.

## Install v1.1.0 <!-- x-release-please-version -->

Install the exact GitHub release tarball:

```bash
export FACETHEORY_VERSION=1.1.0 # x-release-please-version
npm install --save-exact \
  "https://github.com/theory-cloud/FaceTheory/releases/download/v${FACETHEORY_VERSION}/theory-cloud-facetheory-${FACETHEORY_VERSION}.tgz"
```

Add the framework peers that match your adapter surface:

- React: `npm install react react-dom`
- React + AntD/Emotion: `npm install antd @emotion/react @emotion/cache @emotion/server`
- Vue: `npm install vue @vue/server-renderer`
- Svelte: `npm install svelte`

Optional companion packages from pinned GitHub releases:

- AppTheory runtime: `https://github.com/theory-cloud/AppTheory/releases/download/v1.1.0/theory-cloud-apptheory-1.1.0.tgz`
- AppTheory CDK: `https://github.com/theory-cloud/AppTheory/releases/download/v1.1.0/theory-cloud-apptheory-cdk-1.1.0.tgz`
- TableTheory runtime: `https://github.com/theory-cloud/TableTheory/releases/download/v1.7.0/theory-cloud-tabletheory-ts-1.7.0.tgz`

## Quickstart

Create a minimal app:

```ts
import { createFaceApp, type FaceModule } from "@theory-cloud/facetheory";

const faces: FaceModule[] = [
  {
    route: "/",
    mode: "ssr",
    render: async () => ({ html: "<h1>Hello FaceTheory</h1>" }),
  },
];

export const app = createFaceApp({ faces });
```

Expose it through Lambda Function URLs directly:

```ts
import { createLambdaUrlStreamingHandler } from "@theory-cloud/facetheory";
import { app } from "./app";

export const handler = createLambdaUrlStreamingHandler({ app });
```

`createLambdaUrlStreamingHandler()` expects Lambda's `awslambda.streamifyResponse` global at runtime. Outside Lambda, test request handling with `handleLambdaUrlEvent(app, event)` or pass the optional `awslambda` adapter explicitly.

The `v1.1.0` GitHub release also ships the matching `facetheory-reference-${FACETHEORY_VERSION}.tar.gz` bundle, which contains the canonical docs, runnable examples, and reference deployment stacks for offline use. <!-- x-release-please-version -->

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
- Operator visibility SSR example: `npm run example:operator-visibility:build && npm run example:operator-visibility:serve`
- SSG: `npm run example:ssg:build && npm run example:ssg:serve`

## Operator Visibility Dashboards

Stitch admin includes operator visibility contracts and React, Vue, and Svelte primitives for guarded operator dashboards. Hosts pass AppTheory/Autheory-derived auth state into FaceTheory as caller-supplied `OperatorGuardStatus`; FaceTheory renders that state but does not validate sessions or embed Autheory business logic.

For auth-varying dashboards, prefer SSR or a deterministic SPA shell. Avoid SSG for live authorized visibility data, and use ISR only when the cache key and tenant partitioning fully separate every request-varying dimension. Empty and placeholder states must use explicit no-data copy instead of production-like partner, tenant, release, or version mock values.

See [Getting Started](./docs/getting-started.md#add-stitch-control-plane-primitives), [API Reference](./docs/api-reference.md#operator-visibility-dashboard-boundary), and [Core Patterns](./docs/core-patterns.md#pattern-build-operator-dashboards-from-caller-supplied-state) for the integration boundary.

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
