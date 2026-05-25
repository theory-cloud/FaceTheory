# FaceTheory Core Patterns

These patterns describe the supported integration choices that show up repeatedly across the runtime, the framework adapters, and the AWS deployment path.

## Pattern: Use AppTheory for Lambda Function URL streaming

Problem:
You need a supported production entrypoint that preserves streaming behavior, request normalization, and request-id propagation.

**CORRECT**

```ts
import {
  createApp,
  createLambdaFunctionURLStreamingHandler,
} from "@theory-cloud/apptheory";
import { createFaceApp } from "@theory-cloud/facetheory";
import { createAppTheoryFaceHandler } from "@theory-cloud/facetheory/apptheory";

const faceApp = createFaceApp({ faces });
const app = createApp();
const faceHandler = createAppTheoryFaceHandler({ app: faceApp });

app.get("/", faceHandler);
app.get("/{proxy+}", faceHandler);

export const handler = createLambdaFunctionURLStreamingHandler(app);
```

Why this is correct:

- Uses the documented adapter surface.
- Preserves `x-request-id` correlation across AppTheory and FaceTheory.
- Keeps cookie and `set-cookie` behavior aligned with the tested runtime path.

**INCORRECT**

```ts
export const handler = async () => ({
  statusCode: 200,
  headers: { "cache-control": "public, max-age=31536000, immutable" },
  body: "<html>...</html>",
});
```

Why this is incorrect:

- It bypasses FaceTheory and AppTheory request and response translation.
- It applies an immutable cache policy to request-dependent HTML.

## Pattern: Select route mode by freshness model

Problem:
You need to map each route to `ssr`, `ssg`, or `isr`.

**CORRECT**

```ts
import type { FaceModule } from "@theory-cloud/facetheory";

export const faces: FaceModule[] = [
  { route: "/", mode: "ssr", render: async () => ({ html: "<h1>Home</h1>" }) },
  {
    route: "/docs",
    mode: "ssg",
    render: async () => ({ html: "<h1>Docs</h1>" }),
  },
  {
    route: "/news/{id}",
    mode: "isr",
    revalidateSeconds: 60,
    render: async () => ({ html: "<h1>News</h1>" }),
  },
];
```

Why this is correct:

- `ssg` is reserved for build-time output.
- `generateStaticParams()` for SSG must resolve to normal path segments; dot-segments such as `.` and `..` are rejected rather than being written into the output tree.
- `isr` is only used where regeneration is explicit, bounded, and tenant-invariant or explicitly partitioned.
- `ssr` remains the fallback when freshness depends on request-time inputs.

**INCORRECT**

```ts
const app = createFaceApp({
  faces: [
    { route: "/blog/{id}", mode: "isr", render: async () => ({ html: "..." }) },
  ],
});
```

Why this is incorrect:

- It omits the coordinated HTML and metadata stores that blocking ISR expects in production.
- If the page renders tenant-specific HTML, it also omits the explicit `tenantKey` or custom `cacheKey` required to partition that cache. FaceTheory fails closed when known tenant boundary headers reach ISR without such a partition.

## Pattern: Use resource response helpers for raw routes

Problem:
You need a FaceTheory resource route to return JSON, text, an intentionally empty
response, or a `405 Method Not Allowed` without drifting into document rendering
or unsafe ad hoc serialization.

**CORRECT**

```ts
import {
  createFaceApp,
  jsonResourceResponse,
  methodNotAllowedResourceResponse,
  type FaceResourceRoute,
} from "@theory-cloud/facetheory";

const resources: FaceResourceRoute[] = [
  {
    route: "/_facetheory/ssr-data/{key+}",
    handle: (ctx) => {
      if (ctx.request.method !== "GET") {
        return methodNotAllowedResourceResponse(["GET"]);
      }

      return jsonResourceResponse({ key: ctx.params.key ?? "" });
    },
  },
];

const app = createFaceApp({ faces, resources });
```

Why this is correct:

- Resource routes are routing-adjacent raw responses, not a fourth-and-a-half
  render mode such as `mode: "json"`.
- `jsonResourceResponse()` mirrors FaceTheory's safe JSON escaping for
  HTML-significant characters, which keeps hydration-sidecar-adjacent payloads
  safe for web delivery.
