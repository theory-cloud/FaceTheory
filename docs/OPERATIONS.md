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
- Security headers:
  - Set baseline security headers at the CDN layer (HSTS, nosniff, frame-options, referrer-policy, permissions-policy).
  - Do not attempt to set a nonce-based CSP at CloudFront (nonces are per-request).
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

### Response headers policy guidance

Recommended baseline (CDN layer preferred):
- `strict-transport-security` (HSTS)
- `x-content-type-options: nosniff`
- `x-frame-options: DENY`
- `referrer-policy: strict-origin-when-cross-origin`
- `permissions-policy` (disable features you don’t need)

The SSG/ISR example stack provisions these via `cloudfront.ResponseHeadersPolicy`:
- `infra/apptheory-ssg-isr-site/src/stack.ts`

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

