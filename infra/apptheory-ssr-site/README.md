# FaceTheory Deployment Infra Example

This folder contains a code-local reference stack for CloudFront plus S3 plus Lambda Function URL SSR using `@theory-cloud/apptheory-cdk`.

Canonical operator guidance lives under [`../../docs/cdk/README.md`](../../docs/cdk/README.md).

## What This Stack Provisions

- private S3 storage for assets
- Lambda Function URL origin with response streaming
- CloudFront behaviors for assets, Vite manifests, optional hydration data, and SSR HTML

## Local Commands

```bash
cd infra/apptheory-ssr-site
npm ci
npm test
```

Update the template snapshot:

```bash
npm run test:update
```

Synthesize:

```bash
npm run synth
```

## Deployment Notes

- Deploy and smoke-test instructions should follow the canonical AWS docs first.
- Use this README for stack-local commands and folder context only.
