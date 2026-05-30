---
title: Getting Started
---

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
export FACETHEORY_VERSION=3.4.3 # x-release-please-version
npm install --save-exact \
  "https://github.com/theory-cloud/FaceTheory/releases/download/v${FACETHEORY_VERSION}/theory-cloud-facetheory-${FACETHEORY_VERSION}.tgz"
```

### Step 2: Install the peers that match your adapter surface

- React: `npm install react react-dom`
- React + AntD/Emotion: `npm install antd @emotion/react @emotion/cache @emotion/server`
- Vue: `npm install vue @vue/server-renderer`
- Svelte: `npm install svelte@^5.55.7`

### Step 3: Install optional companion packages

These are only required if your application uses the corresponding integration surface:

```bash
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v1.12.0/theory-cloud-apptheory-1.12.0.tgz

npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v1.9.0/theory-cloud-tabletheory-ts-1.9.0.tgz
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

## Add A Raw Resource Route

Resource routes live beside Faces when the app needs a raw response such as
JSON, text, an empty response, or a method guard. They do not declare a render
mode and FaceTheory does not wrap their body in an HTML document.

```ts
import {
  createFaceApp,
  jsonResourceResponse,
  methodNotAllowedResourceResponse,
  type FaceResourceRoute,
} from "@theory-cloud/facetheory";

const resources: FaceResourceRoute[] = [
  {
    route: "/api/status",
    handle: (ctx) => {
      if (ctx.request.method !== "GET") {
        return methodNotAllowedResourceResponse(["GET"]);
      }

      return jsonResourceResponse({ ok: true });
    },
  },
];

const app = createFaceApp({ faces, resources });
```

Use `jsonResourceResponse()`, `textResourceResponse()`,
`emptyResourceResponse()`, and `methodNotAllowedResourceResponse()` instead of
hand-rolling common raw responses. The helpers emit deterministic lower-case
headers, default to `cache-control: no-store`, and keep JSON escaping aligned
with FaceTheory's HTML-safe serializer. Avoid registering caller resource
routes under framework-owned prefixes such as `/_facetheory/ssr-data/*`; that
namespace is reserved when SSR hydration sidecars are enabled.

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

## Add Strict No-Inline CSP Hydration

Use this path when a route must run without inline scripts, inline styles, or raw head HTML. The server render still owns
the first paint, but hydration data moves to a same-origin JSON sidecar instead of the legacy inline
`__FACETHEORY_DATA__` script.

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
  ssrHydrationSidecars: {
    // Local example store; use a durable HtmlStore for a real deployment.
    htmlStore: new InMemoryHtmlStore(),
    signingSecret: process.env.FACETHEORY_SSR_HYDRATION_SECRET!,
  },
  faces,
});