- Helper-owned headers are lower-case, sorted, and deterministic. JSON/text
  helpers set content type, all helpers default `cache-control` to `no-store`,
  and `methodNotAllowedResourceResponse()` builds a sorted `allow` header from
  caller-supplied methods.

**INCORRECT**

```ts
handle: async () => ({
  status: 200,
  headers: { "Content-Type": ["application/json"] },
  cookies: [],
  body: new TextEncoder().encode(JSON.stringify({ html: "</script>" })),
  isBase64: false,
});
```

Why this is incorrect:

- Raw `JSON.stringify()` does not apply FaceTheory's HTML-significant escaping.
- Mixed-case handwritten headers can drift from the runtime's lower-case stable
  header style.
- Repeating the raw `FaceResponse` shape at every route makes method and cache
  behavior easy to forget or vary by handler.

## Pattern: Keep ISR storage prefixes intentional

Problem:
ISR HTML pointers and S3 object keys need predictable shapes.

**CORRECT**

```ts
import { S3HtmlStore, createFaceApp } from "@theory-cloud/facetheory";

const htmlStore = new S3HtmlStore({
  client,
  bucket: "example-bucket",
  keyPrefix: "isr-html",
});

const app = createFaceApp({
  faces,
  isr: {
    htmlStore,
    metaStore,
    htmlPointerPrefix: "pages",
  },
});
```

Why this is correct:

- The physical S3 prefix and logical pointer prefix are distinct.
- Generated keys stay understandable during verification and incident response.

**INCORRECT**

```ts
keyPrefix: "isr";
htmlPointerPrefix: "isr";
```

Why this is incorrect:

- It can produce duplicated key segments such as `isr/isr/...`.

## Pattern: Default React streaming to `all-ready`

Problem:
Streaming improves TTFB, but style extraction timing can change output completeness.

**CORRECT**

```ts
import { createReactStreamFace } from '@theory-cloud/facetheory/react';
import { createAntdEmotionTokenIntegration } from '@theory-cloud/facetheory/react/antd-emotion';
import { createAntdIntegration } from '@theory-cloud/facetheory/react/antd';
import { createEmotionIntegration } from '@theory-cloud/facetheory/react/emotion';

createReactStreamFace({
  route: '/',
  mode: 'ssr',
  render: async () => <App />,
  renderOptions: {
    styleStrategy: 'all-ready',
    integrations: [
      createAntdEmotionTokenIntegration(),
      createAntdIntegration({ hashed: false }),
      createEmotionIntegration(),
    ],
  },
});
```

Why this is correct:

- `all-ready` is the default and safest style extraction strategy.
- The AntD token bridge runs before `createAntdIntegration()`, which matches the adapter contract.
- Integrations can be declared once and reused because request-local mutable data should live in each integration's `createState()` hook rather than in module or closure state.

**INCORRECT**

```ts
createReactStreamFace({
  route: '/',
  mode: 'ssr',
  render: async () => <App />,
  renderOptions: {
    styleStrategy: 'shell',
  },
});
```

Why this can be incorrect:

- `shell` may emit before late styles from Suspense or async boundaries are available.
- FaceTheory drains late `all-ready` failures so shell mode does not leak unhandled readiness rejections, but it still intentionally trades away late-style capture.
- It is only appropriate when you have explicitly accepted that tradeoff.

## Pattern: Set document-shell attrs in the render contract

Problem:
The host needs root-level document semantics such as `lang`, `dir`, theme, or body classes without bypassing FaceTheory's HTML emitters.

**CORRECT**

```ts
{
  route: '/',
  mode: 'ssr',
  render: async () => ({
    lang: 'ar',
    htmlAttrs: { dir: 'rtl', 'data-theme': 'midnight' },
    bodyAttrs: { class: 'dashboard-shell' },
    html: '<div id="root">...</div>',
  }),
}
```

Why this is correct:

- It uses the public render contract instead of raw string surgery around `<html>` or `<body>`.
- The same attrs flow through buffered and streaming responses.
- Attr output stays escaped and deterministic.

**INCORRECT**

