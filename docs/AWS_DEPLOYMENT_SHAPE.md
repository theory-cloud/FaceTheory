# AWS Deployment Shape (CloudFront + S3 + Lambda URL)

This document describes the recommended production topology for FaceTheory apps and the cache behavior split for
SSR/SSG/ISR.

## Reference Topology

- **CloudFront distribution** (single public entrypoint)
  - **Origin A: S3** for static client assets and prebuilt static pages
  - **Origin B: Lambda Function URL** for SSR + ISR regeneration paths
- **S3 bucket(s)**
  - immutable client assets (Vite output)
  - optional SSG HTML output
  - optional ISR HTML object storage (via `S3HtmlStore`; AWS SDK v3 client adapter: `@theory-cloud/facetheory/aws-s3`)
- **DynamoDB table**
  - ISR metadata + lease/lock state (via TableTheory `FaceTheoryIsrMetaStore` and FaceTheory adapter `@theory-cloud/facetheory/tabletheory`)

## AppTheory CDK (Recommended)

AppTheory CDK ships `AppTheorySsrSite`, which implements this topology and wires recommended environment variables onto
your SSR Lambda function.

Reference example (FaceTheory repo):
- `infra/apptheory-ssr-site/`
- `infra/apptheory-ssg-isr-site/` (SSG origin-group + ISR example)

When `wireRuntimeEnv:true` (default), the SSR function will receive:
- `APPTHEORY_ASSETS_BUCKET`
- `APPTHEORY_ASSETS_PREFIX`
- `APPTHEORY_ASSETS_MANIFEST_KEY` (Vite commonly emits `.vite/manifest.json`; ensure your stack config matches)

If a cache table name is configured, AppTheory also wires these aliases:
- `APPTHEORY_CACHE_TABLE_NAME`
- `FACETHEORY_CACHE_TABLE_NAME`
- `CACHE_TABLE_NAME`
- `CACHE_TABLE`

FaceTheory ISR HTML storage is provided by `S3HtmlStore` and typically needs these env vars in the SSR runtime:
- `FACETHEORY_ISR_BUCKET` (S3 bucket name)
- `FACETHEORY_ISR_PREFIX` (S3 prefix used by your `S3HtmlStore` instance)

Note on prefixes:
- `S3HtmlStore` has a `keyPrefix` (physical S3 prefix).
- FaceTheory ISR runtime has `htmlPointerPrefix` (logical prefix embedded in stored pointers).

Avoid configuring both to the same non-empty prefix, or you’ll end up with `prefix/prefix/...` keys.

## Build Outputs (Recommended Contract)

This is the deployment contract FaceTheory assumes for typical Vite SSR apps:

- **SSR Lambda handler**: exports a Lambda Function URL handler (streaming-capable).
  - Preferred wiring: AppTheory `createLambdaFunctionURLStreamingHandler(app)` + FaceTheory AppTheory adapter
    (`@theory-cloud/facetheory/apptheory`).
- **Assets bucket layout**: S3 keys should match the URL path that CloudFront routes to S3.
  - Hashed build assets should live under an asset prefix (commonly `assets/`), and be served with long-lived caching.
  - Vite manifest key should be explicitly configured in CDK to match your build output path
    (commonly `.vite/manifest.json`).
- **Optional SSG hydration JSON**:
  - keys under `/_facetheory/data/*` (SSG) routed to S3

See:
- `infra/apptheory-ssr-site/` for SSR + assets via AppTheory `AppTheorySsrSite`
- `infra/apptheory-ssg-isr-site/` for SSG origin-group failover + ISR (S3 + Dynamo)

## CloudFront Behaviors

There are two viable strategies for “SSG hits avoid Lambda”.

### Strategy A (Recommended for large SSG route sets): origin group (S3 primary, Lambda URL failover)

Behaviors:

1. `/assets/*` + `/.vite/*` -> **S3 origin**
2. `/_facetheory/data/*` -> **S3 origin** (if SSG hydration JSON files are emitted)
3. Default `/*` -> **Origin group**
  - primary: **S3 origin** (SSG HTML keys)
  - failover: **Lambda URL origin** (SSR + ISR) on 403/404 misses

This requires a viewer-request CloudFront Function that:
- rewrites extensionless routes to the S3 HTML key shape (commonly `.../index.html`)
- copies the original viewer URI into a header (example: `x-facetheory-original-uri`) so SSR can route correctly on failover

Pros:
- scales to large SSG route sets (no per-route behaviors)

Cons:
- static + dynamic share the same **cache policy** and **origin request policy** at the default behavior; your SSR handler must be strict about cache headers (e.g. `cache-control: private, no-store`)
- requires explicit URI rewrite discipline

Reference stack:
- `infra/apptheory-ssg-isr-site/`

### Strategy B: explicit behaviors for known SSG routes (small route sets)

Behaviors (top to bottom):

1. `/assets/*` + `/.vite/*` -> **S3 origin**
2. `/_facetheory/data/*` -> **S3 origin**
3. Known static routes (SSG-first pages) -> **S3 origin**
4. Default `/*` -> **Lambda URL origin**

Notes:
- Keep static and dynamic origins separate so static hits do not traverse Lambda.
- Use Origin Access Control for S3.
- Use an origin request policy for Lambda that forwards only headers/cookies/query needed by app logic.

## Cache and Header Policy by Rendering Mode

### SSR (dynamic, request-dependent)

- Default response header recommendation:
  - `cache-control: private, no-store`
- If SSR output is anonymous and intentionally cacheable, use a bounded shared TTL (for example):
  - `cache-control: public, max-age=0, s-maxage=60, stale-while-revalidate=30, stale-if-error=300`
- If response includes `set-cookie`, do not cache at CloudFront.

### SSG (build-time static)

- HTML pages:
  - `cache-control: public, max-age=0, s-maxage=600` (or environment-specific value)
- Hashed assets (`/assets/*`):
  - `cache-control: public, max-age=31536000, immutable`
- Deploy updates should upload new hashed assets and invalidate changed HTML keys.

### ISR (blocking)

- FaceTheory runtime default helper (`blockingIsrCacheControl`) emits:
  - `cache-control: public, max-age=0, s-maxage=0, stale-if-error=<revalidateSeconds>, must-revalidate`
- Runtime ISR state marker header:
  - `x-facetheory-isr: miss | hit | wait-hit | stale`
- CloudFront should not treat ISR HTML as long-lived immutable content; freshness is runtime-controlled via metadata.

## ISR Request Flow

1. Request reaches Lambda URL behavior.
2. FaceTheory computes cache key (`tenant + route + params`).
3. Metadata lookup in DynamoDB:
   - fresh -> serve cached HTML pointer from S3
   - stale/miss -> attempt lease lock and regenerate
4. Regeneration writes HTML to S3 first, then atomically updates metadata pointer.
5. On regeneration failure, previous pointer stays valid; stale serve policy applies.

## Operational Checklist

- Enable CloudFront access logs and Lambda logs for request correlation.
- Confirm Lambda timeout is safely above worst-case streaming/SSR duration.
- Enforce viewer protocol policy (redirect HTTP to HTTPS).
- Configure WAF/rate-limiting at CloudFront as needed.
- Use separate S3 prefixes (or buckets) for:
  - immutable build assets
  - ISR objects
  - optional SSG output
- Runbook should include:
  - cache invalidation steps for SSG HTML changes
  - rollback procedure for Lambda + metadata table changes
