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
export FACETHEORY_VERSION=3.4.2-rc # x-release-please-version
npm install --save-exact \
  "https://github.com/theory-cloud/FaceTheory/releases/download/v${FACETHEORY_VERSION}/theory-cloud-facetheory-${FACETHEORY_VERSION}.tgz"
```

Adapter peers:

- React routes require `react` and `react-dom`
- React + AntD/Emotion integrations additionally require `antd`, `@emotion/react`, `@emotion/cache`, and `@emotion/server`
- Vue routes require `vue` and `@vue/server-renderer`
- Svelte routes require `svelte` satisfying `>=4 <5.46.0 || >=5.55.7`

## Package Export Map

Use this table as the public entrypoint map for package consumers. It reflects the exports declared in `ts/package.json` and the corresponding source modules.

| Export                                               | Surface                              | Primary interfaces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@theory-cloud/facetheory`                           | Core runtime                         | `createFaceApp`, `FaceApp`, `FaceModule`, `FaceResourceRoute`, `FaceResourceHandler`, `jsonResourceResponse`, `textResourceResponse`, `emptyResourceResponse`, `methodNotAllowedResourceResponse`, `createSsrHydrationSidecarStore`, `buildSsrHydrationSidecarDataUrl`, `serializeSsrHydrationSidecarJson`, `SsrHydrationSidecarError`, `DEFAULT_SSR_HYDRATION_SIDECAR_TTL_SECONDS`, `FaceMode`, `FaceRequest`, `FaceResponse`, `FaceRenderResult`, `buildSsgSite`, `createLambdaUrlStreamingHandler`, `S3HtmlStore`, `InMemoryHtmlStore`, `InMemoryIsrMetaStore`, `blockingIsrCacheControl`, `viteAssetsForEntry`, `viteHydrationForEntry`, `externalHydrationForEntry`, `createCspNonce`, `buildStrictCspHeader`, `validateStrictCspDocument`, `readFaceHydrationData`, `parseFaceNavigationSnapshot`, `fetchFaceNavigationSnapshot`, `applyFaceNavigationSnapshot`, `loadFaceNavigationModule`, `startFaceNavigation`, `startAwsOacFormTransport`, `createAwsOacUrlEncodedFormPayload` |
| `@theory-cloud/facetheory/client`                     | Browser hydration helpers             | `loadFaceHydrationData`, `fetchExternalFaceHydrationData`, `readFaceInlineHydrationData`, `readFaceExternalHydrationDataUrl`, `resolveSameOriginFaceHydrationUrl`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `@theory-cloud/facetheory/apptheory`                 | AppTheory adapter                    | `createAppTheoryFaceHandler`, `appTheoryContextToFaceRequest`, `faceResponseToAppTheoryResponse`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@theory-cloud/facetheory/aws-s3`                    | AWS SDK S3 adapter                   | `createAwsSdkS3HtmlStoreClient`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `@theory-cloud/facetheory/stitch-tokens`             | Shared Stitch token utilities        | `StitchTokenSet` (with optional `surface` classification), `StitchCssVarOptions` (supports `prefix` and `additionalPrefixes`), `stitchToCssVars`, `stitchCssVarsToRootBlock`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@theory-cloud/facetheory/stitch-shell`              | Shared Stitch navigation helpers     | `NavItem`, `BreadcrumbNode`, `ResolvedNav`, `CalloutVariant`, `resolveActiveNav`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@theory-cloud/facetheory/stitch-admin`              | Shared Stitch admin contracts        | `TabItem`, `FilterChipConfig`, `LogEntry`, `LogLevel`, `StatusVariant`, `AuthorityState`, `OperatorGuardState`, `OperatorCorrelationMetadata`, `OperatorVisibilityMetadata`, `OperatorHealthRow`, `VisibilityMatrixRow`, `VisibilityMatrixCell`, `OperatorEmptyStateConfig`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@theory-cloud/facetheory/react`                     | React adapter                        | `renderReact`, `renderReactStream`, `createReactFace`, `createReactStreamFace`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `@theory-cloud/facetheory/react/antd`                | React Ant Design integration         | `createAntdIntegration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `@theory-cloud/facetheory/react/emotion`             | React Emotion integration            | `createEmotionIntegration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `@theory-cloud/facetheory/react/antd-emotion`        | React AntD token bridge              | `createAntdEmotionTokenIntegration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@theory-cloud/facetheory/react/stitch-tokens`       | React Stitch token bridge            | `stitchToAntdTheme` plus the shared `stitch-tokens` exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@theory-cloud/facetheory/react/stitch-shell`        | React Stitch shell primitives        | `Shell`, `Sidebar`, `Topbar` (optional `logo` / `surfaceLabel` slots), `BrandHeader`, `PageFrame`, `PageTitle`, `Breadcrumb`, `Section`, `Panel`, `StatCard`, `SummaryStrip`, `Callout`, `resolveActiveNav`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@theory-cloud/facetheory/react/stitch-hosted-auth`  | React Stitch hosted-auth primitives  | `AuthPageLayout`, `AuthCard`, `AuthFlowStepper`, `AuthFlowSection`, `PasskeyCTA`, `OTPInput`, `ConsentItem`, `ConsentList`, `AuthStateCard`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@theory-cloud/facetheory/react/stitch-admin`        | React Stitch dense-admin primitives  | `DataTable`, `DetailPanel`, `PropertyGrid`, `FormRow`, `FormSection`, `SplitForm`, `StatusTag`, `DestructiveConfirm`, `Tabs`, `FilterChip`, `FilterChipGroup`, `InlineKeyValueList`, `CopyableCode`, `LogStream`, `NonAuthoritativeBanner`, `MetadataBadge`, `MetadataBadgeGroup`, `OperatorEmptyState`, `GuardedOperatorShell`, `HealthStatusPanel`, `VisibilityMatrix`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@theory-cloud/facetheory/vue`                       | Vue adapter                          | `renderVue`, `createVueFace`, `h`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@theory-cloud/facetheory/vue/stitch-shell`          | Vue Stitch shell primitives          | `Shell`, `Sidebar`, `Topbar` (optional `logo` / `surfaceLabel` slots), `BrandHeader`, `PageFrame`, `PageTitle`, `Breadcrumb`, `Section`, `Panel`, `StatCard`, `SummaryStrip`, `Callout`, `resolveActiveNav`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@theory-cloud/facetheory/vue/stitch-hosted-auth`    | Vue Stitch hosted-auth primitives    | `AuthPageLayout`, `AuthCard`, `AuthFlowStepper`, `AuthFlowSection`, `PasskeyCTA`, `OTPInput`, `ConsentItem`, `ConsentList`, `AuthStateCard`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@theory-cloud/facetheory/vue/stitch-admin`          | Vue Stitch dense-admin primitives    | `DataTable`, `DetailPanel`, `PropertyGrid`, `FormRow`, `FormSection`, `SplitForm`, `StatusTag`, `DestructiveConfirm`, `Tabs`, `FilterChip`, `FilterChipGroup`, `InlineKeyValueList`, `CopyableCode`, `LogStream`, `NonAuthoritativeBanner`, `MetadataBadge`, `MetadataBadgeGroup`, `OperatorEmptyState`, `GuardedOperatorShell`, `HealthStatusPanel`, `VisibilityMatrix`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@theory-cloud/facetheory/svelte`                    | Svelte adapter                       | `renderSvelte`, `createSvelteFace`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@theory-cloud/facetheory/svelte/stitch-shell`       | Svelte Stitch shell primitives       | `Shell`, `Sidebar`, `Topbar` (optional `logo` / `surfaceLabel` slots), `BrandHeader`, `PageFrame`, `PageTitle`, `Breadcrumb`, `Section`, `Panel`, `StatCard`, `SummaryStrip`, `Callout`, `resolveActiveNav`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@theory-cloud/facetheory/svelte/stitch-hosted-auth` | Svelte Stitch hosted-auth primitives | `AuthPageLayout`, `AuthCard`, `AuthFlowStepper`, `AuthFlowSection`, `PasskeyCTA`, `OTPInput`, `ConsentItem`, `ConsentList`, `AuthStateCard`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@theory-cloud/facetheory/svelte/stitch-admin`       | Svelte Stitch dense-admin primitives | `DataTable`, `DetailPanel`, `PropertyGrid`, `FormRow`, `FormSection`, `SplitForm`, `StatusTag`, `DestructiveConfirm`, `Tabs`, `FilterChip`, `FilterChipGroup`, `InlineKeyValueList`, `CopyableCode`, `LogStream`, `NonAuthoritativeBanner`, `MetadataBadge`, `MetadataBadgeGroup`, `OperatorEmptyState`, `GuardedOperatorShell`, `HealthStatusPanel`, `VisibilityMatrix`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@theory-cloud/facetheory/tabletheory`               | TableTheory ISR adapter              | `TableTheoryIsrMetaStoreAdapter`, `createTableTheoryIsrMetaStore`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