```ts
render: async () => ({
  html: '<html dir="rtl"><body class="dashboard-shell">...</body></html>',
});
```

Why this is incorrect:

- It bypasses FaceTheory's document shell and can produce nested or invalid HTML.
- It loses the shared escaping and merge rules that the runtime and tests enforce.

## Pattern: Emit custom head styles through structured tags, not raw head HTML

Problem:
You need to inject a CSS-variable block or another custom `<style>` tag into the document head without bypassing FaceTheory's head/style emitters.

**CORRECT**

```ts
import {
  stitchCssVarsToRootBlock,
  stitchToCssVars,
} from "@theory-cloud/facetheory/stitch-tokens";

const vars = stitchToCssVars(tokens);

render: async () => ({
  styleTags: [{ cssText: stitchCssVarsToRootBlock(vars) }],
  html: '<div id="root">...</div>',
});
```

Why this is correct:

- `stitchCssVarsToRootBlock()` returns CSS text with style terminators escaped, which matches `styleTags`.
- FaceTheory still owns the `<style>` tag emission path, nonce injection, and head ordering.
- The same contract works across buffered and streaming responses.

**INCORRECT**

```ts
render: async () => ({
  head: {
    html: `<style>${stitchCssVarsToRootBlock(vars)}</style>`,
  },
  html: '<div id="root">...</div>',
});
```

Why this is incorrect:

- `head.html` is escaped legacy head text rather than a tag-emission path.
- It bypasses FaceTheory's structured style-tag path and makes it easier to drift around escaping / nonce expectations.
- `FaceHeadTag` with `type: 'raw'` has the same caveat and should stay a deliberate last resort.

## Pattern: Host packaged Svelte component libraries through the client entry

Problem:
You need FaceTheory's Svelte adapter to SSR and hydrate components that come from an external Svelte package, while also delivering the package CSS and any Vite-discovered assets coherently.

**CORRECT**

```ts
// src/entry-client.ts
import "@theory-cloud/facetheory-svelte-library-example/styles.css";

// src/entry-server.ts
const { headTags } = viteAssetsForEntry(manifest, "src/entry-client.ts", {
  includeAssets: true,
});

return {
  headTags,
  hydration: viteHydrationForEntry(manifest, "src/entry-client.ts", data),
};
```

Why this is correct:

- The packaged library is imported like a normal dependency instead of being copied into the host app.
- Package CSS stays in the Vite client graph, so FaceTheory can emit deterministic stylesheet and asset tags from the manifest.
- The hydration bootstrap module matches the same client entry that pulled in the library code and CSS.

Reference example:

- `ts/examples/vite-ssr-svelte-library/`

**INCORRECT**

```ts
return {
  html: "<style>/* pasted library css */</style><div>...</div>",
};
```

Why this is incorrect:

- It bypasses the package asset graph and makes stylesheet delivery drift from the hydrated client bundle.
- It creates a second, undocumented integration path that tests will not cover.

## Pattern: Render strict no-inline CSP pages with external hydration

Problem:
You need a FaceTheory route to pass a CSP that forbids inline scripts, inline styles, and raw head HTML while still
hydrating the same data that was used for the server render.

**CORRECT**

```ts
import {
  buildStrictCspHeader,
  externalHydrationForEntry,
  viteAssetsForEntry,
} from "@theory-cloud/facetheory";

const strictCsp = {
  inlineScripts: false,
  inlineStyles: false,
  rawHead: false,
} as const;

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
    hydration: externalHydrationForEntry(
      manifest,
      "src/entry-client.ts",
      data,
      { dataUrl: "/_facetheory/data/example.json" },
    ),
  };
};
```

Why this is correct:

- The strict policy tells FaceTheory to validate both structured head output and the rendered body before returning HTML.
- Hydration data is fetched from a same-origin JSON sidecar instead of being embedded in `__FACETHEORY_DATA__`.
- Vite owns the client module and CSS/asset graph, so scripts and styles remain external and deterministic.
- The CSP header is attached explicitly by the Face; FaceTheory validates output, but it does not silently choose a
  response policy for the host.

Framework notes:

- React routes that set `inlineScripts:false` must not use shell streaming. Use `styleStrategy: "all-ready"` so
  FaceTheory can validate the whole document before bytes flush.
