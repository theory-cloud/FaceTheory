# FaceTheory Migration Guide

This guide focuses on the supported migration paths into the current FaceTheory runtime contract and deployment model.

## When To Use This Guide

Use this guide when you are:
- replacing an ad hoc SSR handler with FaceTheory entrypoints
- introducing SSG or ISR into an SSR-only FaceTheory app
- updating AppTheory or TableTheory dependency pins

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

## Rollback Notes

- Keep the prior handler or deployable artifact available until the new path is verified.
- If ISR rollout introduces instability, revert affected routes to `mode: 'ssr'` while storage or lease settings are corrected.
- Keep environment-specific rollback commands in the operator runbooks that own the deployed stack.
