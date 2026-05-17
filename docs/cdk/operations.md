# FaceTheory Operations Guide

This guide summarizes the runtime and edge-level checks that should remain true after a deploy, rollback, or incident response cycle.

## Production Checklist

- Ensure every request and response path carries `x-request-id`
- Keep SSR cache headers explicit and conservative
- Confirm `x-facetheory-isr` is present on ISR routes
- Set baseline security headers at the CDN layer
- Size Lambda timeout and memory for worst-case render time
- Capture structured logs and minimal request metrics

## Observability

FaceTheory application hooks:
- `observability.log(record)` for request completion records
- `observability.metric(record)` for request and render measurements

Recommended headers:
- `x-request-id`
- `x-facetheory-isr`
- `x-facetheory-ssr` when your stack uses an SSR marker header

React streaming:
- monitor `onReadiness` events for `shell` and `all-ready` timing when tuning TTFB versus style completeness

## Security

- Prefer security headers at CloudFront rather than inside every route
- Use per-request CSP nonces only for per-request SSR HTML
- Do not bake per-request nonces into cached SSG or ISR HTML
- For strict no-inline CSP routes, attach the route CSP header from the Face response and verify no inline
  scripts/styles/raw head output reaches the browser

Useful helper:
- `createCspNonce()`
- `buildStrictCspHeader()`

## Strict CSP Deployment Checks

Use these checks when a deployment includes routes with
`csp: { inlineScripts:false, inlineStyles:false, rawHead:false }`:

- SSG: `/_facetheory/data/*` reaches the S3 origin and returns JSON sidecars with cache headers coordinated with the
  referencing HTML.
- ISR: hydration sidecar URLs with `__facetheory_isr_hydration=...` reach Lambda/FaceTheory, not direct S3 object keys.
- SSR: dynamic external hydration endpoints are same-origin and routed to the runtime that produced the server render.
- CSP header: the HTML response includes the intended `content-security-policy`; baseline CloudFront headers alone are
  not enough.
- OAC forms: choose full-page navigation for CSP-protected HTML outcomes unless the host deliberately uses the SPA
  navigation policy and validates external hydration before DOM mutation.

## Deploy And Roll Back

Keep deploy and rollback steps boring and reversible. The safest sequence is assets first, then compute, then selective cache invalidation.

Preferred deploy order:
1. Upload assets and static outputs
2. Deploy the SSR Lambda artifact
3. Invalidate only non-hashed cacheable keys when necessary

Rollback:
1. Revert the Lambda artifact or alias
2. Revert assets by prefix or prior artifact
3. Invalidate non-hashed keys if they may still be cached

## Release Validation Notes

Strict-CSP release validation is evidence-driven:

- validate release candidates from immutable GitHub Release tarballs, not workspace links
- ask Simulacrum or another authorized consuming app to exercise the strict-CSP routes it owns before stable promotion
- capture exact version, route URLs, headers, sidecar URLs, and navigation behavior as evidence
- do not claim Simulacrum, AWS, or customer deployment success from local tests alone
- stable promotion remains the normal Release Please path; do not hand-create release tags or assets

## ISR Incident Checks

These checks help separate ordinary cache warm-up from lease contention or regeneration instability.

Look for:
- elevated `x-facetheory-isr: stale`
- elevated `x-facetheory-isr: wait-hit`
- regeneration time exceeding lease duration
- hot partitions in the metadata table

Mitigations:
- increase `leaseDurationMs`
- increase `regenerationWaitTimeoutMs`
- change `lockContentionPolicy` to `serve-stale` when appropriate
- reduce slow upstream calls in the regeneration path
