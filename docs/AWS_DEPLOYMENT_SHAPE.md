# AWS Deployment Shape (CloudFront + S3 + Lambda URL)

This document describes the recommended production topology for FaceTheory apps and the cache behavior split for
SSR/SSG/ISR.

## Reference Topology

- **CloudFront distribution** (single public entrypoint)
  - **Origin A: S3** for static client assets and prebuilt static pages
  - **Origin B: Lambda Function URL** for SSR + ISR regeneration paths
- **S3 bucket(s)**
  - immutable client assets (Vite output)
  - optional SSG HTML output and strict-CSP hydration JSON sidecars under `/_facetheory/data/*`
  - optional ISR HTML object storage plus pointer-paired strict-CSP hydration sidecars (via `S3HtmlStore`; AWS SDK v3 client adapter: `@theory-cloud/facetheory/aws-s3`)
- **DynamoDB table**
  - ISR metadata + lease/lock state (via TableTheory `FaceTheoryIsrMetaStore` and FaceTheory adapter `@theory-cloud/facetheory/tabletheory`)

## AppTheory CDK (Recommended)

AppTheory CDK ships `AppTheorySsrSite`, which implements this topology and wires recommended environment variables onto
your SSR Lambda function.

When using `AppTheorySsrSite` in `ssg-isr` mode:
- use `staticPathPatterns` for cacheable extensionless HTML sections that should stay on S3
- use `directS3PathPatterns` for raw object/data paths such as `/.vite/*` and `/_facetheory/data/*`
- use `ssrPathPatterns` for same-origin dynamic routes that must bypass the S3-primary origin group and go straight to Lambda
- prefer an `AWS_IAM` Function URL origin for read-only SSR traffic rather than a public direct URL
- do not forward viewer-supplied tenant headers by default; derive tenancy from trusted request context when possible
- attach route-owned CSP headers from the Face response when strict no-inline CSP is required; CloudFront baseline
  security headers do not replace the per-route `content-security-policy` emitted by `buildStrictCspHeader()`

Mutating form routes behind Lambda Function URL OAC are dynamic routes. If an SSR, SSG, ISR, or SPA page renders a
same-origin form that performs `POST`, `PUT`, `PATCH`, or `DELETE`, route the form action path through `ssrPathPatterns`
so CloudFront sends it to Lambda/AppTheory instead of S3 or an origin group static hit. Keep the Lambda Function URL on
`AWS_IAM` + OAC and install FaceTheory's `startAwsOacFormTransport()` helper on forms marked with
`data-facetheory-oac-form`; native browser form posts cannot add the `x-amz-content-sha256` payload hash header that
CloudFront signs for mutating Lambda URL requests.

Treat `x-amz-content-sha256` as AWS signing plumbing only. It is not application authentication, authorization, CSRF
protection, or idempotency. Browser-generated `multipart/form-data` is intentionally out of scope for the URL-encoded
helper; marked multipart/text/plain forms fail closed until a separately scoped transport constructs and hashes the
exact body bytes itself. Setting `ssrUrlAuthType: NONE` is only an explicitly authorized, time-boxed rollback while a
broken deployment is repaired, and the rollback plan must restore `AWS_IAM` + OAC rather than making unauthenticated
Function URLs durable.

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
  - strict no-inline SSG routes with hydration data automatically externalize it to this path shape, for example
    `/about` -> `/_facetheory/data/about.json` and `/` -> `/_facetheory/data/index.json`
  - upload and invalidate SSG HTML and its matching hydration JSON together; a stale HTML document should not point to a
    data sidecar from a different build

See:
- `infra/apptheory-ssr-site/` for SSR + assets via AppTheory `AppTheorySsrSite`
- `infra/apptheory-ssg-isr-site/` for SSG origin-group failover + ISR (S3 + Dynamo)

## Strict CSP Hydration Routing

Strict no-inline CSP changes hydration transport but not the AWS topology. The page still arrives through the same
CloudFront distribution, and every bootstrap/data URL must resolve same-origin.

SSG sidecars:

