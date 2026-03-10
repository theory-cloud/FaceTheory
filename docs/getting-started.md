# Getting Started with FaceTheory

FaceTheory is a TypeScript runtime for SSR, SSG, and blocking ISR on Node.js `>=24`, with published adapters for React, Vue, and Svelte.

## Prerequisites

Required:
- Node.js `>=24`
- npm
- This repository checked out locally

Optional:
- `make` if you want root-level wrappers such as `make ts-typecheck` and `make ts-test`
- AWS familiarity if you plan to use the reference deployment stacks

## Install And Validate

This path assumes a fresh checkout and validates the core workspace before you try any framework-specific example.

### Step 1: Install the TypeScript workspace

```bash
cd ts
npm ci
```

### Step 2: Run the baseline verification commands

```bash
cd ts
npm run typecheck
npm test
```

Equivalent root-level wrappers after install:

```bash
make ts-typecheck
make ts-test
```

Expected result:
- TypeScript checks pass.
- The unit suite passes for request normalization, routing, SSR, streaming, SSG, ISR, and adapter flows.

## Run A First Example

Start the React streaming example:

```bash
cd ts
npm run example:streaming:serve
```

Then open `http://localhost:4173/`.

Other high-signal examples:
- Buffered React SSR: `npm run example:buffered:serve`
- React Vite SSR: `npm run example:vite:ssr:build && npm run example:vite:ssr:serve`
- Vue Vite SSR: `npm run example:vite:vue:build && npm run example:vite:vue:serve`
- Svelte Vite SSR: `npm run example:vite:svelte:build && npm run example:vite:svelte:serve`
- Static generation: `npm run example:ssg:build && npm run example:ssg:serve`

## Build A Minimal App

```ts
import { createFaceApp, type FaceModule } from '@theory-cloud/facetheory';

const faces: FaceModule[] = [
  {
    route: '/',
    mode: 'ssr',
    render: async () => ({ html: '<h1>Hello FaceTheory</h1>' }),
  },
];

const app = createFaceApp({ faces });
```

Next, expose `app.handle()` through either:
- `createLambdaUrlStreamingHandler({ app })` from `@theory-cloud/facetheory`, or
- `createAppTheoryFaceHandler({ app })` plus AppTheory's Lambda Function URL streaming handler

## Static Generation Quickstart

Use this flow when you want to verify the static build contract separately from request-time SSR.

Use the repository CLI wrapper:

```bash
cd ts
npm run ssg -- --entry ./examples/ssg-basic/faces.ts --out ./tmp-ssg
```

Supported flags:
- `--entry <module>`
- `--out <dir>`
- `--trailing-slash always|never`
- `--allow-network`
- `--emit-hydration-data`

Important default:
- SSG disables real network `fetch()` calls unless `--allow-network` or a mocked `fetch` implementation is supplied.

## Next Steps

- Read [API Reference](./api-reference.md) for package exports, route contracts, CLI flags, and deployment-facing configuration.
- Read [Core Patterns](./core-patterns.md) for supported integration patterns and anti-patterns.
- Read [Testing Guide](./testing-guide.md) before changing public behavior.
- Read [CDK And AWS Notes](./cdk/README.md) if you are deploying behind CloudFront.
