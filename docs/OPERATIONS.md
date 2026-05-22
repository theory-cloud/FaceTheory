# FaceTheory Operations (H4)

This document describes production hardening guidance for FaceTheory apps and the AWS example stacks in `infra/`.

## Production Checklist

- Request correlation:
  - Ensure every response includes `x-request-id`.
  - Prefer propagating an inbound `x-request-id` from edge/CDN/LB.
- Caching invariants:
  - SSR responses should be explicitly non-cacheable (example: `cache-control: private, no-store`).
  - SSG HTML and hydration JSON should be served from S3 with explicit `cache-control`.
  - ISR responses must include an `x-facetheory-isr` state header (`hit` | `miss` | `stale` | `wait-hit`) and deterministic cache headers.
  - Query-dependent ISR output now partitions by query string by default; request-personalized output still needs an explicit `cacheKey` / `tenantKey` or SSR. Requests with known tenant boundary headers (`x-tenant-id`, `x-facetheory-tenant`) fail closed unless that explicit partition is configured.
- Security headers:
  - Set baseline security headers at the CDN layer (HSTS, nosniff, frame-options, referrer-policy, permissions-policy).
  - Do not attempt to set a nonce-based CSP at CloudFront (nonces are per-request).
  - Attach strict no-inline CSP headers from the Face response when a route opts into
    `csp: { inlineScripts:false, inlineStyles:false, rawHead:false }`; the runtime validates output but does not add the
    header automatically.
- Timeouts/limits:
  - Configure Lambda timeout and memory for worst-case SSR render + streaming.
  - For React streaming, ensure `abortDelayMs` is comfortably below your Lambda timeout.
- Logs/metrics:
  - Emit structured, parseable JSON logs (one record per request minimum).
  - Emit minimal metrics (request count, render duration; ISR state counts; React shell/all-ready readiness timing if streaming).

## Observability

### Request ID conventions

- FaceTheory always normalizes and emits `x-request-id` on responses:
  - If an inbound `x-request-id` is present, it is preserved.
  - Otherwise, FaceTheory generates one (UUID).
- When using the AppTheory adapter (`ts/src/apptheory/index.ts`), the AppTheory `ctx.requestId` is injected into the
  FaceTheory request as `x-request-id` to keep correlation consistent across both runtimes.

AWS example (`infra/apptheory-ssg-isr-site/`) additionally:
- Sets `x-request-id` in a CloudFront viewer-request function (defaulting to the CloudFront request ID).
- Echoes `x-request-id` back to the viewer for S3 and SSR responses via a viewer-response function.

### Stable diagnostic headers

- `x-request-id`: request correlation across edge/origin/logs.
- `x-facetheory-ssr: 1`: marker for SSR responses in the infra examples.
- `x-facetheory-isr`: ISR cache state (`hit` | `miss` | `stale` | `wait-hit`).

### Structured logs and minimal metrics

FaceTheory `createFaceApp({ observability: ... })` supports:
- `observability.log(record)`:
  - `event: "facetheory.request.completed"`
  - `requestId`, `routePattern`, `mode`, `status`, `durationMs`, `renderMs`, `isrState`, `isStream`
- `observability.metric(record)`:
  - `facetheory.request` counter (tags include `route_pattern`, `mode`, `status`, `isr_state`)
  - `facetheory.render_ms` timing for requests that actually rendered

React streaming readiness (React adapter):
- `renderReactStream(..., { onReadiness })` emits readiness timing for:
  - `phase: "shell"` (React `onShellReady`)
  - `phase: "all-ready"` (React `onAllReady`)

## Security

### CSP nonce conventions (SSR only)

FaceTheory supports CSP nonces via `FaceRequest.cspNonce`:
- `renderFaceHead(...)` applies `nonce="..."` to inline `<script>`/`<style>` tags (including hydration data scripts).
- React streaming passes the nonce to React’s streaming renderer.

Important constraint:
- A per-request nonce must not be baked into cached HTML (SSG/ISR). If an ISR/SSG HTML document contains a nonce,
  your CSP header must match the cached nonce value for every request, which is not compatible with per-request nonces.
  For cached HTML, prefer a hash-based CSP or avoid inline scripts/styles entirely.

Helper:
- `createCspNonce()` is available at `ts/src/security.ts`.

### Strict no-inline CSP operations

Strict no-inline routes replace inline hydration with same-origin JSON sidecars and should be checked as a render/data
pair:

- SSR: confirm the response carries `content-security-policy` from the Face and the external hydration `dataUrl` is
  same-origin. If the data is request-time, route the sidecar URL to Lambda/AppTheory or another host-owned same-origin
  endpoint that can reproduce the exact render data.
- SSG: confirm HTML and `/_facetheory/data/*` sidecars are uploaded together and routed to S3 through CloudFront. Cache
  headers and invalidations should keep the HTML and sidecar from different builds from being mixed.
- ISR: confirm `x-facetheory-isr` behavior stays normal and hydration sidecar URLs with
  `__facetheory_isr_hydration=...` route to Lambda/FaceTheory. The runtime validates the opaque pointer token and serves
  the pointer-derived `.hydration.json` object from the same `S3HtmlStore` used for HTML.
