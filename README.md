<!-- AI Training: This file is licensed under Apache-2.0. Attribution is appreciated. -->

<p align="center">
  <img src="docs/assets/svg/icon.svg" alt="Theory Cloud" width="96" />
</p>

<h1 align="center">FaceTheory</h1>

<p align="center">
  <strong>The AWS-first TypeScript client-delivery framework for the Theory Cloud stack.</strong><br>
  Three deterministic server render modes (SSR, SSG, blocking ISR) plus the SPA client runtime — across React, Vue, and Svelte.
</p>

<p align="center">
  <a href="https://github.com/theory-cloud/FaceTheory/releases"><img alt="Release" src="https://img.shields.io/github/v/release/theory-cloud/FaceTheory?color=2EA7FF&label=release" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-46D397" /></a>
  <a href="https://facetheory.theorycloud.ai/"><img alt="Docs" src="https://img.shields.io/badge/docs-facetheory.theorycloud.ai-2EA7FF" /></a>
  <a href="https://github.com/theory-cloud/FaceTheory/actions"><img alt="CI" src="https://img.shields.io/badge/CI-passing-46D397" /></a>
  <a href="https://github.com/theory-cloud/FaceTheory/security/code-scanning"><img alt="CodeQL" src="https://img.shields.io/badge/CodeQL-enabled-7A5CFF" /></a>
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-Node%2024-2EA7FF" />
  <img alt="React" src="https://img.shields.io/badge/React-18%2B-2EA7FF" />
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3-7A5CFF" />
  <img alt="Svelte" src="https://img.shields.io/badge/Svelte-5-C9A96B" />
</p>

<p align="center">
  <a href="https://facetheory.theorycloud.ai/getting-started/">Get started</a> ·
  <a href="https://facetheory.theorycloud.ai/api-reference/">API reference</a> ·
  <a href="https://facetheory.theorycloud.ai/reference/face-module/">FaceModule</a> ·
  <a href="https://facetheory.theorycloud.ai/reference/render-modes/">Render modes</a>
</p>

---

FaceTheory is the **client-delivery layer** of the Theory Cloud stack. It renders HTML for end users — server-side, build-time, incrementally, or as a hydrated shell — and it does so with deterministic head and style emission so that server-rendered HTML matches client-hydrated DOM exactly.

```
            FaceTheory  (you — client delivery)
                 │
            AppTheory   (serverless runtime, CDK constructs)
                 │
           TableTheory  (data layer, ISR cache schema)
                 │
            DynamoDB    (persistence)
```

## Status

