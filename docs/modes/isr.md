---
title: Blocking ISR
---

Blocking ISR is FaceTheory's incremental static regeneration model. Requests serve cached HTML if fresh; if stale (or missing), the request blocks on a regenerate-and-return, coordinated by a regeneration lease so only one Lambda regenerates a given cache entry at a time. Cache state lives in TableTheory; HTML payloads live in an `HtmlStore` (S3 in production).

## Declaring an ISR Face

```typescript
import { createFaceApp, type FaceModule } from "@theory-cloud/facetheory";

const faces: FaceModule[] = [
  {
    route: "/news/{slug}",
    mode: "isr",
    revalidateSeconds: 30,
    load: async (ctx) => ({
      slug: ctx.params.slug,
      latest: await fetchLatest(ctx.params.slug),
    }),
    render: (_ctx, data) => {
      const { slug, latest } = data as {
        slug: string;
        latest: { title: string; body: string };
      };
      return {
        html: `<article><h1>${latest.title}</h1><p>${latest.body}</p></article>`,
      };
    },
  },
];
```

`revalidateSeconds` is the freshness TTL. The cached entry is served until it ages past this; the next request after expiry triggers a regeneration.

## Wiring the runtime

Configure the ISR runtime when constructing the app:

```typescript
import {
  createFaceApp,
  InMemoryHtmlStore,
  InMemoryIsrMetaStore,
} from "@theory-cloud/facetheory";

const htmlStore = new InMemoryHtmlStore();
const metaStore = new InMemoryIsrMetaStore();

export const app = createFaceApp({
  faces,
  isr: { htmlStore, metaStore },
});
```

The in-memory stores are for local development and tests. The runnable shape lives in `ts/examples/isr-blocking/handler.ts`.

## Production stores

In production, swap the in-memory stores for:

- **`S3HtmlStore`** — persists rendered HTML to S3.
- **A TableTheory-backed `IsrMetaStore`** — uses TableTheory's `FaceTheoryIsrMetaStore` (importable from `@theory-cloud/facetheory/tabletheory`) for cache metadata and regeneration leases backed by DynamoDB.

The cache record shape, lifecycle tags, and regen-lease semantics are documented on TableTheory's docs site:

- <https://theory-cloud.github.io/tabletheory/facetheory/isr-cache-schema/>
- <https://theory-cloud.github.io/tabletheory/facetheory/isr-transaction-recipes/>
- <https://theory-cloud.github.io/tabletheory/facetheory/isr-idempotency/>

See [TableTheory integration](../integrations/tabletheory.md) for the import boundary.

## Tenant safety (fail-closed)

Blocking ISR is **fail-closed** when known tenant-boundary headers (e.g. `x-tenant-id`, `x-facetheory-tenant`) reach FaceTheory without an explicit, trusted `tenantKey`. A custom `cacheKey` alone does not exempt a tenant-scoped route: FaceTheory composes a framework-owned tenant partition with the consumer's logical key, and refuses before cache/lease/write when the trusted `tenantKey` is missing on a tenant-scoped custom-key route. Tenant-invariant ISR must strip viewer-supplied tenant-like headers at the CloudFront / AppTheory boundary; tenant-varying pages must use SSR or an explicit trusted partition that includes every request-varying dimension affecting the cached HTML.

See [ISR tenant safety](../features/isr-tenant-safety.md) and [Migration Guide → Adopt ISR tenant fail-closed defaults](../migration-guide.md).

## Request methods and bodies (uncached passes)

The shared ISR cache identity represents a body-less `GET` or `HEAD` only. Every
other request — any other method, or a `GET`/`HEAD` that carries a request body —
renders fresh through `load`/`render` and never reads, leases, commits, or writes a
shared cache entry. The response carries `x-facetheory-isr: bypass` and
`cache-control: private, no-store`, so a downstream shared cache cannot store a
response whose method or body the ISR identity does not represent. `GET` and `HEAD`
without a body keep the existing keys, cache headers, and entries unchanged.

## Query request variants (bounded)

The default cache key partitions by the full query string, so `?page=2` and
`?page=3` are distinct entries. To keep that partitioning from becoming an
unbounded fan-out of metadata records, leases, and HTML objects, the runtime
tracks distinct query-bearing cache keys per route pattern and stops persisting
new variants after `maxQueryVariantsPerRoute` (default `1024`, `0` disables the
cap). A request past the cap still renders correct fresh output; it just does not
read, lease, commit, or write a shared entry, and it carries
`x-facetheory-isr: bypass` with `cache-control: private, no-store`. Keys that
were admitted before the cap keep their existing entries and headers. Tracking is
per runtime instance, so a cold start starts a fresh budget; pair the cap with
edge rate limiting when a deployment needs a hard global bound.

## Cookie request variants

The built-in ISR cache key includes all request cookies in a hashed variant by default. This preserves the fail-safe behavior for unknown personalization cookies. To share entries across non-render-affecting cookies, configure an allowlist:

```typescript
export const app = createFaceApp({
  faces,
  isr: {
    htmlStore,
    metaStore,
    varyCookies: ["session"],
  },
});
```