The shared Stitch foundation lives under the framework-neutral `stitch-tokens`, `stitch-shell`, and `stitch-admin` subpaths so React, Vue, and Svelte applications can consume the same token, navigation, and dense-admin contracts. The visual primitives now ship with parallel React, Vue, and Svelte adapter subpaths so each framework consumes the same conceptual surface without falling back to React-only wrappers.

Operator visibility contracts in `@theory-cloud/facetheory/stitch-admin` are framework-neutral data shapes for guarded operator dashboards. They describe caller-supplied authorization state, authority/provenance/confidence/staleness/correlation metadata, health rows, entity × dimension visibility matrix rows/cells, and explicit empty states. Keep timestamps, age labels, confidence labels, staleness copy, and correlation IDs stable in `load()` or serialized hydration data; do not compute freshness or derive correlation from ambient time, browser/session state, or lookups during render.

## Operator Visibility Dashboard Boundary

The operator visibility surface is presentational. It renders stable state supplied by the host; it is not an auth provider, cache-invalidation service, or release-control-plane business-logic package.

Host-owned inputs:

- `OperatorGuardStatus` values derived before render by AppTheory middleware, an Autheory integration, or another request-authorized service. FaceTheory components display the resulting authorized, unauthorized, loading, or error state without importing Autheory validators or reading provider sessions.
- `OperatorVisibilityMetadata`, `OperatorHealthRow`, `VisibilityMatrixRow`, and `VisibilityMatrixCell` values loaded through `FaceModule.load()` or serialized hydration data. Provenance, confidence, staleness, correlation, health, and visibility labels are caller-supplied strings and timestamps.
- `OperatorCorrelationMetadata` values when operators need a normalized support/debug identifier. Set `correlationId` to the ID operators should see/copy, and optionally include `correlationSource`, `trigger`, and distinct `requestId` values from AppTheory envelopes, EventBridge payloads, DynamoDB Streams records, or other upstream workload metadata.
- `OperatorEmptyStateConfig` values that use `placeholderDataPolicy: "no-production-like-data"` when a screen would otherwise be empty, filtered, unauthorized, or waiting on upstream evidence.

