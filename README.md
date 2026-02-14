# FaceTheory — Streaming SSR on AWS Lambda (Function URL)

FaceTheory is a TypeScript SSR runtime focused on AWS Lambda Function URL origins, deterministic head/style rendering, and
portable adapters across React, Vue, and Svelte.

## Status

Implemented in `ts/`:
- Core HTTP semantics + deterministic error behavior (`R0`)
- Lambda Function URL adapter (`R1`)
- Vite manifest asset injection (`R2`)
- SSG pipeline + CLI (`R3`)
- Blocking ISR with S3 + pluggable metadata/lease store interfaces (`R4`) (TableTheory for DynamoDB)
- Streaming late-style strategy + CSP nonce coverage (`R5`)
- Vue/Svelte parity hooks + Vite examples (`R6`)

Still app-specific / planned:
- Deployment infra and automation (CloudFront/S3/Lambda URL wiring)
  - Reference CDK stack: `infra/apptheory-ssr-site/` (AppTheory CDK `AppTheorySsrSite`)
- Operational policies and rollout conventions across environments

## Repository Layout

- `ts/` — implementation, tests, and runnable examples
- `docs/` — architecture, roadmap, and deployment guidance

## Quickstart

```bash
cd ts
npm ci
npm run typecheck
npm test
```

## Run Examples

From `ts/`:

- Buffered SSR (React): `npm run example:buffered:serve` then open `http://localhost:4172/`
- Streaming SSR (React): `npm run example:streaming:serve` then open `http://localhost:4173/`
- Vite SSR (React): `npm run example:vite:ssr:build && npm run example:vite:ssr:serve` then open `http://localhost:4174/`
- Vite SSR (Vue): `npm run example:vite:vue:build && npm run example:vite:vue:serve` then open `http://localhost:4175/`
- Vite SSR (Svelte): `npm run example:vite:svelte:build && npm run example:vite:svelte:serve` then open `http://localhost:4176/`

## Milestone Coverage

- `R0` — tests: `ts/test/unit/app.test.ts`, `ts/test/unit/streaming.test.ts`
- `R1` — tests: `ts/test/unit/lambda-url.test.ts`; example: `ts/examples/lambda-url-streaming/handler.ts`
- `R2` — tests: `ts/test/unit/vite.test.ts`, `ts/test/unit/vite-ssr-example.test.ts`; example: `ts/examples/vite-manifest-injection/handler.ts`
- `R3` — tests: `ts/test/unit/ssg.test.ts`; example: `ts/examples/ssg-basic/`
- `R4` — tests: `ts/test/unit/isr.test.ts`; example: `ts/examples/isr-blocking/handler.ts`
- `R5` — tests: `ts/test/unit/streaming.test.ts`; example: `ts/examples/react-ssr-streaming/`
- `R6` — tests: `ts/test/unit/vue.test.ts`, `ts/test/unit/svelte.test.ts`, `ts/test/unit/vite-ssr-vue-example.test.ts`, `ts/test/unit/vite-ssr-svelte-example.test.ts`; examples: `ts/examples/vite-ssr-vue/`, `ts/examples/vite-ssr-svelte/`

## Docs

- `docs/ARCHITECTURE.md` — runtime and system model
- `docs/AWS_DEPLOYMENT_SHAPE.md` — CloudFront/S3/Lambda URL deployment shape and cache policy guidance
- `docs/FOLLOWUP_ROADMAP.md` — implementation milestone checklist
- `docs/HARDENING_HYGIENE_INFRA_ROADMAP.md` — hardening + hygiene + AppTheory integration + deployment infra roadmap
- `docs/ROADMAP_COMPONENT_LIBRARIES.md` — component-library support plan
- `docs/ROADMAP.md` — high-level milestone roadmap
- `docs/UPSTREAM_RELEASE_PINS.md` — pinned AppTheory/TableTheory versions (GitHub release assets; no npm registry)
- `docs/WISHLIST.md` — AppTheory/TableTheory dependencies and asks
