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

## Install v3.4.1 <!-- x-release-please-version -->

Install the exact GitHub release tarball:

```bash
export FACETHEORY_VERSION=3.4.1 # x-release-please-version
npm install --save-exact \
  "https://github.com/theory-cloud/FaceTheory/releases/download/v${FACETHEORY_VERSION}/theory-cloud-facetheory-${FACETHEORY_VERSION}.tgz"
```

Add the framework peers that match your adapter surface:

- React: `npm install react react-dom`
- React + AntD/Emotion: `npm install antd @emotion/react @emotion/cache @emotion/server`
- Vue: `npm install vue @vue/server-renderer`
- Svelte: `npm install svelte@^5.55.7`

Optional companion packages from pinned GitHub releases:

- AppTheory runtime: `https://github.com/theory-cloud/AppTheory/releases/download/v1.11.0/theory-cloud-apptheory-1.11.0.tgz`
- AppTheory CDK: `https://github.com/theory-cloud/AppTheory/releases/download/v1.11.0/theory-cloud-apptheory-cdk-1.11.0.tgz`
- TableTheory runtime: `https://github.com/theory-cloud/TableTheory/releases/download/v1.8.4/theory-cloud-tabletheory-ts-1.8.4.tgz`

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

The `v3.4.1` GitHub release also ships the matching `facetheory-reference-${FACETHEORY_VERSION}.tar.gz` bundle, which contains the canonical docs, runnable examples, and reference deployment stacks for offline use. <!-- x-release-please-version -->

## Resource Routes And Hydration Sidecars

`createFaceApp({ resources })` registers raw resource routes beside HTML Faces
for JSON/text/empty/method-guard responses. Resource routes return
`FaceResponse` directly; they do not declare a render mode and FaceTheory does
not wrap them in an HTML document. Prefer the helper exports
`jsonResourceResponse()`, `textResourceResponse()`,
`emptyResourceResponse()`, and `methodNotAllowedResourceResponse()` for common
raw responses.

Strict SSR hydration can be framework-owned: configure
`createFaceApp({ ssrHydrationSidecars })`, return normal
`viteHydrationForEntry()` data from the SSR Face, and FaceTheory writes the
exact render-time payload once before emitting a same-origin
`/_facetheory/ssr-data/...` link. Route that prefix to the same Lambda/FaceApp
handler as the HTML. Static SSG sidecars stay under `/_facetheory/data/*` for
S3/CloudFront delivery, and caller-managed `externalHydrationForEntry(...)`
sidecars remain available when the host owns the same-origin JSON URL.

Browser bootstraps should import `loadFaceHydrationData()` from
`@theory-cloud/facetheory/client` so inline, SSG, ISR, framework-owned SSR, and
caller-managed external hydration all flow through the same same-origin loader.
See [Getting Started](./docs/getting-started.md#add-a-raw-resource-route) and
[Core Patterns](./docs/core-patterns.md#pattern-let-facetheory-own-strict-ssr-hydration-sidecars).

## OAC Mutating Forms

AppTheorySsrSite deployments keep the Lambda Function URL origin protected with `AWS_IAM` and CloudFront OAC. Native
browser forms cannot add the `x-amz-content-sha256` payload hash required for mutating Lambda URL requests, so
FaceTheory exposes `startAwsOacFormTransport()` for explicitly marked same-origin URL-encoded forms:

```html
<form action="/control/items/new" method="post" data-facetheory-oac-form>
  <input name="name" required />
  <button>Create</button>
</form>
```

Route the action path to Lambda/AppTheory, keep OAC enabled, and install the helper from a client bootstrap module. The
payload hash is AWS signing plumbing only; app authentication, CSRF, idempotency, and business validation remain
application responsibilities. See [Getting Started](./docs/getting-started.md#add-an-oac-safe-mutating-ssr-form) and
[Core Patterns](./docs/core-patterns.md#pattern-mark-same-origin-mutating-forms-for-oac-transport).

## ISR Tenant Partition Safety

Blocking ISR is fail-closed when known tenant boundary headers such as `x-tenant-id` or `x-facetheory-tenant` reach
FaceTheory without an explicit `tenantKey` or custom `cacheKey`. Tenant-invariant ISR deployments should strip
viewer-supplied tenant-like headers at the CloudFront/AppTheory boundary; tenant-varying pages should use SSR or an
explicit trusted partition that includes every request-varying dimension that affects the cached HTML.

See [Migration Guide](./docs/migration-guide.md#migration-4-adopt-isr-tenant-fail-closed-defaults) and
[Troubleshooting](./docs/troubleshooting.md#issue-isr-fails-closed-when-tenant-headers-are-present) for upgrade
steps and verification.

## Strict CSP Hydration

Routes that need a no-inline CSP can set `FaceRenderResult.csp` to disable inline scripts, inline styles, and raw head
HTML, emit `buildStrictCspHeader()`, and move hydration data to a same-origin sidecar instead of inline
`__FACETHEORY_DATA__`. For SSR, prefer framework-owned `ssrHydrationSidecars`; use
`externalHydrationForEntry()` when the host intentionally owns the sidecar URL. See
[Getting Started](./docs/getting-started.md#add-strict-no-inline-csp-hydration) and
[Core Patterns](./docs/core-patterns.md#pattern-render-strict-no-inline-csp-pages-with-external-hydration).

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
- Strict CSP Svelte/Vite: `npm run example:vite:svelte:strict-csp:build && npm run example:vite:svelte:strict-csp:serve`
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