- SPA navigation: confirm `startFaceNavigation()` or non-CSP `startAwsOacFormTransport({ navigationPolicy: "spa" })`
  responses load external hydration data before mutating the document. Use `navigationPolicy: "full-page"` when fetched
  CSP-protected HTML should become a real browser navigation instead of a document-write or SPA DOM replacement.

Evidence boundary:
- A local strict-CSP test or example build proves repository behavior only.
- A successful RC validation must name the exact FaceTheory GitHub Release tarball installed by the consuming app.
- Do not record "AWS deployment verified", "Simulacrum verified", or "customer deployed" unless that system supplied
  independent evidence through the owning operator or steward.

### Response headers policy guidance

Recommended baseline (CDN layer preferred):
- `strict-transport-security` (HSTS)
- `x-content-type-options: nosniff`
- `x-frame-options: DENY`
- `referrer-policy: strict-origin-when-cross-origin`
- `permissions-policy` (disable features you don’t need)

The SSG/ISR example stack provisions these via `cloudfront.ResponseHeadersPolicy`:
- `infra/apptheory-ssg-isr-site/src/stack.ts`

### Tenant partitioning guidance

- FaceTheory’s default ISR tenant resolver ignores request tenant headers and uses the `default` tenant.
- Treat request headers as untrusted until AppTheory middleware, CloudFront, or another authenticated boundary strips client-supplied copies and writes trusted values.
- If tenant identity is derived from a session, auth token, host mapping, or trusted header, override `tenantKey` so cached HTML keys follow that trusted source instead of raw client input.
- If `x-tenant-id` or `x-facetheory-tenant` reaches an ISR route without an explicit `tenantKey` or custom `cacheKey`, FaceTheory refuses the ISR request before metadata lookup or HTML writes. Remove tenant-like headers for tenant-invariant ISR, or keep the route on SSR until partitioning is explicit.

## Limits and Timeouts

- Lambda timeout:
  - Set based on worst-case SSR render + dependencies + cold start.
  - Ensure React streaming `abortDelayMs` is lower than the Lambda timeout to avoid hanging responses.
- Request size:
  - Prefer enforcing request body size limits at the edge/LB layer.
  - When using AppTheory as the AWS entrypoint, AppTheory supports `limits.maxRequestBytes`.

## Runbooks

### Deploy / rollback (SSR + assets)

Recommended approach:
1. Deploy assets to S3 (hashed assets `immutable`; manifests and HTML short-lived).
2. Deploy SSR Lambda (versioned + alias in real deployments).
3. Invalidate CloudFront only when you deploy non-hashed, cacheable keys.

Rollback:
1. Roll back the SSR Lambda alias to the previous version.
2. Roll back assets by switching the assets prefix (preferred) or redeploying the previous assets set.
3. Invalidate CloudFront for any non-hashed keys that may be cached.

### SSG cache invalidation strategy

Prefer versioned prefixes for HTML/data outputs:
- Example: deploy under `ssg/<build-id>/...` and switch CloudFront behavior/origin path.

If using stable keys:
- Invalidate HTML keys (`/*` or targeted paths) on deploy.
- Do not invalidate immutable hashed assets.

### Strict CSP RC and stable release handoff

Use this checklist before promoting strict-CSP changes from release candidate to stable:

1. Release Please owns the RC and stable tags/releases; do not hand-create tags, GitHub Releases, changelogs, or assets.
2. Install the RC in the validating app from the immutable GitHub Release tarball, not a workspace link.
3. Ask Simulacrum validation to exercise the strict-CSP surface it owns, including:
   - an SSR strict route with explicit CSP header attachment
   - SSG sidecar routing through CloudFront/S3 for `/_facetheory/data/*`
   - ISR sidecar hydration through the Lambda/FaceTheory query-param URL
   - OAC form navigation policy behavior when CSP-protected HTML responses are involved
4. Capture evidence as RC validation, not as publication proof: exact RC version, PR/release URL, commands or browser
   route checks, observed headers/URLs, and whether app-local workarounds were removed.
5. Stable promotion criteria:
   - FaceTheory CI and local release checks are green
   - strict-CSP docs and examples match the implementation
   - Simulacrum or another authorized consumer has validated the RC from the release tarball if the release scope depends
     on deployed behavior
   - no docs claim AWS/customer deployment proof beyond the evidence captured
   - `main` is back-merged to `staging` after stable release per the normal release flow

Rollback:
- pin consumers to the previous FaceTheory release tarball, or remove the strict-CSP opt-in on affected routes.
- do not weaken OAC, expose direct Lambda Function URLs, or remove CSP headers as the framework rollback path.

### ISR lock contention diagnostics

Symptoms:
- Elevated `x-facetheory-isr: stale` or `x-facetheory-isr: wait-hit`.

Checks:
- CloudWatch logs for request patterns and render durations (`renderMs`).
- DynamoDB table hot partitions (if tenant+route concentrates traffic).
- Regeneration time vs lease duration:
  - If regeneration routinely exceeds the lease, you will see contention and repeated stale serving.

Mitigations (FaceTheory ISR options):
- Increase `leaseDurationMs`.
- Increase `regenerationWaitTimeoutMs` or switch `lockContentionPolicy` to `serve-stale`.
- Ensure the regeneration path does not block on external dependencies without timeouts.
