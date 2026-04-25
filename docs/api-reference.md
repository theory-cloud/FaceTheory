# FaceTheory API Reference

This reference summarizes the supported package exports, runtime contracts, and deployment-facing conventions that back the canonical FaceTheory docs set.

## Overview

Package:

- `@theory-cloud/facetheory` from the versioned GitHub release asset shown below

Runtime:

- Node.js `>=24`

Primary package exports are defined in `ts/package.json`. The repository also includes a local SSG CLI entrypoint used by `npm run ssg`.

## Install

Install the exact release asset before wiring one of the adapter surfaces into your application:

```bash
export FACETHEORY_VERSION=1.0.0 # x-release-please-version
npm install --save-exact \
  "https://github.com/theory-cloud/FaceTheory/releases/download/v${FACETHEORY_VERSION}/theory-cloud-facetheory-${FACETHEORY_VERSION}.tgz"
```

Adapter peers:

- React routes require `react` and `react-dom`
- React + AntD/Emotion integrations additionally require `antd`, `@emotion/react`, `@emotion/cache`, and `@emotion/server`
- Vue routes require `vue` and `@vue/server-renderer`
- Svelte routes require `svelte`

## Package Export Map

Use this table as the public entrypoint map for package consumers. It reflects the exports declared in `ts/package.json` and the corresponding source modules.

