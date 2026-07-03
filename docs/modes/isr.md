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

Blocking ISR is **fail-closed** when known tenant-boundary headers (e.g. `x-tenant-id`, `x-facetheory-tenant`) reach FaceTheory without an explicit `tenantKey` or custom `cacheKey`. Tenant-invariant ISR must strip viewer-supplied tenant-like headers at the CloudFront / AppTheory boundary; tenant-varying pages must use SSR or an explicit trusted partition that includes every request-varying dimension affecting the cached HTML.

See [ISR tenant safety](../features/isr-tenant-safety.md) and [Migration Guide → Adopt ISR tenant fail-closed defaults](../migration-guide.md).

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

With `varyCookies`, only listed cookies partition the default cache key; absent `varyCookies` keeps the all-cookies default.

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