- React + Emotion/AntD inline style extraction is incompatible with `inlineStyles:false`; use external CSS for strict
  no-inline routes.
- Svelte strict routes should avoid `<svelte:head>` raw output and component `<style>` fallback output. Import CSS from
  the client entry and emit titles/meta/links through FaceTheory `headTags`.
- `startFaceNavigation()` loads the external hydration sidecar before applying a same-origin navigation snapshot and
  calling `hydrateFaceNavigation(context)`.

Reference example:

- `ts/examples/vite-strict-csp-svelte/`

**INCORRECT**

```ts
return {
  csp: { inlineScripts: false, inlineStyles: false, rawHead: false },
  headTags: [{ type: "raw", html: "<script>window.boot()</script>" }],
  hydration: viteHydrationForEntry(manifest, "src/entry-client.ts", data),
  html: '<main style="display:none">...</main>',
};
```

Why this is incorrect:

- `viteHydrationForEntry()` emits legacy inline hydration JSON; strict no-inline routes need `FaceExternalHydration`.
- Raw head HTML, inline event handlers, inline style attributes, inline style tags, and inline scripts all fail closed
  under the strict policy.
- Warning-only documentation is not enough: strict routes should let FaceTheory fail before returning invalid HTML.

## Pattern: Mark same-origin mutating forms for OAC transport

Problem:
Your FaceTheory page is delivered behind an AppTheorySsrSite CloudFront distribution with Lambda Function URL OAC enabled, and a browser form needs to submit a same-origin mutation route.

**CORRECT**

```html
<form action="/agents/new" method="post" data-facetheory-oac-form>
  <input name="agentName" required />
  <button name="intent" value="create">Create agent</button>
</form>
```

```ts
import { startAwsOacFormTransport } from "@theory-cloud/facetheory";

startAwsOacFormTransport();
```

Why this is correct:

- The form opts in explicitly with `data-facetheory-oac-form`; unmarked forms keep native browser behavior.
- The helper is marker-scoped, not CloudFront path-scoped. It does not monkeypatch `fetch`, and it does not inspect
  your distribution behaviors to infer which same-origin paths route to the OAC-protected SSR origin.
- FaceTheory proceeds only when the resolved form encoding is `application/x-www-form-urlencoded`, computes the SHA256 hash over the exact URL-encoded bytes it sends, and sets `x-amz-content-sha256` for CloudFront's Lambda URL OAC signing path.
- The action must stay same-origin, and FaceTheory forces `redirect: "error"` on the mutating fetch so a 307/308 open redirect cannot replay the signed form body to another origin.
- Cookies and same-origin credentials remain on the CloudFront/AppTheory path, while AppTheory's `AWS_IAM` Lambda URL hardening stays intact.
- Same-origin HTML validation/error responses may replace the whole document instead of inventing a partial DOM patching contract, but fetched document replacement and explicit SPA DOM navigation fail closed when the response carries a `Content-Security-Policy` header because fetch cannot install response CSP headers into the active document policy. Use `navigationPolicy: "full-page"`, `onNavigate`, or `onResponse` for CSP-protected HTML responses and for intentional post-submit redirects to safe GET URLs.

Mixed-origin note:

- If the same CloudFront distribution also serves bearer-auth or otherwise non-OAC Lambda Function URL origins such as
  `/api/*`, `/auth/*`, `/.well-known/*`, or `/attestations/*`, do not mark those forms with
  `data-facetheory-oac-form`. Unmarked forms and ordinary same-origin API `fetch()` calls stay untouched, but any
  marked same-origin mutating form is treated as an OAC form regardless of path. Add a host-side CI check when marker
  hygiene is security-relevant.

**INCORRECT**

```html
<form
  action="https://abc123.lambda-url.us-east-1.on.aws/agents/new"
  method="post"
>
  <input name="agentName" />
</form>
```

Why this is incorrect:

- It bypasses the CloudFront distribution and AppTheorySsrSite origin contract.
- Native browser form POSTs cannot add the `x-amz-content-sha256` header required by Lambda Function URL OAC for mutating payloads.
- It invites a second unauthenticated or differently authenticated mutation path, which breaks the single AWS-first delivery route.

