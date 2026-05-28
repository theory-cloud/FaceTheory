---
title: Testing Guide
---

# FaceTheory Testing Guide

This guide covers the verification commands that back the public contract and the evidence expected before a push or release.

## Test Strategy

FaceTheory verification is centered on deterministic runtime behavior in the TypeScript workspace.

Primary goals:

- Validate request normalization, routing, buffered SSR, streaming SSR, SSG, ISR, and framework adapter behavior.
- Keep example commands runnable so docs and implementation do not drift apart.
- Capture enough evidence to distinguish toolchain issues from runtime regressions.

## Baseline Verification

Run the standard checks:

```bash
cd ts
npm run typecheck
npm test
```

Equivalent root wrappers after dependencies are installed:

```bash
make ts-typecheck
make ts-test
```

Expected result:

- Type checking completes with no errors.
- The unit suite passes.

## Focused Verification Paths

Run these targeted flows when a change touches one delivery mode or adapter more than the rest of the runtime.

### SSG

```bash
cd ts
npm run example:ssg:build
npm run example:ssg:serve
```

Use this when changing:

- route planning
- hydration data output
- static file layout

### Resource Routes

```bash
cd ts
node --import tsx test/unit/resource.test.ts
node --import tsx test/unit/app.test.ts
```

Use this when changing:

- `createFaceApp({ resources })`
- `FaceResourceRoute` routing, route-precedence, or conflict detection
- `jsonResourceResponse()`, `textResourceResponse()`,
  `emptyResourceResponse()`, or `methodNotAllowedResourceResponse()`
- docs that show raw JSON/text/empty/method-not-allowed responses

Local expected result:

- resource responses return raw `FaceResponse` bodies rather than HTML
  documents
- helper-owned headers are lower-case, sorted, deterministic, and default to
  `cache-control: no-store`
- JSON helpers apply the same HTML-significant escaping used by FaceTheory
  document serialization
- `methodNotAllowedResourceResponse()` emits a stable `405` with a sorted
  `allow` header
- exact duplicate and same-precedence ambiguous Face/resource routes fail closed
  during app construction

### OAC Mutating Form Transport

```bash
cd ts
npx tsx test/unit/oac-form.test.ts
```

Use this when changing:

- `startAwsOacFormTransport()`
- URL-encoded form field collection or payload hashing
- AppTheorySsrSite OAC mutating-form documentation
- response navigation, CSP, redirect, or unsupported-encoding behavior for marked forms

Local expected result:

- marked same-origin POSTs send `content-type: application/x-www-form-urlencoded;charset=UTF-8`
- marked same-origin POSTs send `x-amz-content-sha256` for the exact body bytes passed to `fetch`
- unmarked, `GET`, and `dialog` forms keep native behavior
- cross-origin actions and marked unsupported encodings fail before sending
- mutating fetches use `redirect: "error"`
- default HTML document replacement refuses CSP-protected responses unless the host handles the response

Release-candidate validation for an AppTheorySsrSite consumer should use the published GitHub Release tarball, not a
workspace link:

1. install the FaceTheory RC tarball exactly in the consuming app;
2. mark a same-origin URL-encoded form with `data-facetheory-oac-form`;
3. install `startAwsOacFormTransport()` from the client bootstrap module;
4. route the action path through AppTheory/CloudFront to Lambda, usually with `ssrPathPatterns`;
5. submit through the deployed CloudFront URL and confirm the request reaches Lambda without changing the Function URL
   auth type away from `AWS_IAM`;
6. confirm marked multipart/text/plain forms fail closed and do not send a request;
7. if the response uses CSP headers, confirm the host handles it through `onResponse` or `onNavigate`.

For the original lab driver, theory-mcp-server should validate `POST /agents/new` through CloudFront OAC before stable
promotion. A successful RC validation means the app-local workaround can be removed while keeping OAC enabled.

### Strict CSP Hydration And Navigation

```bash
cd ts
npm run example:vite:svelte:strict-csp:build
node --import tsx test/unit/strict-csp-harness.test.ts
node --import tsx test/unit/vite-strict-csp-svelte-example.test.ts
```

Use this when changing:

- `FaceCspPolicy`, `buildStrictCspHeader()`, or `validateStrictCspDocument()`
- `viteHydrationForEntry()`, `externalHydrationForEntry()`, or sidecar URL/data
  handling
- `createFaceApp({ ssrHydrationSidecars })` or
  `createSsrHydrationSidecarStore(...)`
