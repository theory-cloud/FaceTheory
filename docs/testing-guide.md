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
