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
- This reference stack intentionally avoids forwarding viewer-supplied tenant headers by default; derive tenant identity from trusted request context if a deployment needs it.
- Use this README for stack-local prerequisites and commands only.