Example correlation mappings:

```ts
const eventBridgeMetadata = {
  correlation: {
    correlationId: envelope.correlation_id,
    correlationSource: envelope.correlation_source,
    trigger: "eventbridge",
    requestId: envelope.request_id,
  },
};

const dynamoStreamMetadata = {
  correlation: {
    correlationId: streamRecord.eventID,
    correlationSource: "dynamodb.event_id",
    trigger: "dynamodb_stream",
    requestId: lambdaRequestId,
  },
};
```

Render-mode guidance:

- SSR is the default for request-authorized operator dashboards because each request can derive fresh guard, role, tenant, and visibility state.
- A deterministic SPA shell is acceptable when the first paint is stable and any client refresh starts from serialized hydration data.
- SSG is only for static documentation, training, or non-authorized snapshots; do not use it for live auth-varying operator visibility.
- ISR requires safe partitioning. If HTML varies by user, role, tenant, cookie, locale, environment, or visibility source, encode that variance in explicit `cacheKey` / `tenantKey` functions or keep the route on SSR. Requests carrying known tenant boundary headers without an explicit ISR partition fail closed instead of sharing the implicit `default` tenant cache entry.

## Core Runtime Contracts

These contracts shape every adapter and delivery mode. If you change one of these interfaces, update the canonical docs in the same change.

| Interface           | Purpose                              | Notes                                                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FaceModule`        | Route definition                     | Uses `route`, `mode`, optional `load`, optional `generateStaticParams`, and `render`. SSG params must resolve to normal route segments; dot-segments such as `.` and `..` are rejected.                                                                         |
| `FaceResourceRoute` | Raw resource route                   | Uses `route` and `handle`. The handler receives the same normalized `FaceContext` route params/proxy/request shape as a Face and returns a raw `FaceResponse` directly. Resource routes do not declare a `mode` and are not document-rendered.                  |
| `FaceMode`          | Rendering mode                       | One of `ssr`, `ssg`, or `isr`.                                                                                                                                                                                                                                  |
| `FaceRequest`       | Normalized request input             | Supports headers, cookies, query, body, base64 marker, and optional `cspNonce`.                                                                                                                                                                                 |
| `FaceResponse`      | Runtime response                     | Includes normalized headers, cookies array, status, body, and `isBase64`. Resource helpers return this shape directly for JSON/text/empty/method-not-allowed routes.                                                                                            |
| `FaceRenderResult`  | Render output before HTTP conversion | Supports document-shell attrs (`lang`, `htmlAttrs`, `bodyAttrs`), `head`, `headTags`, `styleTags`, `csp`, `html`, cookies, headers, and hydration payload. `head.html` is legacy escaped head text; prefer structured `headTags` / `styleTags` for actual tags. |
| `FaceContext`       | Per-request context                  | Exposes normalized request, route params, and proxy match.                                                                                                                                                                                                      |
| `FaceAppOptions`    | App constructor options              | Accepts `faces`, optional raw `resources`, optional framework-owned SSR hydration sidecars, optional ISR config, optional observability hooks, and optional strict-CSP runtime limits.                                                                          |
| `FaceIsrOptions`    | ISR runtime tuning                   | Configures HTML store, metadata store, lease timing, contention policy, cache key, tenant key, and cache-control generation.                                                                                                                                    |

Structured head/style emission is the supported default:

- `headTags: [{ type: 'style', cssText, attrs? }]` and `styleTags` participate in FaceTheory's normal `<head>` serialization, escaping, and CSP nonce handling.
- `FaceHeadTag` with `type: 'raw'` is the explicit raw HTML escape hatch inserted verbatim into `<head>`; reserve it for caller-owned HTML.
- `stitchCssVarsToRootBlock()` returns CSS text, not a full `<style>` tag, and escapes `</style>` terminators as defense-in-depth. Feed that string into `styleTags` or a `headTags` style entry rather than wrapping it and sending it through `head.html`.

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

### Add a raw resource route

Resource routes live beside Faces for framework-owned and caller-owned raw
responses such as JSON health checks, text probes, and hydration sidecars. They
are adapter-neutral route handlers, not a new render mode. A resource handler
returns its
`FaceResponse` directly; FaceTheory still normalizes request headers and adds the
request id, but it does not call `renderHTMLDocument()` or emit head/style or
hydration document markup for the body.

```ts
import {
  createFaceApp,
  jsonResourceResponse,
  methodNotAllowedResourceResponse,
  textResourceResponse,
  type FaceModule,
  type FaceResourceRoute,
} from "@theory-cloud/facetheory";

