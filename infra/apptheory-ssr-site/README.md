# FaceTheory Deployment Infra Example

This folder contains a code-local reference stack for CloudFront plus S3 plus Lambda Function URL SSR using `@theory-cloud/apptheory-cdk`.

Canonical operator guidance lives under [`../../docs/cdk/README.md`](../../docs/cdk/README.md).

## What This Stack Provisions

- private S3 storage for assets
- Lambda Function URL origin with response streaming and explicit `AWS_IAM` auth
- CloudFront behaviors for assets, Vite manifests, SSG hydration data, SSR hydration sidecars, and SSR HTML

## Local Commands

```bash
cd infra/apptheory-ssr-site
npm ci
npm test
```

`./.npmrc` sets npm's `allow-remote=root` policy for npm 12 compatibility
(npm 12 defaults to `allow-remote=none` and refuses the pinned
AppTheory/TableTheory release-tarball dependencies with EALLOWREMOTE).
That is intentionally narrower than `all`: only the URL dependencies
declared by this package's `package.json` may be fetched.

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
- Keep SSG strict-CSP sidecars (`/_facetheory/data/*`) on S3/static behaviors.
- Route SSR runtime hydration sidecars (`/_facetheory/ssr-data/*`) to the same Lambda/FaceApp handler that rendered the
  SSR HTML; do not point that prefix at S3.
- This reference stack intentionally does **not** forward viewer-supplied tenant headers such as `x-facetheory-tenant`.
- Same-origin mutating form actions belong on the Lambda/AppTheory path with `AWS_IAM` + CloudFront OAC intact. Mark
  URL-encoded forms with `data-facetheory-oac-form` and install `startAwsOacFormTransport()` rather than posting
  directly to the Function URL or weakening Function URL auth.
- Use this README for stack-local commands and folder context only.
