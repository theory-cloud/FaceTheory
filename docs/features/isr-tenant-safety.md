---
title: ISR tenant safety
---

Blocking ISR is **fail-closed** when known tenant-boundary headers reach FaceTheory without an explicit, trusted `tenantKey`. A custom `cacheKey` alone no longer exempts a tenant-scoped route: FaceTheory composes the trusted tenant into the effective cache identity. This prevents a tenant from seeing another tenant's cached HTML simply because the cache key didn't account for the tenant dimension.

## The hazard

ISR computes a cache key from the path, query, and (optionally) headers / cookies / a tenant key. By default, any request cookie folds into an hashed variant digest so unknown cookie variance fails safe by partitioning the cache entry. If the cache key doesn't include the tenant dimension but the rendered HTML varies per tenant, the first request from one tenant pollutes the cache and the next request from a different tenant serves the wrong page.

## The fail-closed behavior

When FaceTheory's ISR runtime sees a known tenant-boundary header — by default `x-tenant-id` or `x-facetheory-tenant` — that signal only proves the route is tenant-scoped; it never supplies tenant authority. The runtime refuses to serve cached HTML unless the Face has configured an explicit, trusted `tenantKey`.

A tenant-scoped custom `cacheKey` no longer exempts the route from this requirement. When both an explicit `tenantKey` and a custom `cacheKey` are configured, FaceTheory composes a framework-owned, privacy-preserving tenant partition (a digest of the trusted tenant) with the consumer's logical key, so distinct tenants never share a stored entry even when their logical keys coincide. When a custom `cacheKey` is configured without an explicit `tenantKey` and a tenant-boundary signal is present, the runtime fails closed before cache lookup, lease acquisition, or HTML writes.

This is intentional. The framework cannot tell whether the rendered HTML is tenant-invariant or tenant-varying, so the safe default is to fail and force the consumer to declare intent.

If a deployment uses additional tenant-like headers, register them with `tenantBoundaryHeaders`. The default headers remain active; the configured names extend the fail-closed list rather than replacing it.

```typescript
isr: {
  htmlStore,
  metaStore,
  tenantBoundaryHeaders: ['x-org-id', 'x-account-id'],
},
```

Custom tenant headers must be registered here, stripped before ISR, or covered by an explicit `tenantKey` partition.

## Tenant-invariant deployments

If the cached HTML is the same for every tenant, strip the viewer-supplied tenant-like headers at the CloudFront / AppTheory boundary before they reach FaceTheory. The simplest path is a CloudFront response headers / origin request policy that excludes the tenant headers from origin requests.

## Tenant-varying deployments

If the cached HTML varies per tenant, choose one of:

- **Use SSR instead of ISR.** Per-request rendering does not share state across tenants.
- **Configure `tenantKey`.** Provide a function that derives a stable, trusted tenant identifier from the request. Never read a raw viewer-supplied header directly; resolve the tenant only after a trusted boundary (CloudFront / AppTheory middleware) has stripped client copies and injected trusted context:

  ```typescript
  isr: {
    htmlStore,
    metaStore,
    tenantKey: tenantKeyFromTrustedHeader('x-tenant-id'),
  },
  ```

  The trusted tenant becomes part of the cache key; cache entries are partitioned per tenant.

- **Pair `tenantKey` with a custom `cacheKey` when the logical partition is more complex.** The custom function supplies the logical key; FaceTheory composes the trusted tenant partition on top. Delegate to `defaultIsrCacheKey` so query, cookie, and auth request variants are retained:

  ```typescript
  isr: {
    htmlStore,
    metaStore,
    // Trusted tenant identity — never a raw client-supplied header.
    tenantKey: tenantKeyFromTrustedHeader('x-tenant-id'),
    // Reuse the built-in key instead of hand-rolling one that drops request variants.
    cacheKey: ({ tenant, routePattern, params, query, headers, cookies }) =>
      defaultIsrCacheKey({
        tenant,
        routePattern,
        params,
        query,
        headers,
        cookies,
      }),
  },
  ```

  A custom `cacheKey` without an explicit `tenantKey` fails closed on any request that carries a tenant-boundary signal, and a trusted `tenantKey` that resolves to `null`, `undefined`, or a blank string on a tenant-scoped custom-key route fails closed rather than falling back to the implicit `default` tenant. The framework-owned partition prefix of the composed key embeds only a digest of the trusted tenant, never the raw tenant value; the consumer-owned logical key is independent of that partition and may itself contain the raw tenant (the recommended `defaultIsrCacheKey` does). The composed custom-key representation therefore stays distinct from the default key's raw-tenant representation. That representation separation is not a global collision-freedom or confidentiality guarantee: consumer logical-key correctness remains the existing trust boundary.

## Cookie request variants

By default, the built-in ISR cache key folds all request cookies into a digest. This is the fail-safe posture: an unexpected session or personalization cookie partitions the cache instead of allowing a potentially personalized render to be shared.

If a deployment knows that only specific cookies affect the ISR HTML, set `varyCookies` to that allowlist:

```typescript
isr: {
  htmlStore,
  metaStore,
  varyCookies: ['session'],
},
```

Requests that differ only in non-listed cookies share the same cache entry; requests that differ in a listed cookie partition. Keep the list complete for every cookie that can affect the rendered HTML. The allowlist must be non-empty: omit `varyCookies` to keep the all-cookies fail-safe, and do not pass `varyCookies: []`.

## Cache-control privacy (fail-closed)

ISR responses fail closed at the cache-control boundary. A request carrying an auth-variant signal — any default auth-vary header or any request cookie — or any request on a deployment with an explicit custom `cacheKey` is emitted and stored with `cache-control: private, no-store`. An anonymous request on the default cache key keeps the shared `public` value. `varyCookies` does not exempt a cookie-bearing request from the guard.

A custom `cacheKey` is an opaque identity the framework cannot attribute to a shared viewer, so it fails closed for every request, including anonymous ones; the previous public shared-cache hint is lost by design. Bespoke auth headers that are not part of the default auth-vary set require an explicit `cacheKey` to be protected. See [Blocking ISR → Cache-Control and request privacy](../modes/isr.md#cache-control-and-request-privacy-fail-closed).

## Migration

A custom `cacheKey` without an explicit, trusted `tenantKey` no longer counts as an ISR tenant partition, and tenant-scoped custom-key cache identities are now composed with a tenant digest. Existing tenant-scoped custom-key entries therefore miss and repopulate after upgrade; there is no fallback to the old unpartitioned keys.

The fail-closed behavior is a defensive default introduced in FaceTheory 3.x. Existing consumers that previously rendered tenant-invariant pages without filtering tenant-like headers may see new errors after upgrade — see [Migration Guide → Adopt ISR tenant fail-closed defaults](../migration-guide.md#migration-4-adopt-isr-tenant-fail-closed-defaults) for the upgrade path.

Cache-control now fails closed alongside the key: authenticated requests (a default auth-vary header or any cookie) and every request on a deployment with an explicit custom `cacheKey` emit and store `cache-control: private, no-store` rather than a shared value. Response headers change for those requests only; anonymous default-key responses keep the previous `public` value.

## Related docs

- [Blocking ISR](../modes/isr.md)
- [TableTheory integration](../integrations/tabletheory.md)
- [Troubleshooting → ISR fails closed when tenant headers are present](../troubleshooting.md#issue-isr-fails-closed-when-tenant-headers-are-present)