- `@theory-cloud/facetheory/client` hydration loading
- adapter strict-CSP enforcement for React, Vue, or Svelte
- `startFaceNavigation()` external hydration loading or same-origin validation
- docs that describe strict no-inline CSP, external hydration, or Svelte/Vite strict examples

Local expected result:

- rendered documents contain no `__FACETHEORY_DATA__` inline JSON script
- every `<script>` has `src` and no inline body text
- no `<style>` tags, `style` attributes, or `on*` event-handler attributes appear in validated scopes
- strict Svelte/Vite output uses external CSS/assets and a same-origin module bootstrap
- the browser harness loads external hydration JSON before initial hydration and before `hydrateFaceNavigation(context)`
- same-origin navigation to the strict example's `/next` route preserves deterministic server/client hydration data
- framework-owned SSR sidecars emit `/_facetheory/ssr-data/...`, return raw
  no-store JSON from the same FaceApp handler, and do not increment Face
  `load()`/`render()` counts when fetched
- caller-managed `externalHydrationForEntry(...)` URLs are preserved and do not
  trigger framework sidecar writes
- SSG strict hydration sidecars use `/_facetheory/data/*` build artifacts, while
  ISR strict hydration sidecars stay paired with the cached HTML through the ISR
  runtime instead of using the SSR sidecar prefix
- `loadFaceHydrationData()` from `@theory-cloud/facetheory/client` reads inline
  hydration first, fetches same-origin external hydration when linked, and
  rejects unsafe schemes, cross-origin URLs, cross-origin redirects, and
  non-JSON sidecar responses

For documentation reviews, explicitly check the unsafe-claim boundary: these tests prove local runtime behavior and
example wiring, not that a release has been published, a Simulacrum RC has been validated, or an AWS/customer deployment
has succeeded.

### React SSR And Streaming

```bash
cd ts
npm run example:buffered:serve
npm run example:streaming:serve
```

Use this when changing:

- head rendering
- streaming behavior
- style extraction timing

### Operator Visibility SSR Example

```bash
cd ts
npm run example:operator-visibility:build
npx tsx test/unit/operator-visibility-example.test.ts
```

Use this when changing:

- Stitch admin operator visibility primitives
- deterministic guard/authority/confidence/staleness/correlation rendering
- health panels or visibility matrices used by operator dashboards

The example intentionally passes stable age labels, normalized correlation IDs, guard status, health observations, and matrix cells through Face `load()` data. Do not compute freshness or correlation from `Date.now()`, browser globals, auth/session state, or network calls during render.

For operator dashboard documentation or integration reviews, also confirm:

- AppTheory/Autheory-derived auth state is passed into FaceTheory as `OperatorGuardStatus`; FaceTheory docs and examples do not embed Autheory validation or product-specific authorization logic.
- Live auth-varying dashboards use SSR or a deterministic SPA shell. SSG is limited to static snapshots, and ISR examples call out explicit cache/tenant partitioning for every request-varying dimension.
- Empty, loading, unauthorized, and filtered states do not use production-like mock partner, tenant, release, account, or version values.

### Vite SSR Adapters

```bash
cd ts
npm run example:vite:ssr:build && npm run example:vite:ssr:serve
npm run example:vite:vue:build && npm run example:vite:vue:serve
npm run example:vite:svelte:build && npm run example:vite:svelte:serve
```

Use this when changing:

- manifest asset injection
- framework adapter parity
- hydration bootstrap behavior

## High-Signal Test Areas

These areas provide the fastest signal that a change has altered public behavior rather than only internal implementation details.

Representative unit coverage includes:

- HTTP and app runtime behavior
- Lambda Function URL conversion
- React streaming and style handling
- SSG planning and output layout
- ISR regeneration and cache state handling
- Vue, Svelte, and Vite example coverage
- AWS S3 and TableTheory adapter behavior

## Evidence To Capture

Capture enough context that another engineer can reproduce a failure without reverse-engineering your environment from scratch.

For every regression or risky change, capture:

- command run
- pass or fail result
- failing test names or stack traces
- Node.js version in use
- the adapter or mode involved, such as `react`, `vue`, `svelte`, `ssg`, or `isr`

For example-driven verification, also capture:

- URL checked
- expected versus actual headers
- generated output path if the flow writes files

## Operator Verification

Production and staging checks belong with the AWS operator docs so they stay aligned with the deployed topology.

Deployed checks for CloudFront, S3, Lambda URL, or ISR state belong in [CDK And AWS Notes](./cdk/README.md).