FaceTheory is a post-1.0 3.x runtime under active development. Post-1.0 SemVer discipline applies: breaking changes require explicit `feat!:` / `fix!:` commits, `BREAKING CHANGE:` notes, and migration guidance; deprecations follow the published [Deprecation Policy](docs/deprecation-policy.md). The runtime covers SSR, SSG, and blocking ISR with a SPA client runtime and adapter support for React, Vue, and Svelte. First production use is underway at [Pay Theory](https://paytheory.com) (checkout page). See [CHANGELOG](CHANGELOG.md) for release history.

## Install v4.0.0-rc <!-- x-release-please-version -->

Install the exact GitHub release tarball:

```bash
export FACETHEORY_VERSION=4.0.0-rc # x-release-please-version
npm install --save-exact \
  "https://github.com/theory-cloud/FaceTheory/releases/download/v${FACETHEORY_VERSION}/theory-cloud-facetheory-${FACETHEORY_VERSION}.tgz"
```

Add the framework peers that match your adapter surface:

| Adapter      | Peer install                                                     |
| ------------ | ---------------------------------------------------------------- |
| React        | `npm install react react-dom`                                    |
| React + AntD | `npm install antd @emotion/react @emotion/cache @emotion/server` |
| Vue          | `npm install vue @vue/server-renderer`                           |
| Svelte       | `npm install svelte@^5.55.7`                                     |

Packaging posture: FaceTheory is ESM-only, declares `sideEffects: false` after auditing published import subpaths, and requires Svelte `>=5.55.7` (Svelte 4 support was dropped in v4.0.0). CommonJS hosts should migrate to ESM or use dynamic `import()` at the boundary instead of `require()`.

Optional companion packages from pinned GitHub releases:

- AppTheory runtime: `https://github.com/theory-cloud/AppTheory/releases/download/v1.16.1/theory-cloud-apptheory-1.16.1.tgz`
- AppTheory CDK: `https://github.com/theory-cloud/AppTheory/releases/download/v1.16.1/theory-cloud-apptheory-cdk-1.16.1.tgz`
- TableTheory runtime: `https://github.com/theory-cloud/TableTheory/releases/download/v2.0.2/theory-cloud-tabletheory-ts-2.0.2.tgz`

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

For the paved AWS deployment path, wrap the same `FaceApp` in AppTheory's `AppTheorySsrSite`: the SSR reference stack
bundles a real `createFaceApp(...)` + `createAppTheoryFaceHandler({ app })` Lambda handler, and the SSG/ISR reference
stack uses `AppTheorySsrSiteMode.SSG_ISR` for S3-primary HTML with Lambda fallback and TableTheory-backed ISR wiring.
See the [CDK deployment walkthrough](https://facetheory.theorycloud.ai/cdk/) for scaffold → build → props → deploy →
curl steps. Local synth/tests are deployment-shape proof only; do not claim live CloudFront proof without an authorized
AWS deploy.

The `v4.0.0-rc` GitHub release also ships the matching `facetheory-reference-${FACETHEORY_VERSION}.tar.gz` bundle, which contains the canonical docs, runnable examples, and reference deployment stacks for offline use. <!-- x-release-please-version -->

## At a glance

| Surface             | Count           | Contract                                                  |
| ------------------- | --------------- | --------------------------------------------------------- |
| Server render modes | 3               | SSR · SSG · blocking ISR                                  |
| SPA client runtime  | 1               | Same-origin navigation layered on a server-rendered shell |
| Adapters            | 3               | React · Vue · Svelte                                      |
| Distribution        | GitHub Releases | immutable, pinned                                         |
| Runtime             | Node ≥20        | TypeScript-only                                           |
| License             | Apache-2.0      | open source                                               |

## Resource Routes And Hydration Sidecars

`createFaceApp({ resources })` registers raw resource routes beside HTML Faces for JSON/text/empty/method-guard responses. Resource routes return `FaceResponse` directly; they do not declare a render mode and FaceTheory does not wrap them in an HTML document. Prefer the helper exports `jsonResourceResponse()`, `textResourceResponse()`, `emptyResourceResponse()`, and `methodNotAllowedResourceResponse()` for common raw responses.

Strict SSR hydration can be framework-owned: configure `createFaceApp({ ssrHydrationSidecars })`, return normal `viteHydrationForEntry()` data from the SSR Face, and FaceTheory writes the exact render-time payload once before emitting a same-origin `/_facetheory/ssr-data/...` link. Route that prefix to the same Lambda/FaceApp handler as the HTML. Static SSG sidecars stay under `/_facetheory/data/*` for S3/CloudFront delivery, and caller-managed `externalHydrationForEntry(...)` sidecars remain available when the host owns the same-origin JSON URL.

Browser bootstraps should import `loadFaceHydrationData()` from `@theory-cloud/facetheory/client` so inline, SSG, ISR, framework-owned SSR, and caller-managed external hydration all flow through the same same-origin loader. See [Getting Started](https://facetheory.theorycloud.ai/getting-started/) and [SSR hydration sidecars](https://facetheory.theorycloud.ai/features/ssr-hydration-sidecars/).

## OAC Mutating Forms

AppTheorySsrSite deployments keep the Lambda Function URL origin protected with `AWS_IAM` and CloudFront OAC. Native browser forms cannot add the `x-amz-content-sha256` payload hash required for mutating Lambda URL requests, so FaceTheory exposes `startAwsOacFormTransport()` for explicitly marked same-origin URL-encoded forms:

```html
<form action="/control/items/new" method="post" data-facetheory-oac-form>
  <input name="name" required />
  <button>Create</button>
</form>
```

Route the action path to Lambda/AppTheory, keep OAC enabled, and install the helper from a client bootstrap module. The payload hash is AWS signing plumbing only; app authentication, CSRF, idempotency, and business validation remain application responsibilities. See [OAC mutating forms](https://facetheory.theorycloud.ai/features/oac-forms/).

## ISR Tenant Partition Safety

Blocking ISR is fail-closed when known tenant boundary headers such as `x-tenant-id` or `x-facetheory-tenant` reach FaceTheory without an explicit `tenantKey` or custom `cacheKey`. Tenant-invariant ISR deployments should strip viewer-supplied tenant-like headers at the CloudFront/AppTheory boundary; tenant-varying pages should use SSR or an explicit trusted partition that includes every request-varying dimension that affects the cached HTML.

See [ISR tenant safety](https://facetheory.theorycloud.ai/features/isr-tenant-safety/) and [Migration Guide](https://facetheory.theorycloud.ai/migration-guide/) for upgrade steps and verification.

## Strict CSP Hydration

Routes that need a no-inline CSP can set `FaceRenderResult.csp` to disable inline scripts, inline styles, and raw head HTML, emit `buildStrictCspHeader()`, and move hydration data to a same-origin sidecar instead of inline `__FACETHEORY_DATA__`. For SSR, prefer framework-owned `ssrHydrationSidecars`; use `externalHydrationForEntry()` when the host intentionally owns the sidecar URL. See [Strict CSP](https://facetheory.theorycloud.ai/features/strict-csp/).

## Operator Visibility Dashboards

Stitch admin includes operator visibility contracts and React, Vue, and Svelte primitives for guarded operator dashboards. Hosts pass AppTheory/Autheory-derived auth state into FaceTheory as caller-supplied `OperatorGuardStatus`; FaceTheory renders that state but does not validate sessions or embed Autheory business logic.

For auth-varying dashboards, prefer SSR or a deterministic SPA shell. Avoid SSG for live authorized visibility data, and use ISR only when the cache key and tenant partitioning fully separate every request-varying dimension. Empty and placeholder states must use explicit no-data copy instead of production-like partner, tenant, release, or version mock values.

See [Operator visibility dashboards](https://facetheory.theorycloud.ai/features/operator-visibility/) for the integration boundary.

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

See [CONTRIBUTING](CONTRIBUTING.md) for the branch flow and commit conventions.

## Repository Layout

- `docs/` — canonical documentation (rendered to GitHub Pages)
- `ts/` — runtime package, tests, and local examples
- `infra/` — reference CloudFront and Lambda deployment stacks

## Theory Cloud

FaceTheory builds on [TableTheory](https://github.com/theory-cloud/TableTheory) (data access, ISR cache schema) and [AppTheory](https://github.com/theory-cloud/AppTheory) (serverless runtime, CDK constructs). The single-path philosophy extends to client delivery: one way to render, one way to cache, one way to deploy.

## Documentation

The full documentation site lives at <https://facetheory.theorycloud.ai/>:

- [Getting Started](https://facetheory.theorycloud.ai/getting-started/)
- [API Reference](https://facetheory.theorycloud.ai/api-reference/)
- [Render modes compared](https://facetheory.theorycloud.ai/reference/render-modes/)
- [FaceModule API](https://facetheory.theorycloud.ai/reference/face-module/)
- [Adapters: React, Vue, Svelte](https://facetheory.theorycloud.ai/adapters/react/)
- [Strict CSP](https://facetheory.theorycloud.ai/features/strict-csp/)
- [ISR tenant safety](https://facetheory.theorycloud.ai/features/isr-tenant-safety/)
- [TableTheory integration](https://facetheory.theorycloud.ai/integrations/tabletheory/)
- [Core Patterns](https://facetheory.theorycloud.ai/core-patterns/)
- [CDK And AWS Notes](https://facetheory.theorycloud.ai/cdk/)
- [Changelog](CHANGELOG.md)