renderOptions: async (_ctx, data) => {
  const { headTags } = viteAssetsForEntry(manifest, "src/entry-client.ts", {
    includeAssets: true,
  });

  return {
    csp: strictCsp,
    headers: {
      "content-security-policy": buildStrictCspHeader(),
    },
    headTags,
    hydration: viteHydrationForEntry(manifest, "src/entry-client.ts", data),
  };
};
```

When `ssrHydrationSidecars` is configured, strict SSR writes the render-time
hydration payload once and emits a framework-owned `/_facetheory/ssr-data/...`
URL. Route that prefix to the same FaceTheory app handler; do not add a
caller-owned `/_facetheory/data/*` pre-router for SSR. Client bootstrap modules
should call `loadFaceHydrationData()` from `@theory-cloud/facetheory/client`
before hydrating; the loader reads the `<link rel="facetheory-hydration">`
URL, expects raw JSON from the no-store framework route, and rejects
cross-origin data URLs or redirects. The repository example at
`ts/examples/vite-strict-csp-svelte/` demonstrates the full Svelte/Vite shape:
external CSS/assets, same-origin module bootstrap, framework-owned SSR
hydration sidecar JSON, no `<svelte:head>` raw output, and SPA navigation that
loads external data before `hydrateFaceNavigation(context)`.

```ts
import { loadFaceHydrationData } from "@theory-cloud/facetheory/client";

const hydrationData = await loadFaceHydrationData({
  allowedOrigin: window.location.origin,
});
```

Caller-managed external hydration is still available when the application owns
the JSON URL: return `externalHydrationForEntry(..., { dataUrl })` and serve the
exact render payload from that same-origin URL. Keep the mode-specific prefixes
distinct: SSG build output writes static sidecars under `/_facetheory/data/*`
for S3/CloudFront delivery, while SSR runtime sidecars use
`/_facetheory/ssr-data/*` on the Lambda/FaceApp handler. ISR keeps strict
hydration data paired with the cached HTML through the ISR runtime rather than
using the SSR sidecar prefix.

Svelte strict no-inline support is first-class through `@theory-cloud/facetheory/svelte` when the route uses external
hydration data. Keep Svelte component CSS in the Vite client entry instead of relying on inline SSR style fallback
output, and use FaceTheory structured `headTags` instead of `<svelte:head>` raw SSR head output on strict routes.

Validation:

```bash
cd ts
npm run example:vite:svelte:strict-csp:build
node --import tsx test/unit/vite-strict-csp-svelte-example.test.ts
```

If a route still needs FaceTheory-owned inline scripts or styles, use the nonce-compatible CSP path for per-request SSR
HTML only: pass `FaceRequest.cspNonce`, include the matching nonce in your CSP header, and do not cache that HTML as
SSG/ISR unless the header and cached nonce stay identical for every request.

## Add An OAC-Safe Mutating SSR Form

When a FaceTheory app is deployed through `AppTheorySsrSite` with Lambda Function URL OAC and `AWS_IAM`, native browser
form POSTs cannot attach the `x-amz-content-sha256` header that CloudFront signs for mutating Lambda URL payloads. Keep
the form action same-origin and opt the form into FaceTheory's URL-encoded OAC transport instead of posting directly to
the Lambda Function URL.

Server-render the form and the action route through the same SSR Face:

```ts
import {
  createFaceApp,
  escapeHTML,
  type FaceModule,
} from "@theory-cloud/facetheory";

const oacBootstrapModule = "/assets/oac-form-bootstrap.js";

function formDocument(message = "") {
  const alert = message
    ? `<p role="alert">${escapeHTML(message)}</p>`
    : "";

  return `
    <main>
      <h1>Create control-plane item</h1>
      ${alert}
      <form action="/control/items/new" method="post" data-facetheory-oac-form>
        <label>
          Name
          <input name="name" required />
        </label>
        <button name="intent" value="create">Create</button>
      </form>
    </main>
  `;
}

const faces: FaceModule[] = [
  {
    route: "/control/items/new",
    mode: "ssr",
    render: async ({ request }) => {
      if (request.method === "POST") {
        const fields = new URLSearchParams(
          new TextDecoder().decode(request.body),
        );
        const name = fields.get("name")?.trim() ?? "";

        if (!name) {
          return {
            status: 400,
            html: formDocument("Name is required."),
            hydration: { bootstrapModule: oacBootstrapModule, data: null },
          };
        }

        // Persist through application-owned auth, CSRF, idempotency, and
        // business validation here. The OAC payload hash is AWS signing
        // plumbing only; it is not application authentication.
        return {
          html: `
            <main>
              <h1>Created</h1>
              <p>${escapeHTML(name)} was accepted.</p>
              <a href="/control/items">Back to items</a>
            </main>
          `,
          hydration: { bootstrapModule: oacBootstrapModule, data: null },
        };
      }

      return {
        html: formDocument(),
        hydration: { bootstrapModule: oacBootstrapModule, data: null },
      };
    },
  },
];

export const app = createFaceApp({ faces });
```

Install the browser helper from the bootstrap module emitted with that Face:

```ts
import { startAwsOacFormTransport } from "@theory-cloud/facetheory";

startAwsOacFormTransport();
```

Route both `GET` and `POST` for the same-origin action path to Lambda/AppTheory, not to S3 or a direct Lambda Function
URL:

```ts
import { createAppTheoryFaceHandler } from "@theory-cloud/facetheory/apptheory";

const actionFace = createAppTheoryFaceHandler({ app });

runtime.get("/control/items/new", actionFace);
runtime.post("/control/items/new", actionFace);
```

The helper sends the exact URL-encoded bytes that it hashes, sets `x-amz-content-sha256`, and includes same-origin
credentials. Marked forms that resolve to `multipart/form-data`, `text/plain`, or another unsupported encoding fail
closed before a request is sent; file uploads need a separately scoped transport. If the HTML response carries a
`Content-Security-Policy` header, use `navigationPolicy: "full-page"` or handle the result explicitly through
`onResponse` / `onNavigate` because fetched CSP headers cannot become the active document policy during document-write
replacement or explicit SPA DOM navigation.

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
- **Render mode follows request variance.** Use SSR for request-authorized operator pages and a deterministic SPA shell when client refreshes happen after the initial render. Do not use SSG for live authorized visibility data. Use ISR only for non-personalized or safely partitioned snapshots where `cacheKey` and `tenantKey` include every authorization, tenant, role, locale, and visibility variant that can change the HTML. ISR fails closed when known tenant boundary headers are present without an explicit cache partition.
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

  If you need to serialize those vars into SSR `<style>` output, use `stitchCssVarsToRootBlock(vars)` as the `cssText` for a `styleTags` entry (or a `headTags` item with `type: "style"`). Do **not** wrap the returned string in `<style>...</style>` and pass it through `head.html`; `head.html` is escaped legacy head text, not the normal style-delivery path.

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

- FaceTheory’s default ISR cache key partitions by route params, query string, and hashed request-identity inputs for cookies and common auth headers without storing raw secrets.
- FaceTheory’s default ISR tenant is `default`; configure `tenantKey` explicitly for authenticated tenant boundaries.
- If a request carries `x-tenant-id` or `x-facetheory-tenant` and no explicit `tenantKey` or custom `cacheKey` is configured, ISR fails closed before cache lookup/write.
- If cached HTML varies by other headers or host-derived tenant, configure an explicit `cacheKey` / `tenantKey` or keep that route on SSR.

## Reference Bundle

The `v3.4.3` GitHub release includes the matching `facetheory-reference-${FACETHEORY_VERSION}.tar.gz` bundle. It contains: <!-- x-release-please-version -->

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
