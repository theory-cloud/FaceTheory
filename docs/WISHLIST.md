# AppTheory / TableTheory Wishlist (to support FaceTheory on AWS)

This is a dependency-oriented wishlist: what FaceTheory will likely require from AppTheory/TableTheory (or adjacent
packages) to be production-ready on AWS while keeping portability and contract testing.

## AppTheory wishlist

### P0 (FaceTheory blockers)

- **Streaming responses (Lambda Function URL)**: a first-class, portable streaming response body contract (TS first),
  plus Lambda Function URL integration that can write streamed bytes (`text/html`, `text/event-stream`, etc).
- **Catch-all routes**: router support for `/{name+}` / `/{name*}` (must be terminal), with clear precedence rules so
  catch-alls don’t shadow specific routes.
- **Streaming-aware TestEnv**: deterministic tests that capture streamed chunks + final status/headers/cookies, alongside
  existing buffered response tests.

### P1 (high leverage)

- **HTML helpers**: `html(...)`, `htmlStream(...)`, and safe serialization helpers for embedding hydration payloads.
- **Response header/cookie semantics**: explicit merging rules for `set-cookie`, multi-value headers, and how they behave
  in streaming mode (headers must be finalized before body chunks).
- **Cache header helpers**: small utilities for `cache-control`, `etag`, `vary`, and “SSR vs SSG vs ISR” defaults.
- **CloudFront-aware request normalization**: convenience helpers for canonical origin URL reconstruction
  (`host`, `x-forwarded-proto`, `x-forwarded-host`) and client IP handling.

### P2 (broader AWS resource/event support)

AppTheory already covers multiple event types (HTTP, WebSockets, SQS, EventBridge, DynamoDB Streams). For parity with
Lift-era capabilities and to reduce “glue code” in apps:

- **ALB request/response shapes** (where useful).
- **Kinesis + SNS event normalization** (if targeting broader event-driven workloads).
- **Step Functions task token helpers** (optional; app teams often reimplement this).

## TableTheory wishlist

### P0 (FaceTheory ISR correctness)

- **Lease/lock helper patterns**: a small, canonical helper for distributed regeneration locks:
  - acquire with conditional write + lease expiry
  - refresh lease (optional)
  - release (best-effort)
- **Transactional update recipes**: documented patterns for “update metadata + write pointer” safely with DynamoDB
  transactions when needed.

### P1 (high leverage for caching + state)

- **TTL-first cache schema guidance**: recommended model shapes/roles for cache metadata tables (including TTL role).
- **Idempotency patterns**: documented patterns (and helpers if appropriate) for “exactly-once-ish” writes driven by
  request IDs (useful for regeneration and async revalidation).

## “AWS resource support” wishlist (where it should live)

Some FaceTheory needs are infrastructure-focused rather than runtime/ORM concerns. To avoid spreading CDK logic across
apps, consider a companion package (AppTheory-owned) that mirrors proven Lift CDK patterns but targets Lambda URLs:

- **CloudFront + S3 + Lambda URL pattern**: single distribution with:
  - S3 origin for immutable assets (`/assets/*`)
  - Lambda Function URL origin for SSR
  - OAC, custom domain (Route53 + ACM), logs, optional WAF
- **Build/deploy helpers**: conventions for uploading assets + manifest, and wiring runtime env vars
  (manifest location, bucket names, cache table name).
- **ISR plumbing**: optional “regeneration trigger” mechanism (Lambda Invoke async / EventBridge / SQS) for future
  stale-while-revalidate mode.