const faces: FaceModule[] = [
  {
    route: "/",
    mode: "ssr",
    render: async () => ({ html: "<h1>Hello FaceTheory</h1>" }),
  },
];

const resources: FaceResourceRoute[] = [
  {
    route: "/api/health",
    handle: async (ctx) => {
      if (ctx.request.method !== "GET") {
        return methodNotAllowedResourceResponse(["GET"]);
      }

      return jsonResourceResponse({
        ok: true,
        route: ctx.request.path,
      });
    },
  },
  {
    route: "/robots.txt",
    handle: () => textResourceResponse("User-agent: *\nDisallow:\n"),
  },
];

const app = createFaceApp({ faces, resources });
```

Route precedence uses the same router specificity rules for Faces and resources:
static segments outrank params, params outrank proxy segments, and more-specific
resource routes can safely sit beside broad Face catch-alls. Exact duplicate
Face/resource routes and same-precedence overlapping Face/resource shapes fail
closed at app construction so a raw response cannot silently take the document
route (or vice versa) by insertion order.

Resource response helpers keep raw responses deterministic:

- `jsonResourceResponse(value, options?)` serializes with FaceTheory's safe JSON
  escaping for `<`, `>`, `&`, U+2028, and U+2029, then emits
  `content-type: application/json; charset=utf-8`.
- `textResourceResponse(body, options?)` emits UTF-8 plain text.
- `emptyResourceResponse(options?)` defaults to status `204` with an empty body
  and no `content-type` header.
- `methodNotAllowedResourceResponse(allowedMethods, options?)` returns a raw
  `405` response, canonicalizes methods to a sorted `allow` header, and does
  not render an HTML document.

Helpers lower-case and sort headers, default `cache-control` to `no-store`, and
accept caller extensions through `headers`, `cookies`, and `cacheControl`.
Protected helper-owned headers such as `content-type`, `cache-control`, and
`allow` stay deterministic; use the explicit helper options rather than relying
on mixed-case header overrides.

Avoid registering caller resources under FaceTheory-owned sidecar prefixes unless
the feature explicitly tells you to. In particular, framework-owned SSR
hydration sidecars reserve `/_facetheory/ssr-data/*` when
`createFaceApp({ ssrHydrationSidecars })` is configured.

### Serve framework-owned SSR hydration sidecars

`createFaceApp({ ssrHydrationSidecars })` is the supported SSR path for strict
no-inline hydration when the Face already produced the hydration data during the
HTML render. The option accepts the same storage and signing controls as the
low-level sidecar store:

- `htmlStore`
- `signingSecret`
- optional `ttlSeconds`, `keyPrefix`, `dataUrlPrefix`, `scope`, and `now`
- optional `requestVariant`

When an SSR Face returns `csp.inlineScripts === false` with inline/Vite
hydration, FaceTheory writes the exact render-time hydration payload once,
replaces the document hydration marker with an external
`rel="facetheory-hydration"` link, and serves that JSON through a
framework-owned resource route. The default data URL prefix is
`/_facetheory/ssr-data`. That prefix must route to the same Lambda/FaceApp
handler that returned the HTML.

```ts
import {
  buildStrictCspHeader,
  createFaceApp,
  viteAssetsForEntry,
  viteHydrationForEntry,
  type HtmlStore,
} from "@theory-cloud/facetheory";

declare const htmlStore: HtmlStore;
declare const manifest: Record<string, unknown>;

const app = createFaceApp({
  faces: [
    {
      route: "/account",
      mode: "ssr",
      load: async () => loadAccountData(),
      render: (_ctx, data) => {
        const { headTags } = viteAssetsForEntry(
          manifest,
          "src/entry-client.ts",
          { includeAssets: true },
        );

        return {
          csp: {
            inlineScripts: false,
            inlineStyles: false,
            rawHead: false,
          },
          headers: {
            "content-security-policy": buildStrictCspHeader(),
          },
          headTags,
          hydration: viteHydrationForEntry(
            manifest,
            "src/entry-client.ts",
            data,
          ),
          html: renderAccountHtml(data),
        };
      },
    },
  ],
  ssrHydrationSidecars: {
    htmlStore,
    signingSecret: process.env.FACETHEORY_SSR_HYDRATION_SECRET!,
  },
});
```

Framework-owned SSR sidecars are not a second render. A sidecar request reads the
stored payload associated with the original HTML response; it must not call the
Face `load()` or `render()` again. Caller-managed external hydration remains
available: when a Face already returns `hydration.type === "external"`,
FaceTheory preserves the caller's `dataUrl` and does not write a framework SSR
sidecar for that route.

Reserved-prefix behavior:

- The framework registers exact, single-token, and catch-all resource routes for
  the configured sidecar prefix.
- Framework-owned sidecar routes are registered before caller `resources`.
- Duplicate or same-precedence ambiguous resource patterns fail closed during app
  construction.
- Sidecar reads accept `GET` and return `application/json; charset=utf-8` with
  `cache-control: no-store`; invalid methods, malformed tokens, expired tokens,
  missing objects, wrong variants, and tampered bodies return a generic
  no-store failure response.

### Store caller-managed SSR hydration sidecars

`createSsrHydrationSidecarStore({ htmlStore, signingSecret, ... })` is the
low-level server primitive behind the framework-owned path. Use it directly only
when the host intentionally owns the sidecar route or storage contract and can
still guarantee that the JSON is the same payload used for the HTML render.
Existing inline hydration and caller-managed external hydration URLs remain
valid.

The store writes the exact server-render hydration payload to the configured `HtmlStore` as `application/json; charset=utf-8` with `cache-control: no-store`, using the same FaceTheory-safe JSON escaping as document/resource helpers for `<`, `>`, `&`, U+2028, and U+2029. Top-level non-serializable payloads (`undefined`, functions, symbols) are rejected before storage.

```ts
import {
  createSsrHydrationSidecarStore,
  externalHydrationForEntry,
  type HtmlStore,
} from "@theory-cloud/facetheory";

const sidecars = createSsrHydrationSidecarStore({
  htmlStore,
  signingSecret: process.env.FACETHEORY_SSR_HYDRATION_SECRET!,
  dataUrlPrefix: "/app-ssr-data",
  ttlSeconds: 60,
});

const sidecar = await sidecars.write({
  data: hydrationData,
  variant: {
    path: ctx.request.path,
    query: ctx.request.query,
    // Use stable derived partitions, not raw Authorization/Cookie/header values.
    identityPartition: userPartitionHash,
  },
});

const hydration = externalHydrationForEntry(
  manifest,
  "src/entry-client.ts",
  hydrationData,
  {
    dataUrl: sidecar.dataUrl,
  },
);
```

Security behavior:

- Tokens are HMAC-signed, scoped, expiring, and include `nbf`/`exp` checks; malformed, tampered, expired, future/not-yet-valid, wrong-variant, missing, and body-mismatched reads fail closed with `SsrHydrationSidecarError`.
- Token claims and stored metadata contain only object keys, timestamps, and HMAC-derived scope/variant/body digests. They do not contain the signing secret or raw auth/cookie/header values.
- Variant binding is caller-supplied but hashed before storage. Pass stable derived dimensions such as route path, sorted query values, locale, tenant partition, or an already-derived user/session partition hash; do not pass raw bearer tokens, cookies, API keys, or other auth secrets.
- `DEFAULT_SSR_HYDRATION_SIDECAR_TTL_SECONDS` is `60`. Use short lifetimes because SSR hydration sidecars are intended to be fetched immediately by the page that received the matching HTML.

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
- Strict no-inline CSP (`csp.inlineScripts === false`) rejects React shell streaming. Use the default `all-ready` style strategy so FaceTheory can validate the complete document before bytes flush.
- Strict no-inline styles (`csp.inlineStyles === false`) reject adapter-emitted inline styles, including Emotion/AntD extraction output. Use external CSS/asset delivery for routes that must run under a no-inline policy.

Vue:

- `createVueFace()` wraps a `VNode` render function into a `FaceModule`
- `renderVue()` supports integration hooks plus `wrapApp`, and all of those hooks can share one request-local integration state object

Svelte:

- `createSvelteFace()` wraps a `SvelteRenderInput`
- `renderSvelte()` supports legacy `Component.render()` and Svelte 5 server rendering
- `renderSvelte()` passes the same request-local integration state through `wrapTree`, `contribute`, and `finalize`
- Packaged Svelte libraries should import their CSS from the client entry and use `viteAssetsForEntry()` + `viteHydrationForEntry()` to keep SSR asset tags and hydration aligned
- Strict no-inline CSP rejects raw Svelte SSR head output and inline CSS fallback output. Keep strict Svelte pages on structured FaceTheory `headTags`, external CSS from the client entry, and external hydration data.

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
- `tenantKeyFromTrustedHeader(headerName?)`
- `blockingIsrCacheControl(input)`
- `isFresh(record, nowMs)`

Default ISR partitioning:

- `defaultIsrCacheKey(input)` includes sorted route params, sorted query-string keys/values, and hashed request-identity partitions for cookies and common auth headers (`Authorization`, `Proxy-Authorization`, `X-API-Key`, `X-Amz-Security-Token`). Raw cookie and auth values are not written to cache keys.
- The default tenant resolver intentionally ignores request tenant headers and uses `default`. For authenticated tenant boundaries, supply `tenantKey` explicitly (for example `tenantKeyFromTrustedHeader('x-tenant-id')` after trusted middleware strips client-supplied copies).
- If a request includes a known tenant boundary header (`x-tenant-id` or `x-facetheory-tenant`) and the app has not configured an explicit `tenantKey` or custom `cacheKey`, ISR fails closed before cache lookup or HTML writes. Remove tenant-like headers for tenant-invariant ISR, provide a trusted `tenantKey`, provide a custom `cacheKey`, or keep the route on SSR.
- If HTML varies by other request headers or identity inputs, supply an explicit `cacheKey` / `tenantKey` or keep that route on SSR.
- For tenant-scoped rotation workflows, keep the route on SSR unless the owner can pair rotation with cache identity or
  invalidation. The usual ISR shape is to include a trusted rotation/version dimension in a custom `cacheKey` so newly
  rotated material does not reuse old cached HTML; direct metadata/object invalidation remains a host-owned
  TableTheory/S3 operation rather than a generic FaceTheory browser-rendering primitive.

Important deployment note:

- `S3HtmlStore.keyPrefix` is a physical S3 prefix
- `htmlPointerPrefix` in `FaceIsrOptions` is a logical prefix embedded in stored pointers
- Do not set both to the same non-empty value unless you intentionally want duplicated path segments

## Vite And Hydration Helpers

Use these helpers when a Vite SSR build needs deterministic asset tags and a matching hydration bootstrap module.

| Helper                                                      | Purpose                                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `viteAssetsForEntry(manifest, entry, options)`              | Produces deterministic `modulepreload`, `stylesheet`, and optional asset hint tags. |
| `viteHydrationForEntry(manifest, entry, data, options)`     | Produces a `FaceHydration` payload using the manifest bootstrap module.             |
| `externalHydrationForEntry(manifest, entry, data, options)` | Produces a same-origin external hydration contract for strict no-inline CSP routes. |
| `viteDynamicImportPolicy()`                                 | Returns the current dynamic import policy, which is `ignore`.                       |

Current behavior:

- `dynamicImports` from Vite manifests are intentionally ignored
- `includeAssets: true` adds preload or prefetch hints for manifest asset files

## Strict CSP Rendering

FaceTheory supports two CSP-compatible rendering styles:

- **Nonce-compatible CSP** keeps FaceTheory-owned inline hydration scripts and inline style tags available, but adds a
  per-request `nonce` through `FaceRequest.cspNonce`. Use this only for per-request SSR HTML where the CSP header can
  carry the same nonce as the document.
- **Strict no-inline CSP** sets `FaceRenderResult.csp` to `{ inlineScripts: false, inlineStyles: false, rawHead: false }`
  and requires all executable code, CSS, and hydration data to be external and same-origin. This is the required shape
  for cached SSG/ISR HTML when a nonce would not be stable across requests.

Core strict-CSP exports:

- `DEFAULT_STRICT_CSP_STREAMING_BODY_LIMIT_BYTES` is the default maximum raw body size FaceTheory will collect from a
  strict no-inline streaming render result before whole-document validation. The default is 5 MiB.
- `FaceCspPolicy` is the route-level render policy surface. `inlineScripts:false` rejects inline script bodies,
  inline hydration JSON, inline event-handler attributes, and cross-origin bootstrap/data URLs. `inlineStyles:false`
  rejects inline style tags and `style` attributes. `rawHead:false` rejects caller-owned raw head HTML.
- `buildStrictCspHeader({ cspNonce? })` returns FaceTheory's same-origin CSP header baseline. Header attachment is
  explicit through `FaceRenderResult.headers`; FaceTheory validates output but does not silently add response headers.
- `validateStrictCspDocument(html, { policy })` is the body-level validator used by the runtime before returning strict
  buffered HTML. It catches raw body output that structured head validation cannot see.
- `externalHydrationForEntry(manifest, entry, data, { dataUrl, ...options })` pairs Vite asset tags with
  caller-managed `FaceExternalHydration`. The rendered document emits a `<link rel="facetheory-hydration" ...>` marker
  instead of `__FACETHEORY_DATA__` inline JSON, and the client bootstrap fetches `dataUrl` before hydration. Use this
  when the host owns the sidecar route or object.
- `viteHydrationForEntry(manifest, entry, data, options)` remains the normal adapter-friendly Vite hydration helper for
  SSR. When `createFaceApp({ ssrHydrationSidecars })` is configured, strict SSR can return this inline/Vite hydration
  and let FaceTheory externalize the exact render-time payload under `/_facetheory/ssr-data/...`.

Strict SSR route sketch with framework-owned sidecars:

```ts
import {
  buildStrictCspHeader,
  createFaceApp,
  InMemoryHtmlStore,
  viteAssetsForEntry,
  viteHydrationForEntry,
} from "@theory-cloud/facetheory";

const strictCsp = {
  inlineScripts: false,
  inlineStyles: false,
  rawHead: false,
} as const;

const app = createFaceApp({
  faces: [
    {
      route: "/account",
      mode: "ssr",
      load: async () => loadAccountData(),
      render: async (_ctx, data) => {
        const { headTags } = viteAssetsForEntry(
          manifest,
          "src/entry-client.ts",
          { includeAssets: true },
        );

        return {
          csp: strictCsp,
          headers: {
            "content-security-policy": buildStrictCspHeader(),
          },
          headTags,
          hydration: viteHydrationForEntry(
            manifest,
            "src/entry-client.ts",
            data,
          ),
          html: renderAccountHtml(data),
        };
      },
    },
  ],
  ssrHydrationSidecars: {
    // Local example store; use a durable HtmlStore for deployment.
    htmlStore: new InMemoryHtmlStore(),
    signingSecret: process.env.FACETHEORY_SSR_HYDRATION_SECRET!,
  },
});
```

Strict streaming limit:

- Strict no-inline streaming responses are buffered before validation because bytes must not flush before the final
  document is known to satisfy the route policy.
- During that buffer step, FaceTheory counts raw `Uint8Array` bytes as each chunk arrives and fails closed with a
  deterministic `413 Payload Too Large` response when `strictCsp.maxStreamingBodyBytes` is exceeded.
- The failed response does not validate or return a truncated partial document. Non-strict streaming responses are not
  collected by this limit and still preflight only the first render chunk before returning an `AsyncIterable`.

```ts
import {
  DEFAULT_STRICT_CSP_STREAMING_BODY_LIMIT_BYTES,
  createFaceApp,
} from "@theory-cloud/facetheory";

const app = createFaceApp({
  faces,
  strictCsp: {
    // Optional: tune if a strict streaming route has a larger validated body budget.
    maxStreamingBodyBytes: DEFAULT_STRICT_CSP_STREAMING_BODY_LIMIT_BYTES,
  },
});
```

Adapter notes:

- React strict no-inline routes cannot use shell streaming because bytes would flush before whole-document validation.
  Use `styleStrategy: "all-ready"` and avoid inline CSS-in-JS extraction on routes with `inlineStyles:false`. React
  strict SSR can use framework-owned SSR sidecars without changing the public `createReactFace()` shape.
- Vue strict no-inline routes must use external hydration data and external stylesheet assets. Vue strict SSR can use
  framework-owned SSR sidecars without changing the public `createVueFace()` shape.
- Svelte strict no-inline routes are supported through `renderSvelte()` / `createSvelteFace()` when they use
  external hydration data, including framework-owned SSR sidecars and without changing the public `createSvelteFace()`
  shape. They must avoid `<svelte:head>` raw SSR output and Svelte component `<style>` fallback output. Import CSS from
  the Vite client entry, emit head through FaceTheory's structured `headTags`, and use the strict-CSP Svelte example as
  the reference browser-hydration shape.

Hydration sidecar ownership by mode:

- **SSG** build output writes static strict hydration JSON under `/_facetheory/data/*`; route that prefix to S3 with the
  generated HTML.
- **ISR** externalizes strict hydration through the ISR cache path and stores sidecar data with the HTML/cache metadata
  pair so stale HTML and stale data stay paired.
- **SSR** framework-owned sidecars use `createFaceApp({ ssrHydrationSidecars })` and default to
  `/_facetheory/ssr-data/*`; route that prefix to the same Lambda/FaceApp handler as the HTML request.
- **Caller-managed external sidecars** use `externalHydrationForEntry(...)` with a host-owned same-origin `dataUrl`.
  The host is responsible for serving the exact payload used to render the HTML and for keeping its routing distinct
  from FaceTheory-owned prefixes.

Client navigation:

- `startFaceNavigation()` parses the next FaceTheory document, loads external hydration JSON before DOM mutation, then
  invokes `hydrateFaceNavigation(context)` when the bootstrap module exports it.
- Navigation rejects cross-origin documents, cross-origin bootstrap modules, and cross-origin external hydration URLs
  before mutating the current document.
- A route that still uses legacy inline hydration remains compatible in non-strict mode, but a strict no-inline route
  must use external hydration, either caller-managed or framework-owned by SSR/SSG/ISR.

## OAC Mutating Form Helpers

AppTheorySsrSite deployments that use Lambda Function URL OAC keep the SSR origin protected with `AWS_IAM`. Native browser form POSTs cannot add the `x-amz-content-sha256` header that CloudFront must sign for mutating Lambda URL requests, so FaceTheory provides an opt-in browser helper for same-origin URL-encoded forms.

Core exports:

- `AWS_OAC_FORM_MARKER_ATTRIBUTE` is the default opt-in marker, `data-facetheory-oac-form`.
- `AWS_OAC_CONTENT_SHA256_HEADER` is the required `x-amz-content-sha256` header name.
- `collectAwsOacFormFields(form, { submitter })` reads native successful form controls through `FormData`, preserving duplicate names and submitter ordering. Non-string entries such as files throw instead of being stringified.
- `createAwsOacUrlEncodedFormBody(fields)` creates the exact UTF-8 `application/x-www-form-urlencoded` body bytes.
- `createAwsOacUrlEncodedFormPayload(form, options)` returns the encoded body, content type, fields, and lowercase SHA256 hex digest over those bytes.
- `sha256HexForAwsOacPayload(body, digest?)` exposes the Web Crypto digest path with a test-injectable digest.
- `startAwsOacFormTransport(options)` intercepts only forms carrying the marker, resolves action/method/encoding from the form and submitter, enforces same-origin actions, preserves constraint validation, and sends the encoded body through `fetch` with `credentials: "same-origin"`, `redirect: "error"`, `content-type`, and `x-amz-content-sha256`.
- `onNavigate(context)` lets a host coordinate successful form outcomes with `startFaceNavigation()` or another caller-owned navigation layer. If the hook returns anything other than `false`, FaceTheory treats the outcome as handled; for CSP-protected HTML responses, that hook is the caller-owned boundary where the host must choose a full browser navigation or another CSP-safe handling path.

Example client bootstrap:

```ts
import { startAwsOacFormTransport } from "@theory-cloud/facetheory";

const oacForms = startAwsOacFormTransport();

// Optional during teardown in a long-lived client shell.
oacForms.stop();
```

Form markup stays explicit:

```html
<form action="/agents/new" method="post" data-facetheory-oac-form>
  <input name="agentName" required />
  <button name="intent" value="create">Create agent</button>
</form>
```

The helper intentionally leaves unmarked, `GET`, and `dialog` forms on native browser behavior. It is marker-scoped, not
path-scoped: it does not monkeypatch `fetch`, and it does not know which same-origin CloudFront behaviors route to the
OAC-protected SSR Lambda. In a distribution that also has bearer-auth Function URL origins, do not mark non-OAC forms
such as `/api/*`, `/auth/*`, `/.well-known/*`, or `/attestations/*`; any marked same-origin mutating form is handled by
the OAC transport regardless of action path. `PUT`, `PATCH`, and `DELETE` require explicit `allowedMethods` opt-in so
the helper, not the browser, owns the actual fetch method and body bytes. Marked mutating forms must resolve to
`application/x-www-form-urlencoded`: submitter `formenctype` overrides form `enctype`, and `multipart/form-data`,
`text/plain`, or any other unsupported marked encoding fails closed through `onError` before a request is sent.
Browser-generated multipart file uploads are out of scope for this URL-encoded transport.

Default navigation policy after a successful fetch is deliberately full-document instead of partial DOM patching:

- HTTP redirects fail closed at the fetch boundary so a preserving 307/308 cannot replay the signed body to another origin; hosts that want post-submit navigation should return a direct response and then choose a safe same-origin browser navigation in `onResponse` or `onNavigate`
- non-redirect HTML responses, including server-rendered validation/error pages, replace the current document through `document.open()` / `document.write()` / `document.close()` and update history to the response URL when needed, unless the response carries `Content-Security-Policy` or `Content-Security-Policy-Report-Only`
- CSP-protected HTML responses fail closed for fetched document replacement and explicit `navigationPolicy: "spa"` because fetch cannot install response CSP headers as the active document policy during `document.write()` replacement or SPA DOM mutation; use `navigationPolicy: "full-page"` or handle the response with `onNavigate` / `onResponse` when the host intentionally owns that boundary
- non-HTML non-OK responses throw to `onError`
- `onResponse` remains a full override for hosts that want to own response handling themselves

## Browser Hydration Loader

`@theory-cloud/facetheory/client` is the browser-safe subpath for reading the
exact hydration data that FaceTheory emitted for the current document. Use it
from client bootstrap code when a route may render either inline hydration
(`__FACETHEORY_DATA__`) or strict-CSP external hydration
(`<link rel="facetheory-hydration" ...>`), whether the URL is a static SSG
sidecar under `/_facetheory/data/*`, an SSR runtime sidecar under
`/_facetheory/ssr-data/*`, an ISR pointer-derived URL, or a caller-managed
same-origin data URL.

Core helpers:

- `loadFaceHydrationData({ document?, allowedOrigin?, baseUrl?, fetcher?, requestInit? })` returns inline hydration first when `__FACETHEORY_DATA__` is present; otherwise it fetches the external hydration URL and returns the parsed JSON payload. It returns `null` when the document has no FaceTheory hydration marker.
- `fetchExternalFaceHydrationData(dataUrl, options)` is the lower-level external sidecar fetcher used when the caller already has a data URL. It resolves relative URLs against the document/base URL, requires an `http:` or `https:` URL on the allowed origin, sends `Accept: application/json`, and parses the JSON response.
- `readFaceInlineHydrationData(document?)` and `readFaceExternalHydrationDataUrl(document?)` expose the marker readers for callers that need to inspect the document before choosing their own bootstrap path.
- `resolveSameOriginFaceHydrationUrl(dataUrl, options)` validates and resolves a hydration URL without fetching it.

Security behavior:

- Inline hydration wins when both inline and external markers exist, so the client starts from the data serialized into the HTML and does not fetch a second payload.
- External hydration is same-origin only. Cross-origin URLs, redirected cross-origin responses, malformed URLs, `data:` / `javascript:` / other non-http schemes, invalid fetch response objects, non-JSON responses, and invalid JSON all fail closed.
- The helpers throw sanitized errors and do not log or include hydration payload contents in error messages. Use synthetic values in tests and docs rather than production-like payloads.

Example client bootstrap:

```ts
import { loadFaceHydrationData } from "@theory-cloud/facetheory/client";

const hydration = await loadFaceHydrationData({
  allowedOrigin: window.location.origin,
});

if (hydration !== null) {
  hydrateApp(hydration);
}
```

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
