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
  - optional ISR HTML object storage (via `S3HtmlStore`)
- **DynamoDB table**
  - ISR metadata + lease/lock state (via `DynamoDbIsrMetaStore`)

## CloudFront Behaviors

Recommended path behaviors (top to bottom):

1. `/assets/*` + `/.vite/*` -> **S3 origin**
2. `/_facetheory/data/*` -> **S3 origin** (if SSG hydration JSON files are emitted)
3. Optional known static routes (for SSG-first pages) -> **S3 origin**
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
