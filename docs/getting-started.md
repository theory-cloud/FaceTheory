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
export FACETHEORY_VERSION=1.2.0 # x-release-please-version
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
  https://github.com/theory-cloud/AppTheory/releases/download/v1.1.0/theory-cloud-apptheory-1.1.0.tgz

npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v1.7.0/theory-cloud-tabletheory-ts-1.7.0.tgz
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
- Dense admin: `Tabs`, `FilterChip`, `FilterChipGroup`, `InlineKeyValueList`, `CopyableCode`, `LogStream`, `NonAuthoritativeBanner`, `MetadataBadgeGroup`, `OperatorEmptyState`, `GuardedOperatorShell`, `HealthStatusPanel`, `VisibilityMatrix`

Example composition:

```ts
import type {
  FilterChipConfig,
  LogEntry,
  TabItem,
} from "@theory-cloud/facetheory/stitch-admin";
import { Callout } from "@theory-cloud/facetheory/react/stitch-shell";
import {
  FilterChipGroup,
  LogStream,
  Tabs,
} from "@theory-cloud/facetheory/react/stitch-admin";

const tabs: TabItem[] = [
  { key: "policies", label: "Policies", count: 8 },
  { key: "catalog", label: "Catalog", count: 12 },
];

const filters: FilterChipConfig[] = [
  { key: "status", label: "status: active" },
  { key: "manifest", label: "manifest: stale", count: 2 },
];

const logs: LogEntry[] = [
  { id: "1", timestamp: "14:02:11", level: "debug", message: "Repair started" },
  {
    id: "2",
    timestamp: "14:02:12",
    level: "success",
    message: "Repair completed",
  },
];

// In React, render <Callout />, <Tabs />, <FilterChipGroup />, and <LogStream />
// from the React adapter paths above. In Vue and Svelte, keep the same shared
// data contracts and switch only the adapter import path.
```

Use the shared contract subpaths for data shape and semantic variants. Use the adapter-matched subpaths for actual components. That keeps the React, Vue, and Svelte surfaces in lockstep instead of letting one host drift into framework-local shapes.

The React operator visibility SSR example shows those primitives wired together from a Face `load()` function:

```bash
cd ts
npm run example:operator-visibility:build
npm run example:operator-visibility:serve
```

The example renders `NonAuthoritativeBanner`, `GuardedOperatorShell`, `HealthStatusPanel`, `VisibilityMatrix`, and `OperatorEmptyState` from injected data. Treat it as the reference shape for deterministic operator dashboards: load stable labels, metadata, and correlation IDs first, then render them without reading browser/session globals.

Operator visibility primitives use caller-supplied metadata, guard state, health observations, and visibility matrix rows/cells only. Pass stable provenance, confidence, staleness labels, correlation metadata, matrix cell labels, and `OperatorGuardStatus` values from `load()` or serialized hydration data; do not compute freshness, correlation, or authorization from ambient browser/session globals during render. Empty states should use `OperatorEmptyStateConfig.placeholderDataPolicy = "no-production-like-data"` instead of production-looking placeholder tenants, partners, releases, or versions.

### Operator dashboard integration boundaries

Keep the dashboard boundary explicit:

- **Auth state is upstream.** AppTheory middleware, an Autheory-hosted auth surface, or another host-owned service can validate the request before FaceTheory runs. FaceTheory should receive the derived `OperatorGuardStatus` and display it; it should not import Autheory validators, read provider sessions in a component, or encode Pay Theory release-control-plane rules.
- **Render mode follows request variance.** Use SSR for request-authorized operator pages and a deterministic SPA shell when client refreshes happen after the initial render. Do not use SSG for live authorized visibility data. Use ISR only for non-personalized or safely partitioned snapshots where `cacheKey` and `tenantKey` include every authorization, tenant, role, locale, and visibility variant that can change the HTML.
- **Freshness and correlation are data, not render side effects.** Age labels, observed timestamps, normalized correlation IDs, health summaries, and visibility cells come from `load()` or serialized hydration data. Components should display those values exactly instead of recomputing or looking them up from `Date.now()`, browser globals, auth/session state, or network calls during render.
- **No production-like placeholders.** Loading, unauthorized, filtered-empty, and missing-data states should be explicit about what is unavailable. Do not fill empty dashboards with realistic partner, tenant, release, version, or account-looking mock values.

For control-plane navigation, treat `path` as the SSR-safe baseline contract for nav items and breadcrumbs. Use `onNavigate` only as an optional client-side interception hook; if a host never hydrates, links with `path` must still work as normal anchors.

### Brand-agnostic surface primitives

FaceTheory provides a small set of brand-agnostic primitives that a consumer design system can wire up into a branded header without reaching into adapter internals. These exist in the React, Vue, and Svelte `stitch-shell` subpaths with parallel signatures.

- `Topbar` has optional `logo` and `surfaceLabel` slots (or props on Vue / React) rendered on the left edge in the order `[logo][surfaceLabel][left]`. `Shell` passes through the same as `topbarLogo` / `topbarSurfaceLabel` so consumers using the full Shell fill both without touching Topbar directly. FaceTheory makes no styling claims about the logo or chip content — it only provides the slot.
- `BrandHeader` renders a caller-supplied logo + wordmark with an optional surface-chip label. Signature: `{ logo, wordmark, surfaceLabel?, surfaceTone? }`. When `surfaceTone` is set, the chip binds its background / foreground to `--stitch-color-{surfaceTone}-container` and `--stitch-color-on-{surfaceTone}-container`, but FaceTheory normalizes the supplied tone to a safe lowercase kebab-case suffix first (for example `"Secondary Accent / Prod 2"` becomes `secondary-accent-prod-2`). If the tone normalizes empty, the chip falls back to the neutral surface-container tokens.
- `StitchTokenSet` accepts an optional `surface?: string` field that emits as `--{prefix}-surface` through `stitchToCssVars`. Brand-agnostic classification hook; FaceTheory ships no enumerated vocabulary.
- `StitchCssVarOptions.additionalPrefixes?: string[]` emits the token record under extra CSS variable prefixes in the same pass. Consumers that want a branded prefix (e.g. `--tc-*`) should include `--stitch` in the emitted set so FaceTheory's built-in stitch-shell components keep resolving through their hard-coded `var(--stitch-*, fallback)` declarations:

  ```ts
  import { stitchToCssVars } from "@theory-cloud/facetheory/stitch-tokens";

  const vars = stitchToCssVars(brandTokens, {
    prefix: "--tc",
    additionalPrefixes: ["--stitch"],
  });
  ```

  If you need to serialize those vars into SSR `<style>` output, use `stitchCssVarsToRootBlock(vars)` as the `cssText` for a `styleTags` entry (or a `headTags` item with `type: "style"`). Do **not** wrap the returned string in `<style>...</style>` and pass it through `head.html`; `head.html` is a raw escape hatch, not the normal style-delivery path.

Each adapter's `BrandHeader` composes cleanly as the `logo` value of its Topbar, or as a standalone header outside the Shell.

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

Important ISR default:

- FaceTheory’s default ISR cache key now partitions by route params and query string, and the default tenant hint prefers `x-tenant-id` over legacy `x-facetheory-tenant`.
- If cached HTML varies by auth/session/cookies/host-derived tenant, configure an explicit `cacheKey` / `tenantKey` or keep that route on SSR.

## Reference Bundle

The `v1.2.0` GitHub release includes the matching `facetheory-reference-${FACETHEORY_VERSION}.tar.gz` bundle. It contains: <!-- x-release-please-version -->

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
