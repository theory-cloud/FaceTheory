# FaceTheory Deployment Infra Example (AppTheory CDK)

This folder contains a reference CDK stack for deploying a **CloudFront + S3 + Lambda Function URL** SSR site using
`@theory-cloud/apptheory-cdk` `AppTheorySsrSite`.

It is meant to be the concrete counterpart to:
- `docs/AWS_DEPLOYMENT_SHAPE.md`
- `docs/HARDENING_HYGIENE_INFRA_ROADMAP.md` (H2)

## What This Provisions

- A private S3 bucket for static assets
- A Lambda Function URL origin (invoke mode: response streaming)
- A CloudFront distribution:
  - `/assets/*` routed to S3 (long-lived cache headers set at upload time in this example)
  - `/.vite/*` routed to S3 (manifest path shape)
  - `/_facetheory/data/*` routed to S3 (SSG hydration JSON path shape)
  - default `/*` routed to the SSR Lambda URL
- Runtime env wiring on the SSR function (via `AppTheorySsrSite`):
  - `APPTHEORY_ASSETS_BUCKET`
  - `APPTHEORY_ASSETS_PREFIX`
  - `APPTHEORY_ASSETS_MANIFEST_KEY`

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

Synthesize (library synth; does not require the CDK CLI):

```bash
npm run synth
```

## Deploy + Curl Smoke Guide

Prereqs:
- AWS credentials in your shell (`AWS_PROFILE` or env vars)
- CDK bootstrapped for your account/region

Deploy:

```bash
cd infra/apptheory-ssr-site
npm ci
npx --yes aws-cdk@2.1106.0 bootstrap
npx --yes aws-cdk@2.1106.0 deploy
```

After deploy, note the CloudFormation outputs:
- `CloudFrontDomainName`

Smoke checks (replace `<domain>`):

```bash
curl -i "https://<domain>/" | head -n 40
curl -I "https://<domain>/assets/entry.css"
curl -I "https://<domain>/assets/entry.js"
curl -i "https://<domain>/_facetheory/data/index.json"
```

Expected:
- `/` returns HTML that references `/assets/entry.css` and `/assets/entry.js`
- `/assets/*` responses include long-lived cache headers (example uses `max-age=31536000, immutable`)
- `/_facetheory/data/*` is routed to S3 (static)

## Using A Real FaceTheory App

This example uses a minimal inline SSR function.

For real FaceTheory apps, use AppTheory's streaming handler and route to FaceTheory via the adapter:
- `ts/src/apptheory/index.ts`
- `ts/examples/apptheory-lambda-url-streaming/handler.ts`

