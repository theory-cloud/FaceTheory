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
export FACETHEORY_VERSION=0.5.5 # x-release-please-version
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
  https://github.com/theory-cloud/AppTheory/releases/download/v0.24.3/theory-cloud-apptheory-0.24.3.tgz

npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v1.5.4/theory-cloud-tabletheory-ts-1.5.4.tgz
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

## Add Stitch Control-Plane Primitives

FaceTheory's Stitch UI surface is split into shared contracts plus framework-specific visual primitives:

- `@theory-cloud/facetheory/stitch-shell` exposes shared navigation helpers and `CalloutVariant`
- `@theory-cloud/facetheory/stitch-admin` exposes shared dense-admin contracts such as `TabItem`, `FilterChipConfig`, `LogEntry`, `LogLevel`, and `StatusVariant`
- React visual primitives live under `@theory-cloud/facetheory/react/stitch-shell` and `@theory-cloud/facetheory/react/stitch-admin`
- Vue visual primitives live under `@theory-cloud/facetheory/vue/stitch-shell` and `@theory-cloud/facetheory/vue/stitch-admin`
- Svelte visual primitives live under `@theory-cloud/facetheory/svelte/stitch-shell` and `@theory-cloud/facetheory/svelte/stitch-admin`

The component names are intentionally parallel across frameworks, so the same conceptual surface exists everywhere:

- Shell/layout: `Shell`, `PageFrame`, `Section`, `Panel`, `SummaryStrip`, `Callout`
- Dense admin: `Tabs`, `FilterChip`, `FilterChipGroup`, `InlineKeyValueList`, `CopyableCode`, `LogStream`

Example composition:

```ts
import type {
  FilterChipConfig,
  LogEntry,
  TabItem,
} from '@theory-cloud/facetheory/stitch-admin';
import { Callout } from '@theory-cloud/facetheory/react/stitch-shell';
import {
  FilterChipGroup,
  LogStream,
  Tabs,
} from '@theory-cloud/facetheory/react/stitch-admin';

const tabs: TabItem[] = [
  { key: 'policies', label: 'Policies', count: 8 },
  { key: 'catalog', label: 'Catalog', count: 12 },
];

const filters: FilterChipConfig[] = [
  { key: 'status', label: 'status: active' },
  { key: 'manifest', label: 'manifest: stale', count: 2 },
];

const logs: LogEntry[] = [
  { id: '1', timestamp: '14:02:11', level: 'debug', message: 'Repair started' },
  { id: '2', timestamp: '14:02:12', level: 'success', message: 'Repair completed' },
];

// In React, render <Callout />, <Tabs />, <FilterChipGroup />, and <LogStream />
// from the React adapter paths above. In Vue and Svelte, keep the same shared
// data contracts and switch only the adapter import path.
```

Use the shared contract subpaths for data shape and semantic variants. Use the adapter-matched subpaths for actual components. That keeps the React, Vue, and Svelte surfaces in lockstep instead of letting one host drift into framework-local shapes.

For control-plane navigation, treat `path` as the SSR-safe baseline contract for nav items and breadcrumbs. Use `onNavigate` only as an optional client-side interception hook; if a host never hydrates, links with `path` must still work as normal anchors.

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

The `v0.5.5` GitHub release includes the matching `facetheory-reference-${FACETHEORY_VERSION}.tar.gz` bundle. It contains: <!-- x-release-please-version -->

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