| Export                                               | Surface                              | Primary interfaces                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@theory-cloud/facetheory`                           | Core runtime                         | `createFaceApp`, `FaceApp`, `FaceModule`, `FaceMode`, `FaceRequest`, `FaceResponse`, `FaceRenderResult`, `buildSsgSite`, `createLambdaUrlStreamingHandler`, `S3HtmlStore`, `InMemoryHtmlStore`, `InMemoryIsrMetaStore`, `blockingIsrCacheControl`, `viteAssetsForEntry`, `viteHydrationForEntry`, `createCspNonce`, `readFaceHydrationData`, `parseFaceNavigationSnapshot`, `fetchFaceNavigationSnapshot`, `applyFaceNavigationSnapshot`, `loadFaceNavigationModule`, `startFaceNavigation` |
| `@theory-cloud/facetheory/apptheory`                 | AppTheory adapter                    | `createAppTheoryFaceHandler`, `appTheoryContextToFaceRequest`, `faceResponseToAppTheoryResponse`                                                                                                                                                                                                                                                                                                                                                                                            |
| `@theory-cloud/facetheory/aws-s3`                    | AWS SDK S3 adapter                   | `createAwsSdkS3HtmlStoreClient`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@theory-cloud/facetheory/stitch-tokens`             | Shared Stitch token utilities        | `StitchTokenSet` (with optional `surface` classification), `StitchCssVarOptions` (supports `prefix` and `additionalPrefixes`), `stitchToCssVars`, `stitchCssVarsToRootBlock`                                                                                                                                                                                                                                                                                                                |
| `@theory-cloud/facetheory/stitch-shell`              | Shared Stitch navigation helpers     | `NavItem`, `BreadcrumbNode`, `ResolvedNav`, `CalloutVariant`, `resolveActiveNav`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@theory-cloud/facetheory/stitch-admin`              | Shared Stitch admin contracts        | `TabItem`, `FilterChipConfig`, `LogEntry`, `LogLevel`, `StatusVariant`, `AuthorityState`, `OperatorGuardState`, `OperatorVisibilityMetadata`, `OperatorHealthRow`, `VisibilityMatrixRow`, `VisibilityMatrixCell`, `OperatorEmptyStateConfig`                                                                                                                                                                                                                                                |
| `@theory-cloud/facetheory/react`                     | React adapter                        | `renderReact`, `renderReactStream`, `createReactFace`, `createReactStreamFace`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `@theory-cloud/facetheory/react/antd`                | React Ant Design integration         | `createAntdIntegration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@theory-cloud/facetheory/react/emotion`             | React Emotion integration            | `createEmotionIntegration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@theory-cloud/facetheory/react/antd-emotion`        | React AntD token bridge              | `createAntdEmotionTokenIntegration`                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `@theory-cloud/facetheory/react/stitch-tokens`       | React Stitch token bridge            | `stitchToAntdTheme` plus the shared `stitch-tokens` exports                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `@theory-cloud/facetheory/react/stitch-shell`        | React Stitch shell primitives        | `Shell`, `Sidebar`, `Topbar` (optional `logo` / `surfaceLabel` slots), `BrandHeader`, `PageFrame`, `PageTitle`, `Breadcrumb`, `Section`, `Panel`, `StatCard`, `SummaryStrip`, `Callout`, `resolveActiveNav`                                                                                                                                                                                                                                                                                 |
| `@theory-cloud/facetheory/react/stitch-hosted-auth`  | React Stitch hosted-auth primitives  | `AuthPageLayout`, `AuthCard`, `AuthFlowStepper`, `AuthFlowSection`, `PasskeyCTA`, `OTPInput`, `ConsentItem`, `ConsentList`, `AuthStateCard`                                                                                                                                                                                                                                                                                                                                                 |
| `@theory-cloud/facetheory/react/stitch-admin`        | React Stitch dense-admin primitives  | `DataTable`, `DetailPanel`, `PropertyGrid`, `FormRow`, `FormSection`, `SplitForm`, `StatusTag`, `DestructiveConfirm`, `Tabs`, `FilterChip`, `FilterChipGroup`, `InlineKeyValueList`, `CopyableCode`, `LogStream`, `NonAuthoritativeBanner`, `MetadataBadge`, `MetadataBadgeGroup`, `OperatorEmptyState`, `GuardedOperatorShell`, `HealthStatusPanel`, `VisibilityMatrix`                                                                                                                    |
| `@theory-cloud/facetheory/vue`                       | Vue adapter                          | `renderVue`, `createVueFace`, `h`                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@theory-cloud/facetheory/vue/stitch-shell`          | Vue Stitch shell primitives          | `Shell`, `Sidebar`, `Topbar` (optional `logo` / `surfaceLabel` slots), `BrandHeader`, `PageFrame`, `PageTitle`, `Breadcrumb`, `Section`, `Panel`, `StatCard`, `SummaryStrip`, `Callout`, `resolveActiveNav`                                                                                                                                                                                                                                                                                 |
| `@theory-cloud/facetheory/vue/stitch-hosted-auth`    | Vue Stitch hosted-auth primitives    | `AuthPageLayout`, `AuthCard`, `AuthFlowStepper`, `AuthFlowSection`, `PasskeyCTA`, `OTPInput`, `ConsentItem`, `ConsentList`, `AuthStateCard`                                                                                                                                                                                                                                                                                                                                                 |
| `@theory-cloud/facetheory/vue/stitch-admin`          | Vue Stitch dense-admin primitives    | `DataTable`, `DetailPanel`, `PropertyGrid`, `FormRow`, `FormSection`, `SplitForm`, `StatusTag`, `DestructiveConfirm`, `Tabs`, `FilterChip`, `FilterChipGroup`, `InlineKeyValueList`, `CopyableCode`, `LogStream`, `NonAuthoritativeBanner`, `MetadataBadge`, `MetadataBadgeGroup`, `OperatorEmptyState`, `GuardedOperatorShell`, `HealthStatusPanel`, `VisibilityMatrix`                                                                                                                    |
| `@theory-cloud/facetheory/svelte`                    | Svelte adapter                       | `renderSvelte`, `createSvelteFace`                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `@theory-cloud/facetheory/svelte/stitch-shell`       | Svelte Stitch shell primitives       | `Shell`, `Sidebar`, `Topbar` (optional `logo` / `surfaceLabel` slots), `BrandHeader`, `PageFrame`, `PageTitle`, `Breadcrumb`, `Section`, `Panel`, `StatCard`, `SummaryStrip`, `Callout`, `resolveActiveNav`                                                                                                                                                                                                                                                                                 |
| `@theory-cloud/facetheory/svelte/stitch-hosted-auth` | Svelte Stitch hosted-auth primitives | `AuthPageLayout`, `AuthCard`, `AuthFlowStepper`, `AuthFlowSection`, `PasskeyCTA`, `OTPInput`, `ConsentItem`, `ConsentList`, `AuthStateCard`                                                                                                                                                                                                                                                                                                                                                 |
| `@theory-cloud/facetheory/svelte/stitch-admin`       | Svelte Stitch dense-admin primitives | `DataTable`, `DetailPanel`, `PropertyGrid`, `FormRow`, `FormSection`, `SplitForm`, `StatusTag`, `DestructiveConfirm`, `Tabs`, `FilterChip`, `FilterChipGroup`, `InlineKeyValueList`, `CopyableCode`, `LogStream`, `NonAuthoritativeBanner`, `MetadataBadge`, `MetadataBadgeGroup`, `OperatorEmptyState`, `GuardedOperatorShell`, `HealthStatusPanel`, `VisibilityMatrix`                                                                                                                    |
| `@theory-cloud/facetheory/tabletheory`               | TableTheory ISR adapter              | `TableTheoryIsrMetaStoreAdapter`, `createTableTheoryIsrMetaStore`                                                                                                                                                                                                                                                                                                                                                                                                                           |

