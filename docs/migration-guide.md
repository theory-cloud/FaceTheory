---
title: Migration Guide
---

# FaceTheory Migration Guide

This guide focuses on the supported migration paths into the current FaceTheory runtime contract and deployment model.

## When To Use This Guide

Use this guide when you are:

- replacing an ad hoc SSR handler with FaceTheory entrypoints
- introducing SSG or ISR into an SSR-only FaceTheory app
- updating AppTheory or TableTheory dependency pins

## Versioned Migration Index

Use this index to find the migration path by release line. Release Please updates version markers automatically; do not hand-edit `x-release-please-version` comments when adding migration notes.

| From                                    | To          | Migration path                                                                            | Notes                                                                                                                              |
| --------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| App-local SSR glue                      | Current 3.x | [Migration 1](#migration-1-ad-hoc-handler-to-canonical-aws-entrypoint)                    | Move request translation into `createFaceApp()` and the Lambda/AppTheory entrypoints.                                              |
| SSR-only FaceTheory apps                | Current 3.x | [Migration 2](#migration-2-ssr-only-routes-to-mixed-ssr-ssg-and-isr)                      | Reclassify routes into the three server `FaceMode` values before adding SPA navigation.                                            |
| ISR routes without tenant partitioning  | Current 3.x | [Migration 4](#migration-4-adopt-isr-tenant-fail-closed-defaults)                         | Tenant-varying cached HTML needs an explicit trusted `tenantKey` or `cacheKey`; otherwise use SSR.                                 |
| Inline hydration / raw head workarounds | Current 3.x | [Migration 7](#migration-7-move-legacy-inline-hydration-to-strict-csp-hydration-sidecars) | Strict no-inline routes move data, styles, and bootstraps to same-origin sidecars/assets.                                          |
| Svelte 4 adapter consumers              | v4.0.0      | [Migration 8](#migration-8-svelte-4-to-svelte-5-v400)                                     | v4.0.0 requires Svelte `>=5.55.7`; Svelte 4 support is dropped and Stitch primitives are authored with runes.                      |
| Deprecated 3.x public surface            | v4.0.0      | [Migration 9](#migration-9-v4-public-surface-curation)                                    | The root barrel is curated; `Headers` and `head.html` are removed; optional surfaces move to subpaths.                              |
| Invalid 3.x Face contracts              | v4.0.0      | [Migration 10](#migration-10-v4-face-contract-construction-errors)                        | ISR Faces must set `revalidateSeconds` and parameterized SSG Faces must set `generateStaticParams()` before `createFaceApp()`.      |

## Scope Guardrails

- Keep migration steps user-facing and task-oriented.
- Prefer published package exports and documented deployment conventions.
- Do not claim support for an unpinned AppTheory or TableTheory combination.
- Use the current package exports, examples, and deployment docs as the migration baseline for this repository.

## Migration 1: Ad Hoc Handler To Canonical AWS Entrypoint

Use this path when the current app still owns request translation or response shaping outside the FaceTheory runtime. It replaces custom handler glue with the documented FaceTheory entrypoints.

1. Inventory the current handler surface.
2. Move request routing into `createFaceApp({ faces })`.
3. Expose the app through one of the supported entrypoints:
   - `createLambdaUrlStreamingHandler({ app })`, or
   - AppTheory `createLambdaFunctionURLStreamingHandler(app)` plus `createAppTheoryFaceHandler({ app })`
4. Re-run local verification.

Validation:

```bash
cd ts
npm run typecheck
npm test
npm run example:streaming:serve
```

## Migration 2: SSR-Only Routes To Mixed SSR, SSG, And ISR

Use this migration when route freshness requirements have diverged and a single SSR-only mode is no longer the right fit. It helps reclassify routes before you change any deployment wiring.

1. Review each route and assign the correct `FaceMode`.
2. For build-time routes, switch to `mode: 'ssg'`.
3. For cacheable pages that need periodic regeneration, switch to `mode: 'isr'` and set `revalidateSeconds`.
4. Keep `mode: 'ssr'` for request-time or personalized pages.
5. For dynamic SSG routes, add `generateStaticParams()`.

Validation:

```bash
cd ts
npm run example:ssg:build
npm run example:ssg:serve
```

## Migration 3: Introduce Production ISR Safely

Use this path only after you are ready to provision and verify the storage and lease coordination that blocking ISR depends on. It treats ISR as an infrastructure-backed runtime mode, not a flag flip.

1. Provision HTML storage through `S3HtmlStore`.
2. Provision metadata and lease storage through `createTableTheoryIsrMetaStore({ config })` or another `IsrMetaStore`.
3. Configure `htmlPointerPrefix` intentionally.
4. Confirm cache headers and `x-facetheory-isr` states on a known route.

Validation:

```bash
curl -I https://<cloudfront-domain>/isr-demo
```

Expected:

- `x-facetheory-isr: miss|hit|wait-hit|stale`

## Migration 4: Adopt ISR Tenant Fail-Closed Defaults

Use this path when upgrading an app that already has ISR routes and request traffic may carry tenant boundary
headers such as `x-tenant-id` or `x-facetheory-tenant`. FaceTheory now fails closed before ISR metadata lookup or
HTML writes when those headers reach an ISR route without an explicit `isr.tenantKey` or custom `isr.cacheKey`.
This prevents tenant-varying HTML from silently sharing the default ISR cache partition.

1. Classify every ISR route:
   - **Tenant-invariant** routes do not read tenant headers, auth headers, cookies, or other request-varying tenant
     state while rendering cached HTML.
   - **Tenant-varying** routes render different HTML for different tenants or request-scoped identities.
2. For tenant-invariant ISR, strip viewer-supplied tenant-like headers at the CloudFront/AppTheory boundary before
   the request reaches FaceTheory.
3. For tenant-varying pages that are personalized or permission-sensitive, prefer `mode: 'ssr'` unless the rendered
   HTML is safe to cache independently per tenant.
4. For tenant-varying ISR that is safe to cache, configure an explicit partition:
   - use `tenantKey: tenantKeyFromTrustedHeader('x-tenant-id')` only after CloudFront/AppTheory has stripped
     viewer-supplied values and injected trusted tenant context, or
   - provide a custom `cacheKey` that includes every request-varying dimension that affects the HTML.
5. Do not trust tenant identity from a raw viewer header. Treat tenant headers as deployment-internal context after
   the trusted boundary has normalized them.

Validation:

```bash
# tenant-invariant route: no tenant headers reach FaceTheory
curl -I https://<cloudfront-domain>/isr-demo

# explicit trusted partition: tenant A and tenant B must not share the same cached HTML
curl -I -H 'x-tenant-id: tenant-a' https://<cloudfront-domain>/tenant-isr-demo
curl -I -H 'x-tenant-id: tenant-b' https://<cloudfront-domain>/tenant-isr-demo
```

Expected:

- tenant-invariant ISR returns `x-facetheory-isr: miss` and then `hit` or `wait-hit` on repeat requests
- unpartitioned ISR with tenant boundary headers returns a deterministic server error and does not write ISR metadata
  or HTML cache entries
- explicitly partitioned ISR keeps tenants separated and still reports normal `x-facetheory-isr` transitions

Rollback:

- switch affected tenant-varying routes back to `mode: 'ssr'`, or
- strip tenant-like headers for routes proven to be tenant-invariant before they reach FaceTheory.

## Migration 5: Align Upstream Dependency Pins

Use this cleanup when dependency installation drift is the main risk and runtime wiring is otherwise already in the supported shape. It restores the exact AppTheory and TableTheory combinations validated by this repo.

1. Replace floating installs with exact GitHub release tarballs.
2. Keep `ts/package.json` pins and overrides synchronized.
3. Update docs when pins change.

Validation:

```bash
cd ts
npm ci
npm run typecheck
npm test
```

## Migration 6: Replace App-Local OAC Form Workarounds

Use this path when an SSR control-plane page behind AppTheorySsrSite Lambda Function URL OAC has an app-local fetch
shim, disabled form, direct Lambda Function URL action, or temporary Function URL auth rollback because native browser
forms could not provide `x-amz-content-sha256`.

1. Keep the public form action on the same-origin CloudFront URL.
2. Route the mutating action path to Lambda/AppTheory with `ssrPathPatterns` when the deployment has an S3 or SSG/ISR
   origin path that could otherwise intercept the request.
3. Mark only supported URL-encoded forms with `data-facetheory-oac-form`.
4. Install `startAwsOacFormTransport()` from the Face's client bootstrap module.
5. Remove any direct Function URL form action or app-local transport workaround after the FaceTheory helper is verified.
6. Keep authentication, authorization, CSRF, idempotency, and business validation in the application layer; the
   `x-amz-content-sha256` value is only AWS signing plumbing.
7. Leave browser-generated multipart uploads out of this migration unless a separately scoped transport constructs and
   hashes the exact multipart bytes.

Validation:

```bash
cd ts
npx tsx test/unit/oac-form.test.ts
```

Deployed verification:

```bash
curl -I https://<cloudfront-domain>/control/items/new
```

Then submit the marked form in a browser through the CloudFront URL and confirm:

- the request reaches the AppTheory/FaceTheory Lambda instead of failing with `InvalidSignatureException`
- the request includes `x-amz-content-sha256` and `content-type: application/x-www-form-urlencoded;charset=UTF-8`
- unsupported marked encodings fail closed before sending
- Lambda Function URL auth remains `AWS_IAM` behind CloudFront OAC

Rollback:

- remove the `data-facetheory-oac-form` marker or the bootstrap call to return to native browser behavior while the app
  remains pinned to the previous known-good FaceTheory release tarball, or
- temporarily disable the affected mutating form in the consuming app.

Do not make `ssrUrlAuthType: NONE` a durable rollback. If an operator explicitly authorizes it to recover a broken
deployment, record an owner, expiration date, and restoration plan back to `AWS_IAM` + OAC.

## Migration 7: Move Legacy Inline Hydration To Strict CSP Hydration Sidecars

Use this path when a route currently relies on inline `__FACETHEORY_DATA__`, inline style output, or raw head HTML and
now needs to satisfy a strict no-inline CSP.

1. Classify the route's policy:
   - **Nonce-compatible SSR** can keep FaceTheory-owned inline hydration/styles only when each request receives a
     unique `FaceRequest.cspNonce` and the response CSP header carries the matching nonce.
   - **Strict no-inline** must set `csp: { inlineScripts: false, inlineStyles: false, rawHead: false }` and move scripts,
     CSS, and hydration data to same-origin external resources.
2. Pick the sidecar owner by delivery mode:
   - **SSR framework-owned sidecars**: keep `viteHydrationForEntry(manifest, entry, data)` in the Face and configure
     `createFaceApp({ ssrHydrationSidecars: { htmlStore, signingSecret } })`. FaceTheory stores the exact render-time
     payload once, emits a `/_facetheory/ssr-data/...` URL, and serves it through the same FaceApp handler without
     re-running `load()` or `render()`.
   - **Caller-managed external sidecars**: replace the inline hydration with
     `externalHydrationForEntry(manifest, entry, data, { dataUrl })` only when the application owns that same-origin
     JSON route or object and can serve the exact payload used for the HTML render.
   - **SSG sidecars**: let the SSG build write static strict hydration JSON under `/_facetheory/data/*` and route that
     prefix to S3 beside the generated HTML.
   - **ISR sidecars**: rely on the ISR runtime to pair strict hydration data with the cached HTML and metadata. Do not
     route ISR hydration through the SSR `/_facetheory/ssr-data/*` prefix.
3. Route the sidecar URL from the same origin as the page:
   - `/_facetheory/data/*` is the static SSG sidecar namespace and should route to S3/CloudFront static delivery.
   - `/_facetheory/ssr-data/*` is the framework-owned SSR runtime sidecar namespace and must route to the same
     Lambda/FaceApp handler as the SSR HTML.
   - Caller-managed URLs should use a distinct application-owned prefix and must not recompute request-dependent
     hydration on a later sidecar request.
4. Move CSS into the Vite client entry and emit assets with `viteAssetsForEntry(...)` instead of inline `<style>` tags.
5. Replace raw head HTML and framework-specific head shortcuts with FaceTheory structured `headTags`.
6. For Svelte strict pages, avoid `<svelte:head>` raw SSR output and component `<style>` fallback output; use external
   CSS imported by the client entry.
7. For React streaming strict pages, use `styleStrategy: "all-ready"` and avoid Emotion/AntD inline style extraction on
   routes with `inlineStyles:false`.
8. In the client bootstrap, import `loadFaceHydrationData()` from `@theory-cloud/facetheory/client` and call it before
   hydrating. If the route uses SPA-style navigation, export `hydrateFaceNavigation(context)` and confirm
   `startFaceNavigation()` loads external hydration data before it mutates the current document.

Validation:

```bash
cd ts
npm run example:vite:svelte:strict-csp:build
node --import tsx test/unit/strict-csp-harness.test.ts
node --import tsx test/unit/vite-strict-csp-svelte-example.test.ts
```

Deployed verification:

- request the HTML document and confirm the CSP header is attached explicitly
- confirm the HTML contains `<link rel="facetheory-hydration" ...>` rather than `__FACETHEORY_DATA__`
- fetch the referenced hydration sidecar through the same CloudFront origin and confirm it is same-origin JSON:
  `/_facetheory/data/*` should reach S3 for SSG output, and `/_facetheory/ssr-data/*` should reach the same
  Lambda/FaceApp handler for SSR runtime sidecars
- confirm external module, CSS, and asset URLs are routed through the documented S3/Lambda behavior split
- run a browser hydration smoke and check for hydration warnings or strict-CSP console errors

Rollback:

- keep the previous FaceTheory release tarball available until strict-CSP output is verified in the consuming app
- if a route cannot yet remove inline styles or inline hydration, leave it on the nonce-compatible SSR path and do not
  claim it is strict no-inline
- do not weaken the deployment CSP or publish a strict-CSP release claim without matching runtime, RC, and deployment
  evidence

## Migration 8: Svelte 4 To Svelte 5 (v4.0.0)

Use this path when upgrading a Svelte consumer from a FaceTheory 3.x line to v4.0.0. **v4.0.0 is a breaking release for the Svelte adapter: it requires Svelte `>=5.55.7` and drops Svelte 4 support.** The peer range moved from `>=4 <5.46.0 || >=5.55.7` to `>=5.55.7`. FaceTheory's bundled Stitch Svelte primitives (`stitch-shell`, `stitch-admin`, `stitch-hosted-auth`, `responsive-primitives`) are authored with Svelte 5 runes and no longer contain legacy `export let`, `$:`, `<slot>`, `$$slots`, `$$restProps`, or `on:` directives.

1. Upgrade the app's Svelte peer to `>=5.55.7`:

   ```bash
   npm install svelte@^5.55.7
   ```

   The excluded `5.46.0`–`5.55.6` band and Svelte 4 are unsupported because they are not validated for deterministic Svelte SSR/hydration; `facetheory doctor` fails closed with a floor message if the installed Svelte is below `5.55.7`.

2. Migrate your own Svelte components to runes (`$props`/`$state`/`$derived`, snippets and `{@render}` in place of `<slot>`, and `onclick=`-style event attributes). Svelte 5 compiles your components; FaceTheory renders them through `svelte/server`. Components that still use legacy syntax compile under Svelte 5's compatibility mode, but new authoring should use runes.

3. **Named-slot authoring change.** If a template fills a migrated FaceTheory Stitch primitive's named slot (for example the Stitch `Shell`/`Topbar`/`PageFrame` slots), migrate legacy `slot="name"` fills and `<svelte:fragment slot="name">` blocks to Svelte 5 snippets such as `{#snippet name()}…{/snippet}`. Legacy named-slot fills do not bind to the migrated runes snippet props and can silently drop that content. The SSR output of the migrated primitives is held byte-for-byte against the v3.12 fixture baseline after the template is migrated; any intentional difference is recorded in the release notes.

4. Re-run local verification and rebuild the Svelte example:

   ```bash
   cd ts
   npm run check
   npm run example:vite:svelte:build
   ```

The `.render()` synchronous "bring-your-own-HTML" input to `createSvelteFace` (the `SvelteLegacySSRComponent` shape) is unchanged; only the Svelte 4 compiled-component path and its `svelte/server` deprecation-error fallback were removed.


## Migration 9: v4 Public Surface Curation

Use this path when upgrading a 3.x consumer that imported optional helpers or internal utilities from the root
`@theory-cloud/facetheory` barrel. v4 curates the root barrel to the core runtime contract and keeps optional surfaces
reachable through documented package subpaths.

1. Replace root imports for optional surfaces with their subpaths:
   - SPA navigation helpers: `@theory-cloud/facetheory/spa`
   - OAC mutating-form transport helpers: `@theory-cloud/facetheory/oac-form`
   - control-plane presets: `@theory-cloud/facetheory/control-plane`
   - navigation-pending UI helpers: `@theory-cloud/facetheory/navigation-pending`
   - adapter strict-CSP guards for adapter authors: `@theory-cloud/facetheory/adapter-csp`
2. Stop importing internal routing and request-normalization helpers from the root barrel. `Router`, `RouterOptions`,
   `normalizePath`, slash-trimming helpers, header canonicalization helpers, query parsers/cloners, and cookie
   parsers/cloners were implementation details; applications should pass normal `FaceModule` routes and let
   `createFaceApp()` / the Lambda or AppTheory entrypoint normalize requests.
3. Stop importing low-level head serialization helpers from the root barrel. Use structured `headTags`, helper
   constructors such as `titleTag()`, `metaTag()`, `canonical()`, and `jsonLd()`, and the full `renderFaceHead()`
   primitive when a test needs to inspect final head HTML.
4. Replace the deprecated `Headers` type alias with `FaceHeaders`. The browser `Headers` class remains available from
   the DOM runtime; FaceTheory's canonical request/response header map is only `FaceHeaders`.
5. Replace `head.html` with the supported head channels:
   - use `head: { title }` for the document title
   - use structured `headTags` for meta/link/script/style/raw declarations
   - use `styleTags` for adapter or integration style output
6. Review any duplicate keyless head tags. v4 de-dupes keyless meta/link/script/style tags by their rendered
   structure, so identical duplicates collapse while distinct JSON-LD blocks remain distinct.
7. Remove any runtime import of control-plane guardrail scanners. The guardrail scanner is repository build/test
   tooling and is no longer shipped as runtime API.
8. Remove imports of `FaceContractWarningCode` and `FaceContractWarningLogRecord`. v4 no longer emits
   `facetheory.app.contract.warning`; invalid Face contracts throw during `createFaceApp()` instead.

Validation:

```bash
cd ts
npm run typecheck
```

Rollback:

- keep the previous pinned 3.x FaceTheory release tarball until all root imports have been migrated
- do not add app-local re-export barrels that recreate the removed internal surface; they reintroduce the drift the v4
  curation removes

## Migration 10: v4 Face Contract Construction Errors

Use this path when upgrading a 3.x app that relied on construction-time Face contract warnings. v4 makes those
contracts fail-fast so an invalid render-mode declaration cannot reach deployment.

1. Add `revalidateSeconds` to every `mode: 'isr'` Face. Choose a route-specific TTL that matches the rendered HTML's
   freshness promise, or change the Face to `mode: 'ssr'` when it must render on every request.
2. Add `generateStaticParams()` to every parameterized `mode: 'ssg'` Face. The function must enumerate every static
   params object the build should emit.
3. If a parameterized route cannot be enumerated at build time, change it to `mode: 'ssr'` for per-request rendering or
   `mode: 'isr'` with an explicit `revalidateSeconds` value when blocking regeneration is safe.
4. Remove observability handling for `facetheory.app.contract.warning`, `FaceContractWarningCode`, and
   `FaceContractWarningLogRecord`. These names/events were v3 warning scaffolding; v4 reports the affected route in the
   thrown `createFaceApp()` error message.

Validation:

```bash
cd ts
npm run typecheck
npm test
```

Rollback:

- keep the previous pinned 3.x FaceTheory release tarball until every Face satisfies the v4 contract
- do not suppress construction errors in app-local factories; changing a mode or adding the missing contract field is
  the migration


## Rollback Notes

- Keep the prior handler or deployable artifact available until the new path is verified.
- If ISR rollout introduces instability, revert affected routes to `mode: 'ssr'` while storage or lease settings are corrected.
- Keep environment-specific rollback commands in the operator runbooks that own the deployed stack.