- `buildSsgSite()` writes strict hydration JSON under `/_facetheory/data/*` when an SSG Face has `csp.inlineScripts === false` and hydration data.
- Route `/_facetheory/data/*` to S3 with the same origin access posture as the static HTML output.
- Serve sidecars as `application/json; charset=utf-8` with explicit cache headers. Their TTL should be no looser than
  the HTML that references them unless you deploy sidecars under immutable build-specific prefixes.
- Deploy and invalidate HTML and data sidecars as a pair so client hydration reads the same data used for the server render.

ISR sidecars:

- Strict ISR regeneration stores a hydration sidecar next to the generated HTML pointer in `S3HtmlStore`.
- The sidecar pointer is derived from the HTML pointer by replacing `.html` with `.hydration.json`, so stale HTML and
  stale hydration data remain paired through the same metadata pointer lifecycle.
- The browser-facing data URL stays on the page route and uses the opaque `__facetheory_isr_hydration` query parameter.
  That request must route to Lambda/FaceTheory, not directly to S3, so the runtime can validate and serve the pointer.
- Do not create public CloudFront behaviors that expose arbitrary ISR sidecar object keys. The runtime validates the
  pointer token and returns `404` for invalid or missing sidecars.

SSR sidecars:

- Per-request strict SSR data sidecars are host-defined. If a Face emits external hydration data for SSR, the `dataUrl`
  must be same-origin and routed to Lambda/AppTheory or another host-owned same-origin JSON endpoint that can reproduce
  the exact server-render data for that request.

OAC and navigation:

- `startAwsOacFormTransport({ navigationPolicy: "full-page" })` is the strict-CSP default because fetched CSP headers
  cannot become the active document policy during `document.write()` replacement.
- Choose `navigationPolicy: "spa"` only when the returned HTML is a FaceTheory document, the host accepts the SPA
  navigation contract, and external hydration data is loaded before DOM mutation.
- Route mutating action paths through `ssrPathPatterns`; do not let S3 static behaviors intercept form actions from SSG
  or ISR pages.

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
- Avoid modeling viewer-supplied tenant headers as part of the default origin request contract.

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
- Strict-CSP hydration JSON:
  - serve from S3 under `/_facetheory/data/*` with cache headers coordinated with the referencing HTML
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
2. FaceTheory verifies tenant partition safety. Requests carrying known tenant boundary headers (`x-tenant-id` or `x-facetheory-tenant`) fail closed unless `tenantKey` or a custom `cacheKey` is configured.
3. FaceTheory computes cache key (`tenant + route + params + query` by default).
4. Metadata lookup in DynamoDB:
   - fresh -> serve cached HTML pointer from S3
   - stale/miss -> attempt lease lock and regenerate
5. Strict-CSP regeneration writes the pointer-derived hydration sidecar before the HTML metadata commit.
6. Regeneration writes HTML to S3, then atomically updates metadata pointer.
7. On regeneration failure, previous pointer stays valid; stale HTML and stale hydration data stay paired.

Default tenant note:
- FaceTheory uses the `default` tenant unless `tenantKey` is configured.
- If tenant identity comes from auth/session/host mapping or a trusted header, provide an explicit `tenantKey` or custom `cacheKey`, or keep that route on SSR.
- Tenant-invariant ISR routes should not receive tenant-like headers; if they do, FaceTheory fails closed rather than sharing cached HTML through the implicit `default` tenant.

## Operational Checklist

- Enable CloudFront access logs and Lambda logs for request correlation.
- Confirm Lambda timeout is safely above worst-case streaming/SSR duration.
- Enforce viewer protocol policy (redirect HTTP to HTTPS).
- Configure WAF/rate-limiting at CloudFront as needed.
- Use separate S3 prefixes (or buckets) for:
  - immutable build assets
  - ISR objects
  - optional SSG output
- For strict-CSP routes, confirm:
  - every strict response carries the intended `content-security-policy` header
  - SSG sidecars under `/_facetheory/data/*` are reachable from CloudFront and same-origin
  - ISR hydration sidecar query URLs route to Lambda/FaceTheory and do not expose raw object keys
  - OAC form navigation policy is explicit when CSP-protected HTML responses are expected
- Runbook should include:
  - cache invalidation steps for SSG HTML changes
  - rollback procedure for Lambda + metadata table changes