The shared Stitch foundation lives under the framework-neutral `stitch-tokens`, `stitch-shell`, and `stitch-admin` subpaths so React, Vue, and Svelte applications can consume the same token, navigation, and dense-admin contracts. The visual primitives now ship with parallel React, Vue, and Svelte adapter subpaths so each framework consumes the same conceptual surface without falling back to React-only wrappers.

Operator visibility contracts in `@theory-cloud/facetheory/stitch-admin` are framework-neutral data shapes for guarded operator dashboards. They describe caller-supplied authorization state, authority/provenance/confidence/staleness metadata, health rows, entity × dimension visibility matrix rows/cells, and explicit empty states. Keep timestamps, age labels, confidence labels, and staleness copy stable in `load()` or serialized hydration data; do not compute freshness from ambient time during render.

## Core Runtime Contracts

These contracts shape every adapter and delivery mode. If you change one of these interfaces, update the canonical docs in the same change.

| Interface          | Purpose                              | Notes                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FaceModule`       | Route definition                     | Uses `route`, `mode`, optional `load`, optional `generateStaticParams`, and `render`. SSG params must resolve to normal route segments; dot-segments such as `.` and `..` are rejected.                                                                       |
| `FaceMode`         | Rendering mode                       | One of `ssr`, `ssg`, or `isr`.                                                                                                                                                                                                                                |
| `FaceRequest`      | Normalized request input             | Supports headers, cookies, query, body, base64 marker, and optional `cspNonce`.                                                                                                                                                                               |
| `FaceResponse`     | Runtime response                     | Includes normalized headers, cookies array, status, body, and `isBase64`.                                                                                                                                                                                     |
| `FaceRenderResult` | Render output before HTTP conversion | Supports document-shell attrs (`lang`, `htmlAttrs`, `bodyAttrs`), `head`, `headTags`, `styleTags`, `html`, cookies, headers, and hydration payload. `head.html` is a raw `<head>` escape hatch; prefer structured `headTags` / `styleTags` whenever possible. |
| `FaceContext`      | Per-request context                  | Exposes normalized request, route params, and proxy match.                                                                                                                                                                                                    |
| `FaceAppOptions`   | App constructor options              | Accepts `faces`, optional ISR config, and optional observability hooks.                                                                                                                                                                                       |
| `FaceIsrOptions`   | ISR runtime tuning                   | Configures HTML store, metadata store, lease timing, contention policy, cache key, tenant key, and cache-control generation.                                                                                                                                  |

Structured head/style emission is the supported default:

- `headTags: [{ type: 'style', cssText, attrs? }]` and `styleTags` participate in FaceTheory's normal `<head>` serialization, escaping, and CSP nonce handling.
- `FaceHeadTag` with `type: 'raw'` and `head.html` are raw HTML escape hatches inserted verbatim into `<head>`.
- `stitchCssVarsToRootBlock()` returns raw CSS text, not a full `<style>` tag. Feed that string into `styleTags` or a `headTags` style entry rather than wrapping it and sending it through `head.html`.

## Core Usage

These examples show the shortest supported path from route definitions to a deployable handler.

### Create an app

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

### Expose Lambda Function URL handling directly

```ts
import {
  createFaceApp,
  createLambdaUrlStreamingHandler,
} from "@theory-cloud/facetheory";