With `varyCookies`, only listed cookies partition the default cache key; absent `varyCookies` keeps the all-cookies default. The allowlist must contain at least one cookie name. `varyCookies: []` is rejected at app construction because it would remove cookie partitioning entirely.

## Cache-Control and request privacy (fail-closed)

ISR responses fail closed at the cache-control boundary. A request is treated as request-private when either:

- the deployment configured an explicit custom `cacheKey` (an opaque, consumer-owned identity the framework cannot attribute to a shared viewer), or
- the request carries an auth-variant signal: any default auth-vary header (`Authorization`, `Proxy-Authorization`, `X-API-Key`, `X-Amz-Security-Token`) or **any** request cookie.

A request-private response is emitted — and its rendered HTML stored — with `cache-control: private, no-store`. Every cookie counts here, independent of `varyCookies`: `varyCookies` only scopes the default cache-key digest, so an unlisted cookie can contribute nothing to the key yet still never re-share a request-private response.

An ordinary anonymous request on the default cache key keeps the shared value `blockingIsrCacheControl(revalidateSeconds)`:

```
public, max-age=0, s-maxage=0, stale-if-error=<revalidateSeconds>, must-revalidate
```

The guard applies on every emission path — fresh hit, miss, wait-hit, serve-stale, stale-after-error, and stale-metadata-error — and to the `HtmlStore` write, so a guarded render's stored object metadata never remains public.

### Explicit `cacheControl` callbacks

`FaceIsrOptions.cacheControl` still shapes the emitted cache-control value for **unguarded** requests, and a callback that returns `private, no-store` is preserved verbatim. It cannot widen a guarded request: when the guard applies, the callback result is not emitted. The origin-store write is always the framework default (or `private, no-store` when guarded); the callback only affects the response header, exactly as before.

### Supported auth boundary

The framework's supported auth surface is exactly the default key's fail-safe variant set: the default auth-vary headers plus all cookies. A deployment that authenticates with a bespoke identity header **not** in that set (for example `x-session-token`) and no cookies is not detectable as authenticated on the default key. If you authenticate that way, configure an explicit `cacheKey` that partitions on the identity input; a custom `cacheKey` now fails closed deployment-wide, including for anonymous requests. Origin key partition is not shared-cache safety on its own: the cache-control guard, not the key, is what stops a shared cache from storing a request-private response.

Treat `cacheControl` like `tenantKeyFromTrustedHeader`: it is emitted per request and cannot see whether an upstream boundary already stripped client-supplied identity, so rely only on values a trusted boundary wrote after authentication.

## On-demand invalidation

`IsrMetaStore.invalidate(cacheKey)` is the FaceTheory-side invalidation primitive. The in-memory store deletes the metadata record for the cache key, so the next request cannot find a fresh pointer and performs a normal blocking regeneration. The HTML object that used to be referenced is not deleted by metadata invalidation; in production it becomes an orphan until object lifecycle cleanup removes it.

Use the same cache-key function the app uses for ISR requests. For the default key, call `defaultIsrCacheKey(...)` with the route pattern, params, query, tenant, and request variant dimensions that affect the Face output.

```typescript
import { defaultIsrCacheKey } from "@theory-cloud/facetheory";

const cacheKey = defaultIsrCacheKey({
  tenant: "default",
  routePattern: "/news/{slug}",
  params: { slug: "launch" },
  query: {},
});

await metaStore.invalidate(cacheKey);
```

The TableTheory adapter currently throws `IsrInvalidateUnsupportedError` for `invalidate(cacheKey)`. This is intentional: FaceTheory must not hand-roll a DynamoDB delete/update beside TableTheory's lease and lifecycle semantics. TableTheory needs a first-class ISR invalidation/delete operation before production TableTheory-backed invalidation can be enabled.

## What ISR guarantees

- Fresh entries serve from cache without invoking `render` or `load`.
- Stale entries serve only after regeneration completes (blocking model — no stale-while-revalidate by default).
- Regeneration is serialized per cache key by a lease: concurrent requests for the same stale entry wait for the lease holder rather than thundering the origin.
- If the metadata store fails after this Lambda runtime has a serveable last-known pointer for the cache key, FaceTheory serves that stale HTML with `x-facetheory-isr: stale-metadata-error` instead of turning a metadata outage into a 500. The original metadata exception is sent to `observability.onError` with `ctx.phase === "isr-metadata"`.
- If no serveable entry is known, metadata-store failures still fail closed as 500 responses through the normal error hook path.
- TTL controls freshness; failure policy (`'serve-stale'` vs `'error'`) and lock-contention policy (`'wait'` vs `'serve-stale'`) are configurable via `FaceIsrOptions`.

## Related docs

- [TableTheory integration](../integrations/tabletheory.md)
- [ISR tenant safety](../features/isr-tenant-safety.md)
- [Core Patterns → Keep ISR storage prefixes intentional](../core-patterns.md#pattern-keep-isr-storage-prefixes-intentional)
- [FaceModule API reference](../reference/face-module.md)
