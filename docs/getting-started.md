# Getting Started with FaceTheory

FaceTheory is a TypeScript runtime for SSR, SSG, and blocking ISR on Node.js `>=24`, with published adapters for React, Vue, and Svelte.

## Prerequisites

Required:

- Node.js `>=24`
- npm

Optional:

- AWS familiarity if you plan to use the reference deployment stacks
- AppTheory and TableTheory if you want the documented AWS-first integration path

## Install The Published Package

Use the exact GitHub release asset so your application stays pinned to the published FaceTheory contract.

### Step 1: Install FaceTheory

```bash
export FACETHEORY_VERSION=0.3.2 # x-release-please-version
npm install --save-exact \
  "https://github.com/theory-cloud/FaceTheory/releases/download/v${FACETHEORY_VERSION}/theory-cloud-facetheory-${FACETHEORY_VERSION}.tgz"
```

### Step 2: Install the peers that match your adapter surface

- React: `npm install react react-dom`
- React + AntD/Emotion: `npm install antd @emotion/react @emotion/cache @emotion/server`
- Vue: `npm install vue @vue/server-renderer`
- Svelte: `npm install svelte`

### Step 3: Install optional companion packages

These are only required if your application uses the corresponding integration surface:

```bash
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v0.17.1/theory-cloud-apptheory-0.17.1.tgz

npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v1.4.2/theory-cloud-tabletheory-ts-1.4.2.tgz
```

Use AppTheory when you want its Lambda Function URL runtime as the AWS entrypoint. Use TableTheory when you want the documented production ISR metadata store adapter.

## Build A Minimal App

```ts
import { createFaceApp, type FaceModule } from "@theory-cloud/facetheory";

const faces: FaceModule[] = [
  {
    route: "/",
    mode: "ssr",
    render: async () => ({ html: "<h1>Hello FaceTheory</h1>" }),
  },
];

const app = createFaceApp({ faces });
```

Next, expose `app.handle()` through either:

- `createLambdaUrlStreamingHandler({ app })` from `@theory-cloud/facetheory`, or
- `createAppTheoryFaceHandler({ app })` plus AppTheory's Lambda Function URL streaming handler

## Add A Handler

Direct Lambda Function URL handling:

```ts
import { createLambdaUrlStreamingHandler } from "@theory-cloud/facetheory";

export const handler = createLambdaUrlStreamingHandler({ app });
```

This entrypoint is for AWS Lambda. Outside Lambda, either pass the optional `awslambda` adapter explicitly or test request handling with `handleLambdaUrlEvent(app, event)`.

AppTheory entrypoint handling:

```ts
import {
  createApp,
  createLambdaFunctionURLStreamingHandler,
} from "@theory-cloud/apptheory";
import { createAppTheoryFaceHandler } from "@theory-cloud/facetheory/apptheory";

const runtime = createApp();
runtime.get("/", createAppTheoryFaceHandler({ app }));
runtime.get("/{proxy+}", createAppTheoryFaceHandler({ app }));

export const handler = createLambdaFunctionURLStreamingHandler(runtime);
```

## Static Generation Quickstart

Package consumers should call `buildSsgSite()` directly. The repository-local CLI remains available in the reference bundle if you want to study or adapt the example flow.

Use the programmatic surface:

```ts
import { buildSsgSite, type FaceModule } from "@theory-cloud/facetheory";

const faces: FaceModule[] = [
  {
    route: "/",
    mode: "ssg",
    render: async () => ({ html: "<h1>Static FaceTheory</h1>" }),
  },
];

await buildSsgSite({
  faces,
  outDir: "./dist",
});
```

Important default:

- SSG disables real network `fetch()` calls unless `--allow-network` or a mocked `fetch` implementation is supplied.

## Reference Bundle

The `v0.3.2` GitHub release includes the matching `facetheory-reference-${FACETHEORY_VERSION}.tar.gz` bundle. It contains: <!-- x-release-please-version -->

- `docs/` canonical consumer and operator docs
- `ts/examples/` runnable React, Vue, Svelte, and SSG examples
- `infra/` reference AppTheory + CloudFront deployment stacks

Use this bundle when you want the docs and examples available locally without cloning the repository.

## Repository Development

If you are contributing to FaceTheory itself, use the workspace-local flow instead of the published package install.

```bash
cd ts
npm ci
npm run typecheck
npm test
```

Equivalent root-level wrappers after install:

```bash
make ts-typecheck
make ts-test
```

## Next Steps

- Read [API Reference](./api-reference.md) for package exports, route contracts, CLI flags, and deployment-facing configuration.
- Read [Core Patterns](./core-patterns.md) for supported integration patterns and anti-patterns.
- Read [Testing Guide](./testing-guide.md) before changing public behavior.
- Read [CDK And AWS Notes](./cdk/README.md) if you are deploying behind CloudFront.
