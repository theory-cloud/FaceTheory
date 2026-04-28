# Scoped Need: ISR Tenant Partition Safety

## Background

The April 28, 2026 Codex security findings review confirmed that FaceTheory `main` addresses query, cookie, auth-header, head, href, and style-terminator hardening, but one ISR tenanting issue remains open. FaceTheory now ignores spoofable request tenant headers by default, which is correct for untrusted client input. The remaining gap is the upgrade/misconfiguration path where an ISR Face renders tenant-specific HTML from a trusted tenant source, such as an edge-injected `x-tenant-id`, but the app does not configure `isr.tenantKey`. In that case the runtime stores every rendered response under the `default` tenant and can serve one tenant's cached HTML to another tenant.

## Driver

Security hardening for FaceTheory before downstream tenantized Theory Cloud UIs rely on ISR for cacheable HTML. The immediate trigger is the unresolved Codex security finding `ISR default tenant collapse can leak cross-tenant cached HTML` in `.theory/codex-security-findings-2026-04-28T19-27-34.508Z.csv`.

## Problem

FaceTheory has a safe primitive for tenant partitioning (`FaceIsrOptions.tenantKey`, plus `tenantKeyFromTrustedHeader()`), but it is optional and the runtime cannot currently distinguish "tenant-invariant ISR" from "tenant-varying ISR that forgot to configure a tenant key." Documentation warns consumers to configure `tenantKey` or keep the route on SSR, but warnings do not fully address the confidentiality risk. A tenant-varying ISR Face can still silently share cached HTML across tenants when no explicit tenant partition is configured.

## Render modes affected

ISR only. SSR must remain uncached per request, SSG remains build-time static output, and SPA remains a deterministic shell with client hydration.

## Adapters affected

Adapter-agnostic core behavior. React, Vue, and Svelte Faces all pass through the same ISR runtime and cache-key path, so the fix must live in core rather than in an adapter.

## Shape impact

Additive core capability inside the existing ISR render mode. This does not add a fifth render mode, a fourth adapter, or a new storage backend. The likely shape is an ISR safety contract that makes tenant-varying ISR explicit and fail-closed when tenant boundary inputs are present without a configured partition.

## Determinism impact

Preserves determinism. The change should make cache identity deterministic and explicit for tenant-varying ISR Faces instead of allowing an implicit `default` tenant to collapse distinct rendered outputs into one cache entry. It must not introduce request-time randomness, client-only state, or framework-specific behavior.

## AWS-first posture

Preserves the AWS-first posture. Tenant trust still belongs at AppTheory / CloudFront / Lambda middleware boundaries, and ISR cache metadata and leases still live in TableTheory-compatible stores. No non-AWS deployment abstraction or alternate cache store is in scope.

## Success criteria

- A tenant-varying ISR Face that reads a trusted tenant value, such as `x-tenant-id`, cannot silently serve tenant A's cached HTML to tenant B when no tenant partition is configured.
- The default behavior fails closed when a known tenant boundary signal is present without an explicit ISR tenant/cache partition; this is not an opt-in strict mode.
- The default safe path for tenant-invariant ISR remains simple and deterministic.
- The explicit tenant-varying path is clear: configure `tenantKey` / `cacheKey`, or keep the route on SSR.
- Tests cover the previously reproduced failure mode: request A with tenant A warms an ISR route, request B with tenant B follows, and FaceTheory either partitions correctly or fails closed rather than returning tenant A's HTML.
- Tests cover that `tenantKeyFromTrustedHeader('x-tenant-id')` continues to partition correctly when the upstream boundary strips client-supplied copies and injects trusted values.
- Tests cover that raw tenant/auth/cookie secrets are not written into cache keys or logs.
- Documentation and examples distinguish tenant-invariant ISR from tenant-varying ISR and state the fail-closed behavior.
- No TableTheory schema change is required; if a proposed implementation needs one, that becomes a cross-steward coordination point before implementation proceeds.

## Nearest existing surface

- `ts/src/isr.ts`
  - `FaceIsrOptions.tenantKey`
  - `FaceIsrOptions.cacheKey`
  - `defaultIsrCacheKey()`
  - `tenantKeyFromTrustedHeader()`
- `ts/test/unit/isr.test.ts`
  - query partitioning
  - default tenant ignores spoofable headers
  - explicit trusted-header tenant partitioning
  - auth-header and cookie hashing without raw secret leakage
- AppTheory tenant-trust guidance, which strips viewer-supplied tenant headers by default and treats trusted tenant derivation as an upstream boundary concern.
- `ts/examples/isr-blocking/`, which currently demonstrates tenant-invariant ISR.

## Out of scope

- Adding a new render mode.
- Making ISR personalize arbitrary user-specific HTML without explicit cache partitioning.
- Moving ISR cache metadata, lease state, or TTL semantics out of TableTheory-compatible storage.
- Trusting viewer-supplied tenant headers by default.
- Inferring tenant variance by inspecting component code or adapter internals.
- Non-AWS deployment support.
- Adapter-specific fixes in React, Vue, or Svelte.

## Open questions

- Resolved: FaceTheory should make tenant safety fail closed by default whenever known tenant-like headers are present and no explicit ISR tenant/cache partition is configured. This is not an explicit strict mode.
- Is a face-level declaration needed to distinguish tenant-invariant ISR from tenant-varying ISR, or is an app-level ISR option sufficient?
- Which tenant boundary signals should be treated as known tenant-like inputs by default (`x-tenant-id`, `x-facetheory-tenant`, host-derived tenant mappings, AppTheory original-host headers, or a configurable set)?
- Should the failure response be a deterministic 500, a configuration-time error when the app is created, or an ISR-mode refusal that directs the consumer to SSR?
- Do any current downstream consumers depend on tenant-varying ISR without explicit `tenantKey`, and if so, is a pre-1.0 breaking fail-closed change acceptable in the next minor release?
