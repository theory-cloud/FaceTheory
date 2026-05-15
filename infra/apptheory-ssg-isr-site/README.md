# FaceTheory SSG And ISR Infra Example

This folder contains a code-local reference stack for CloudFront plus S3 plus DynamoDB plus Lambda Function URL deployment.

Canonical operator guidance lives under [`../../docs/cdk/README.md`](../../docs/cdk/README.md).

## What This Stack Demonstrates

- SSG hits served from S3 through CloudFront
- signed Lambda Function URL fallback for SSR and ISR
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

## Deployment Notes

- Use the canonical AWS deployment and operations docs for routing, cache, and smoke-test expectations.
- SSG or ISR pages may render forms, but same-origin mutating form action paths must route to Lambda/AppTheory through
  `ssrPathPatterns`; do not let those paths resolve to S3 static objects or direct Function URLs.
- Keep `AWS_IAM` + CloudFront OAC enabled for the Lambda Function URL and use FaceTheory's
  `data-facetheory-oac-form` / `startAwsOacFormTransport()` path for URL-encoded browser submissions.
- This reference stack intentionally avoids forwarding viewer-supplied tenant headers by default; derive tenant identity from trusted request context if a deployment needs it.
- The bundled ISR demo is tenant-invariant. Tenant-varying ISR deployments must configure FaceTheory `tenantKey` or a custom `cacheKey` after AppTheory/CloudFront has stripped viewer-supplied tenant headers and injected trusted tenant context.
- If tenant-like headers such as `x-tenant-id` or `x-facetheory-tenant` reach FaceTheory without that explicit partition, the ISR runtime fails closed before metadata lookup or HTML writes.
- Use this README for stack-local prerequisites and commands only.
