# FaceTheory H3 Infra Example: SSG + ISR (CloudFront + S3 + Dynamo + Lambda URL)

This example demonstrates FaceTheory H3 deployment semantics:

- **SSG hits avoid Lambda**: CloudFront uses an **origin group** with **S3 primary** and **Lambda Function URL fallback**.
- **SSG hydration JSON** lives under `/_facetheory/data/*` and is routed to S3.
- **ISR** uses:
  - FaceTheory `S3HtmlStore` for HTML objects
  - TableTheory `FaceTheoryIsrMetaStore` (DynamoDB) via FaceTheory’s adapter

## Routing Strategy

- `/*` -> **Origin group**
  - primary: S3 (static HTML keys)
  - failover: Lambda URL (SSR + ISR) on 403/404
- `/assets/*`, `/.vite/*`, `/_facetheory/data/*` -> **S3**

CloudFront Function `SsgRewrite` rewrites extensionless paths to `.../index.html` for S3 keys, and sets
`x-facetheory-original-uri` so the SSR Lambda can route on the original path when failover occurs.

## Build Requirement

This stack’s SSR handler imports FaceTheory from `ts/dist/*`.

Before running `npm test` or `npm run synth` in this folder:

```bash
cd ../../ts
npm install
npm run build
```

## Smoke Guide (After Deploy)

1. SSG should serve from S3 (no Lambda marker header):

```bash
curl -I https://<cloudfront-domain>/ssg-demo
```

Expect:
- no `x-facetheory-ssr` header
- a public `cache-control` (from S3 object metadata)

2. SSR should include the marker header:

```bash
curl -I https://<cloudfront-domain>/
```

Expect:
- `x-facetheory-ssr: 1`

3. ISR should include FaceTheory ISR state header:

```bash
curl -I https://<cloudfront-domain>/isr-demo
```

Expect:
- `x-facetheory-isr: miss|hit|wait-hit|stale`

To exercise contention, hit it in parallel after waiting > 5 seconds.

