---
title: ISR tenant safety
---

Blocking ISR is **fail-closed** when known tenant-boundary headers reach FaceTheory without an explicit `tenantKey` or custom `cacheKey`. This prevents a tenant from seeing another tenant's cached HTML simply because the cache key didn't account for the tenant dimension.

## The hazard

ISR computes a cache key from the path, query, and (optionally) headers / cookies / a tenant key. By default, any request cookie folds into an hashed variant digest so unknown cookie variance fails safe by partitioning the cache entry. If the cache key doesn't include the tenant dimension but the rendered HTML varies per tenant, the first request from one tenant pollutes the cache and the next request from a different tenant serves the wrong page.

## The fail-closed behavior

When FaceTheory's ISR runtime sees a known tenant-boundary header — by default `x-tenant-id` or `x-facetheory-tenant` — and the Face has not configured a `tenantKey` or custom `cacheKey` that explicitly accounts for it, the runtime refuses to serve cached HTML and emits an error response instead.

This is intentional. The framework cannot tell whether the rendered HTML is tenant-invariant or tenant-varying, so the safe default is to fail and force the consumer to declare intent.

If a deployment uses additional tenant-like headers, register them with `tenantBoundaryHeaders`. The default headers remain active; the configured names extend the fail-closed list rather than replacing it.

```typescript
isr: {
  htmlStore,
  metaStore,
  tenantBoundaryHeaders: ['x-org-id', 'x-account-id'],
},
```

Custom tenant headers must be registered here, stripped before ISR, or included in an explicit `tenantKey` / custom `cacheKey` partition.

## Tenant-invariant deployments

If the cached HTML is the same for every tenant, strip the viewer-supplied tenant-like headers at the CloudFront / AppTheory boundary before they reach FaceTheory. The simplest path is a CloudFront response headers / origin request policy that excludes the tenant headers from origin requests.

## Tenant-varying deployments

If the cached HTML varies per tenant, choose one of:

- **Use SSR instead of ISR.** Per-request rendering does not share state across tenants.
- **Configure `tenantKey`.** Provide a function that derives a stable tenant identifier from the request:

  ```typescript
  isr: {
    htmlStore,
    metaStore,
    tenantKey: (ctx) => ctx.request.headers['x-tenant-id']?.[0] ?? null,
  },
  ```

  The tenant key becomes part of the cache key; cache entries are partitioned per tenant.

- **Configure a custom `cacheKey`.** When the partition is more complex than a single header, supply the full key derivation:

  ```typescript
  isr: {
    htmlStore,
    metaStore,
    cacheKey: ({ tenant, routePattern, params, query, headers }) => {
      const locale = headers?.['accept-language']?.[0]?.split(',')[0] ?? 'en';
      return `${tenant ?? 'public'}|${routePattern}|${JSON.stringify(params)}|${locale}`;
    },
  },
  ```

  The cache key must include every request-varying dimension that affects the cached HTML.

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

Requests that differ only in non-listed cookies share the same cache entry; requests that differ in a listed cookie partition. Keep the list complete for every cookie that can affect the rendered HTML.

## Migration

The fail-closed behavior is a defensive default introduced in FaceTheory 3.x. Existing consumers that previously rendered tenant-invariant pages without filtering tenant-like headers may see new errors after upgrade — see [Migration Guide → Adopt ISR tenant fail-closed defaults](../migration-guide.md#migration-4-adopt-isr-tenant-fail-closed-defaults) for the upgrade path.

## Related docs

- [Blocking ISR](../modes/isr.md)
- [TableTheory integration](../integrations/tabletheory.md)
- [Troubleshooting → ISR fails closed when tenant headers are present](../troubleshooting.md#issue-isr-fails-closed-when-tenant-headers-are-present)