Encoding note:

- `startAwsOacFormTransport()` is intentionally URL-encoded. Submitter `formenctype` overrides form `enctype`, matching browser form resolution. Marked forms that resolve to `multipart/form-data`, `text/plain`, or another unsupported encoding are not silently transformed and do not fall back to native POST; they fail closed through `onError` until a separate, explicitly scoped transport exists.
- Marked forms do not follow HTTP redirects in the fetch transport. Return a direct response for the mutation result, or handle the response with `onResponse` / `onNavigate` and explicitly choose a safe same-origin browser navigation after the mutating request completes. Redirected or replacement response URLs that are malformed or resolve outside the configured same-origin boundary fail closed before FaceTheory mutates the document or assigns `window.location`.

## Pattern: Use `startFaceNavigation()` with a stable view container

Problem:
You want SPA-style navigation between FaceTheory routes without a full browser refresh, while keeping document attrs, head tags, and hydration data aligned with the server-rendered output.

**CORRECT**

```ts
import { startFaceNavigation } from "@theory-cloud/facetheory";

export async function hydrateFaceNavigation({ data, view }) {
  renderIntoExistingClientRoot(view, data);
}

startFaceNavigation({
  viewSelector: "[data-facetheory-view]",
});
```

Why this is correct:

- FaceTheory fetches the next route as HTML and reuses the existing server contract instead of inventing a second route payload format.
- `lang`, `htmlAttrs`, `bodyAttrs`, and non-executable head tags stay synchronized with the rendered document.
- Exporting `hydrateFaceNavigation(...)` lets the client module update an existing app root instead of forcing a hard reload.
- Same-origin boundaries stay intact: redirected cross-origin responses, remote bootstrap modules, and cross-origin programmatic navigations fail closed before the current document is mutated.

Compatibility note:

- If the bootstrap module does not export `hydrateFaceNavigation(...)`, FaceTheory can still reload that module as a fallback so existing side-effect-based entrypoints continue to work, but that fallback will not preserve long-lived client state.

**INCORRECT**

```ts
document.addEventListener("click", async (event) => {
  // fetch('/next') and manually patch random DOM nodes
});
```

Why this is incorrect:

- It bypasses the tested FaceTheory navigation helpers and leaves head tags, hydration payloads, and document attrs unsynchronized.
- It creates an ad hoc client router contract that other hosts and adapters cannot share.

## Pattern: Keep Stitch contracts shared and adapter imports matched

Problem:
You need dense control-plane UI across React, Vue, and Svelte without letting one framework invent a different tab/filter/log/status surface.

**CORRECT**

```ts
import type {
  FilterChipConfig,
  LogEntry,
  StatusVariant,
  TabItem,
} from "@theory-cloud/facetheory/stitch-admin";
import { Callout } from "@theory-cloud/facetheory/vue/stitch-shell";
import {
  CopyableCode,
  FilterChipGroup,
  InlineKeyValueList,
  LogStream,
  Tabs,
} from "@theory-cloud/facetheory/vue/stitch-admin";

const tabs: TabItem[] = [{ key: "catalog", label: "Catalog", count: 12 }];
const filters: FilterChipConfig[] = [
  { key: "status", label: "status: active" },
];
const logs: LogEntry[] = [
  {
    id: "1",
    timestamp: "09:42:12",
    level: "info",
    message: "Created demo-sandbox-01",
  },
];
const status: StatusVariant = "allow";
```

Why this is correct:

- Shared data contracts and semantic variants come from the framework-neutral `stitch-admin` and `stitch-shell` subpaths.
- Visual primitives come from the matching framework adapter path.
- The same conceptual primitives now exist across React, Vue, and Svelte, so porting a control-plane screen does not require redesigning the UI contract.
- For shells and page frames, `path` remains the source of truth for SSR-safe anchor navigation, while `onNavigate` is only an optional interception layer for hydrated routers.

**INCORRECT**

```ts
import { Tabs, LogStream } from "@theory-cloud/facetheory/react/stitch-admin";

type StatusVariant = "active" | "paused" | "mystery";
```

Why this is incorrect:

