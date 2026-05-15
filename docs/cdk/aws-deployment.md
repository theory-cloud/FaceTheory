# FaceTheory AWS Deployment Shape

This document captures the supported production topology and the request-routing assumptions behind the canonical AWS guidance.

## Recommended Topology

FaceTheory's supported production shape is:
- CloudFront as the public entrypoint
- S3 for static assets and optional SSG output
- Lambda Function URL for dynamic SSR and ISR regeneration
- DynamoDB metadata storage when using blocking ISR through TableTheory

## Origin Layout

Primary components:
- S3 bucket for hashed assets and optional SSG HTML output
- Lambda Function URL origin for SSR and ISR
- Optional S3 bucket or prefix for ISR HTML objects
- DynamoDB table for ISR metadata and lease state

Recommended static paths:
- `/assets/*`
- `/.vite/*`
- `/_facetheory/data/*`

## AppTheory CDK Wiring

The reference stacks use AppTheory CDK and wire these runtime conventions:

| Variable | Meaning |
|---|---|
| `APPTHEORY_ASSETS_BUCKET` | Assets bucket name |
| `APPTHEORY_ASSETS_PREFIX` | Assets prefix |
| `APPTHEORY_ASSETS_MANIFEST_KEY` | Vite manifest key |
| `APPTHEORY_CACHE_TABLE_NAME` | Metadata table alias |
| `FACETHEORY_CACHE_TABLE_NAME` | Metadata table alias |
| `CACHE_TABLE_NAME` | Metadata table alias |
| `CACHE_TABLE` | Metadata table alias |
| `FACETHEORY_ISR_BUCKET` | ISR HTML bucket |
| `FACETHEORY_ISR_PREFIX` | ISR HTML prefix |

Reference-stack stance:
- prefer a CloudFront-signed `AWS_IAM` Function URL origin for read-only SSR traffic
- do not model viewer-supplied tenant-header passthrough as the default copy-paste shape
- keep same-origin mutating form action paths on Lambda/AppTheory behaviors, usually through `ssrPathPatterns`
- use FaceTheory's marked URL-encoded OAC form helper for browser forms that submit through Lambda Function URL OAC

### Mutating Forms Behind Lambda Function URL OAC

`AppTheorySsrSite` keeps the Lambda Function URL origin protected by `AWS_IAM` and CloudFront Lambda URL OAC. Browser
forms that submit mutating methods cannot attach the `x-amz-content-sha256` header that CloudFront must sign for the
exact payload bytes, so native form POSTs can fail before the request reaches AppTheory or FaceTheory.

Supported contract:

- render the form action as a same-origin CloudFront path, never a direct Lambda Function URL
- route the action path to Lambda through `ssrPathPatterns` even when the page containing the form is SSG or ISR
- mark URL-encoded forms with `data-facetheory-oac-form`
- install `startAwsOacFormTransport()` from a client bootstrap module
- keep app authentication, authorization, CSRF, idempotency, and business validation in application-owned code

The helper hashes the exact `application/x-www-form-urlencoded` bytes it sends and adds `x-amz-content-sha256` for AWS
signing. It fails closed for marked multipart, text/plain, unknown encodings, cross-origin actions, unsafe redirect
handling, and default document replacement of CSP-protected HTML responses. Do not turn `ssrUrlAuthType` to `NONE` as a
durable solution; use it only as an explicitly authorized temporary rollback with an owner and removal date.

## CloudFront Behavior Options

Choose between these patterns based on how many SSG routes you have and whether you want static misses to fail over to Lambda automatically.

### Strategy A: Origin Group For Large SSG Route Sets

Use:
- S3 as primary
- Lambda Function URL as failover on `403` or `404`

This is useful when:
- many extensionless SSG routes should avoid Lambda

Requirements:
- rewrite extensionless paths to S3 HTML keys
- preserve the original viewer path for Lambda failover routing
- keep SSR cache headers explicit and conservative
- when using `AppTheorySsrSite`, treat `staticPathPatterns` as HTML sections, `directS3PathPatterns` as raw data/object paths, and `ssrPathPatterns` as Lambda-only dynamic routes
- if tenant identity matters, derive it from trusted context instead of forwarding raw viewer tenant headers by default

### Strategy B: Explicit Static Behaviors

Use:
- dedicated S3 behaviors for known static routes
- Lambda Function URL as the default behavior

This is useful when:
- the static route set is small and predictable

Notes:
- use Origin Access Control for S3
- forward only headers/cookies/query actually required by app logic
- avoid modeling viewer-supplied tenant headers as part of the default origin request contract

## Cache Policy By Rendering Mode

SSR:
- default to `cache-control: private, no-store`
- do not cache responses that set cookies

SSG:
- HTML can use bounded shared caching
- hashed assets should be long-lived and immutable

ISR:
- use FaceTheory's blocking ISR cache helper semantics
- observe `x-facetheory-isr` on responses
- do not treat ISR HTML as immutable static content

## ISR Storage Notes

- `S3HtmlStore.keyPrefix` controls the physical object prefix
- `htmlPointerPrefix` controls the logical pointer prefix stored in metadata
- Do not duplicate the same non-empty prefix in both places unless that layout is intentional

## Reference Stacks

These stacks are implementation references for the documented topology rather than separate contract surfaces.

- `infra/apptheory-ssr-site/` for CloudFront plus S3 plus Lambda URL SSR
- `infra/apptheory-ssg-isr-site/` for SSG failover and blocking ISR
