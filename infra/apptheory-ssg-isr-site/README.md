# FaceTheory SSG And ISR Infra Example

This folder contains a code-local reference stack for CloudFront plus S3 plus DynamoDB plus Lambda Function URL deployment.

Canonical operator guidance lives under [`../../docs/cdk/README.md`](../../docs/cdk/README.md).

## What This Stack Demonstrates

- SSG hits served from S3 through CloudFront
- signed Lambda Function URL fallback for SSR and ISR
- distinct strict-CSP sidecar routing: SSG data on S3, SSR runtime sidecars on Lambda
- request correlation headers
- baseline security headers
- escaped reflected request context on the SSR 404 example page
- blocking ISR using FaceTheory HTML storage plus TableTheory metadata

## Build Requirement

This stack imports FaceTheory from `ts/dist/*`.

Before running stack tests or synthesis:

```bash
cd ../../ts
npm ci
npm run build
```

## Local Commands

```bash
cd infra/apptheory-ssg-isr-site
npm ci
npm test
npm run synth
```

`./.npmrc` sets npm's `allow-remote=root` policy for npm 12 compatibility
(npm 12 defaults to `allow-remote=none` and refuses the pinned
AppTheory/TableTheory release-tarball dependencies with EALLOWREMOTE).
That is intentionally narrower than `all`: only the URL dependencies
declared by this package's `package.json` may be fetched.

The same stack runs end to end on local backends through the sibling AppTheory
local runner and gateway. The runner synthesizes this app with its own
`node_modules/.bin/cdk`, starts DynamoDB Local and s3proxy, creates the cache
table from the template's key schema and TTL, deploys the bucket sources, and
serves the distribution on loopback:

```bash
make ts-build
~/.cache/facetheory-examples-local/apptheory-local/$(git -C ../AppTheory rev-parse HEAD)/apptheory-local run \
  --app infra/apptheory-ssg-isr-site \
  --profile scripts/local/apptheory-local-profile.json \
  --backend dynamodb --backend s3proxy \
  --port-base 8246
```

`make examples-local ONLY='infra/apptheory-ssg-isr-site#local-run'` runs the same
gateway and asserts the SSG HTML and assets from S3, the ISR miss/generation/hit
through the Function URL origin, the stored S3 object and DynamoDB metadata item,
the lease and TTL, the 403/404 refusals and the edge policy headers. Named gaps:
no CloudFront cache, edge network or TLS, no IAM/bucket policy evaluation, no
CORS, no viewer protocol enforcement, and a buffered streaming body.

## Deployment Notes

- The cache table's `pk`/`sk` keys and its `ttl` attribute come from
  TableTheory's FaceTheory ISR metadata and lease models; the stack test compares
  the synthesized table against those models so they cannot drift.
- The manifest deployment writes the Vite manifest at the assets bucket root.
  Root-prefix deployments must not prune: CDK's prune deletes every object the
  other deployments placed (`assets/*`, `_facetheory/data/*`). Only the
  prefix-scoped assets deployment sets `prune: true`.
- Use the canonical AWS deployment and operations docs for routing, cache, and smoke-test expectations.
- Keep SSG strict-CSP sidecars (`/_facetheory/data/*`) on S3/static behaviors.
- Route SSR runtime hydration sidecars (`/_facetheory/ssr-data/*`) directly to the same Lambda/FaceApp handler that
  rendered the SSR HTML; do not let the SSG rewrite or S3 origin group claim that reserved prefix.
- SSG or ISR pages may render forms, but same-origin mutating form action paths must route to Lambda/AppTheory through
  `ssrPathPatterns`; do not let those paths resolve to S3 static objects or direct Function URLs.
- Keep `AWS_IAM` + CloudFront OAC enabled for the Lambda Function URL and use FaceTheory's
  `data-facetheory-oac-form` / `startAwsOacFormTransport()` path for URL-encoded browser submissions.
- This reference stack intentionally avoids forwarding viewer-supplied tenant headers by default; derive tenant identity from trusted request context if a deployment needs it.
- The bundled ISR demo is tenant-invariant. Tenant-varying ISR deployments must configure FaceTheory `tenantKey` or a custom `cacheKey` after AppTheory/CloudFront has stripped viewer-supplied tenant headers and injected trusted tenant context.
- If tenant-like headers such as `x-tenant-id` or `x-facetheory-tenant` reach FaceTheory without that explicit partition, the ISR runtime fails closed before metadata lookup or HTML writes.
- Use this README for stack-local prerequisites and commands only.