- Pulling React primitives into a Vue or Svelte host bypasses the adapter contract and breaks cross-framework parity.
- Re-declaring local tab/filter/log/status variants lets one application drift away from the shared Stitch surface.
- Ad hoc contracts make it harder to keep docs, tests, and framework adapters aligned in future changes.

## Pattern: Build operator dashboards from caller-supplied state

Problem:
You need an operator visibility dashboard that shows guarded access, non-authoritative evidence, health rows, and entity × dimension visibility without embedding auth-provider or product-specific rules in FaceTheory.

**CORRECT**

```tsx
import type { FaceContext } from "@theory-cloud/facetheory";
import { createReactFace } from "@theory-cloud/facetheory/react";
import type {
  OperatorGuardStatus,
  OperatorHealthRow,
  VisibilityMatrixDimension,
  VisibilityMatrixRow,
} from "@theory-cloud/facetheory/stitch-admin";
import {
  GuardedOperatorShell,
  HealthStatusPanel,
  VisibilityMatrix,
} from "@theory-cloud/facetheory/react/stitch-admin";

interface OperatorDashboardData {
  guard: OperatorGuardStatus;
  healthRows: OperatorHealthRow[];
  visibilityDimensions: VisibilityMatrixDimension[];
  visibilityRows: VisibilityMatrixRow[];
  freshnessLabel: string;
}

async function loadDashboard(ctx: FaceContext): Promise<OperatorDashboardData> {
  const guard = await deriveGuardInHostRuntime(ctx); // AppTheory / Autheory-owned boundary
  const snapshot = await loadVisibilitySnapshot(ctx, guard); // host-owned data source

  return {
    guard,
    healthRows: snapshot.healthRows,
    visibilityDimensions: snapshot.visibilityDimensions,
    visibilityRows: snapshot.visibilityRows,
    freshnessLabel: snapshot.freshnessLabel,
  };
}

export const face = createReactFace<OperatorDashboardData>({
  route: "/operators/visibility",
  mode: "ssr",
  load: loadDashboard,
  render: (_ctx, data) => (
    <GuardedOperatorShell guard={data.guard}>
      <HealthStatusPanel rows={data.healthRows} />
      <VisibilityMatrix
        rows={data.visibilityRows}
        dimensions={data.visibilityDimensions}
      />
    </GuardedOperatorShell>
  ),
});
```

Why this is correct:

- AppTheory or Autheory-derived authorization is resolved before FaceTheory renders; FaceTheory receives `OperatorGuardStatus` as data and does not embed the auth provider.
- Health, staleness, confidence, provenance, correlation, and visibility cells are loaded once and serialized as stable render data.
- SSR is used because the HTML can vary by request identity, role, tenant, and visibility source.
- The same shared contracts can feed Vue or Svelte by switching only the adapter import path.

**INCORRECT**

```tsx
export const face = createReactFace({
  route: "/operators/visibility",
  mode: "ssg",
  render: async () => (
    <GuardedOperatorShell guard={readBrowserSession()}>
      <p>{Math.round((Date.now() - lastChecked) / 1000)} seconds old</p>
      <p>Placeholder partner release 1.2.3</p>
    </GuardedOperatorShell>
  ),
});
```

Why this is incorrect:

- A live auth-varying dashboard is being rendered as SSG output.
- Authorization and freshness are read during render from ambient browser/time state, which can drift from the server-rendered HTML.
- Production-like mock partner, tenant, release, or version values make empty states look like real operational data.

ISR note:

- Use ISR for operator visibility only when the rendered HTML is non-personalized or fully partitioned. If the output varies by identity, role, tenant, cookie, locale, environment, or data-source variant, include those dimensions in explicit `cacheKey` and `tenantKey` functions or keep the route on SSR.
- Tenant-invariant ISR routes should not receive tenant-like headers such as `x-tenant-id` or `x-facetheory-tenant`; those headers trigger FaceTheory's fail-closed partition guard unless `tenantKey` or a custom `cacheKey` is configured.

## Pattern Selection Notes

- Prefer published package exports over private source imports.
- Keep AppTheory and TableTheory pinned to the documented GitHub release tarballs.
- If behavior is not explicit in source or tests, leave it out of the ingestible docs until the contract is confirmed.