const app = createFaceApp({ faces });
export const handler = createLambdaUrlStreamingHandler({ app });
```

Runtime note:

- `createLambdaUrlStreamingHandler()` expects Lambda's `awslambda.streamifyResponse` global unless you pass the optional `awslambda` adapter explicitly
- Local tests can call `handleLambdaUrlEvent(app, event)` without the Lambda global

### Use AppTheory as the AWS entrypoint

```ts
import {
  createApp,
  createLambdaFunctionURLStreamingHandler,
} from "@theory-cloud/apptheory";
import { createFaceApp } from "@theory-cloud/facetheory";
import { createAppTheoryFaceHandler } from "@theory-cloud/facetheory/apptheory";

const app = createApp();
const faceApp = createFaceApp({ faces });
const faceHandler = createAppTheoryFaceHandler({ app: faceApp });

app.get("/", faceHandler);
app.get("/{proxy+}", faceHandler);

export const handler = createLambdaFunctionURLStreamingHandler(app);
```

## Framework Adapter Summary

Each adapter keeps the same `FaceModule` contract while translating framework-specific rendering details into a shared runtime output.

React:

- `createReactFace()` for buffered SSR
- `createReactStreamFace()` for streaming SSR
- `renderReactStream(..., { styleStrategy: 'all-ready' | 'shell' })`
- Integrations compose through `createState`, `wrapTree`, `contribute`, and `finalize`
- Keep request-local mutable data inside `createState`; static integration instances can then be reused safely across renders

Vue:

- `createVueFace()` wraps a `VNode` render function into a `FaceModule`
- `renderVue()` supports integration hooks plus `wrapApp`, and all of those hooks can share one request-local integration state object

Svelte:

- `createSvelteFace()` wraps a `SvelteRenderInput`
- `renderSvelte()` supports legacy `Component.render()` and Svelte 5 server rendering
- `renderSvelte()` passes the same request-local integration state through `wrapTree`, `contribute`, and `finalize`
- Packaged Svelte libraries should import their CSS from the client entry and use `viteAssetsForEntry()` + `viteHydrationForEntry()` to keep SSR asset tags and hydration aligned

## ISR Storage And Cache APIs

Blocking ISR separates HTML object storage from metadata and lease coordination. Keep both sides configured explicitly in production.

HTML storage:

- `InMemoryHtmlStore`
- `S3HtmlStore`
- `createAwsSdkS3HtmlStoreClient({ s3 })`

Metadata and lease storage:

- `InMemoryIsrMetaStore`
- `createTableTheoryIsrMetaStore({ config })`
- `TableTheoryIsrMetaStoreAdapter`

Relevant helpers:

- `defaultIsrCacheKey(input)`
- `blockingIsrCacheControl(input)`
- `isFresh(record, nowMs)`

Default ISR partitioning:

- `defaultIsrCacheKey(input)` now includes sorted route params **and** sorted query-string keys/values.
- The default tenant resolver prefers `x-tenant-id` and falls back to legacy `x-facetheory-tenant`.
- If HTML varies by request identity, cookies, auth, or other non-query inputs, supply an explicit `cacheKey` / `tenantKey` or keep that route on SSR.

Important deployment note:

- `S3HtmlStore.keyPrefix` is a physical S3 prefix
- `htmlPointerPrefix` in `FaceIsrOptions` is a logical prefix embedded in stored pointers
- Do not set both to the same non-empty value unless you intentionally want duplicated path segments

## Vite And Hydration Helpers

Use these helpers when a Vite SSR build needs deterministic asset tags and a matching hydration bootstrap module.

| Helper                                                  | Purpose                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `viteAssetsForEntry(manifest, entry, options)`          | Produces deterministic `modulepreload`, `stylesheet`, and optional asset hint tags. |
| `viteHydrationForEntry(manifest, entry, data, options)` | Produces a `FaceHydration` payload using the manifest bootstrap module.             |
| `viteDynamicImportPolicy()`                             | Returns the current dynamic import policy, which is `ignore`.                       |

Current behavior:

- `dynamicImports` from Vite manifests are intentionally ignored
- `includeAssets: true` adds preload or prefetch hints for manifest asset files

## Client Navigation

FaceTheory now exposes browser-side helpers for SPA-style navigation between `FaceModule` routes without a full document reload.

Core helpers:

- `readFaceHydrationData(document?)` reads the `__FACETHEORY_DATA__` payload from the current document
- `parseFaceNavigationSnapshot(html, options)` converts a rendered FaceTheory document into a structured navigation snapshot
- `fetchFaceNavigationSnapshot(url, options)` fetches and parses the next route as HTML and rejects redirected cross-origin responses when an `allowedOrigin` is supplied
- `applyFaceNavigationSnapshot(snapshot, options)` syncs document attrs, non-executable head tags, and either the configured view container or the full body
- `loadFaceNavigationModule(snapshot, options)` invokes an exported `hydrateFaceNavigation(...)` hook when present, or reloads the bootstrap module when the hook is absent, but rejects cross-origin bootstrap modules
- `startFaceNavigation(options)` intercepts same-origin links, rejects cross-origin programmatic navigations, fetches the next FaceTheory document, applies it, and triggers hydration

Recommended host pattern:

- wrap route content in a stable shell with a view container such as `data-facetheory-view`
- export `hydrateFaceNavigation(context)` from the client bootstrap module when you need persistent app state across navigations
- rely on the default module reload only as a compatibility fallback for existing entry modules that hydrate by top-level side effect
- keep SPA navigation same-origin; redirects to another origin and remote hydration modules fail closed

## Document Shell Attrs

`FaceRenderResult` can set document-level attrs directly:

```ts
return {
  lang: "ar",
  htmlAttrs: { dir: "rtl", "data-theme": "midnight" },
  bodyAttrs: { class: "app-shell", "data-density": "compact" },
  html: '<div id="root">...</div>',
};
```

Semantics:

- `lang` writes the emitted `<html lang="...">` value
- `htmlAttrs` and `bodyAttrs` are escaped and serialized like head attrs
- attrs are emitted in sorted key order for deterministic output
- explicit `lang` overrides `htmlAttrs.lang`
- if neither surface sets `lang`, FaceTheory still emits `lang="en"`
- buffered and streaming document paths use the same merge rules

## Observability Hooks

Observability is optional, but the hook surface is part of the public runtime contract for request timing and correlation.

`createFaceApp({ observability })` supports:

- `observability.log(record)` for `facetheory.request.completed`
- `observability.metric(record)` for request and render timing metrics
- `observability.now()` to override the clock used for durations

React streaming also exposes `onReadiness` for `shell` and `all-ready` timing events.

## Repository CLI Surface

The repository-local CLI is the supported way to exercise SSG from this workspace. Published package consumers should use `buildSsgSite()` directly unless a separate CLI is introduced later.

The package does not publish `ssg-cli.ts` as a package export. In this repository, use:

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

`buildSsgSite()` uses the same contract programmatically.

Security note:

- `generateStaticParams()` values must stay inside the declared route tree. Dot-segments such as `.` and `..` are rejected so SSG output cannot escape `outDir`.

## Deployment-Facing Environment Conventions

These variables come from the reference AWS stacks and describe the expected runtime wiring around assets and ISR storage. They are conventions for the documented deployment shape, not mandatory inputs for every local app.

The recommended CloudFront and CDK examples use these runtime conventions:

| Variable                        | Purpose                                    |
| ------------------------------- | ------------------------------------------ |
| `APPTHEORY_ASSETS_BUCKET`       | S3 bucket containing static assets         |
| `APPTHEORY_ASSETS_PREFIX`       | Asset prefix under that bucket             |
| `APPTHEORY_ASSETS_MANIFEST_KEY` | Vite manifest object key                   |
| `FACETHEORY_ISR_BUCKET`         | S3 bucket used for ISR HTML objects        |
| `FACETHEORY_ISR_PREFIX`         | S3 prefix for ISR HTML objects             |
| `APPTHEORY_CACHE_TABLE_NAME`    | AppTheory-wired cache metadata table alias |
| `FACETHEORY_CACHE_TABLE_NAME`   | FaceTheory cache metadata table alias      |
| `CACHE_TABLE_NAME`              | Compatibility alias for metadata table     |
| `CACHE_TABLE`                   | Compatibility alias for metadata table     |

These are deployment conventions from the reference stacks, not required inputs for every local runtime.

## Related Docs

Use the surrounding docs set for task-oriented setup, verification, and deployment guidance.

- [Getting Started](./getting-started.md)
- [Core Patterns](./core-patterns.md)
- [Testing Guide](./testing-guide.md)
- [CDK And AWS Notes](./cdk/README.md)
