# FaceTheory Hardening, Hygiene, and Infra Roadmap (AppTheory-First)

This roadmap is for the next phase after `docs/FOLLOWUP_ROADMAP.md`: production hardening, repo hygiene, deeper
integration with `theory-cloud/AppTheory` where it already provides mature building blocks, and deployment
infrastructure for real AWS environments.

It complements:
- `docs/ARCHITECTURE.md` (system model)
- `docs/AWS_DEPLOYMENT_SHAPE.md` (CloudFront/S3/Lambda URL topology + cache guidance)
- `docs/ROADMAP.md` (milestone overview)
- `docs/WISHLIST.md` (cross-repo asks; may be revised as items land)
- `docs/UPSTREAM_RELEASE_PINS.md` (AppTheory/TableTheory versions pinned to GitHub release assets)

## Guiding principles

- **Don’t duplicate AppTheory**: prefer AppTheory’s proven AWS request normalization + streaming wiring when possible.
- **Keep FaceTheory core portable**: isolate AWS-specific code behind small interfaces (or an adapter layer).
- **Make infra testable**: CDK stacks should have snapshot tests and “smoke deploy” instructions.
- **Hygiene gates matter**: “green lint/typecheck/test” should mean the repo is shippable, not just “tests pass”.

## Scope

This roadmap intentionally includes work that lives in multiple repositories:
- **FaceTheory** (runtime + adapters + SSG/ISR logic + examples)
- **AppTheory** (runtime adapters and CDK constructs that FaceTheory should leverage)
- **TableTheory** (DynamoDB access patterns, if used for ISR metadata/locks)
- **App repos** (PayTheory portal or other apps) only when required for fixture coverage

Each milestone lists where the work belongs.

---

## H0 — Hygiene Baseline + Known Correctness Bugs

Goal: eliminate known correctness issues and make local/CI gates meaningful.

Work (FaceTheory)
- Status (as of 2026-02-14): DONE
- [x] Fix Lambda URL cookie duplication in response mapping.
  - Today: `FaceApp` duplicates set-cookies into both `headers['set-cookie']` and `response.cookies`, and the Lambda URL
    adapter merges both again.
  - References: `ts/src/app.ts`, `ts/src/lambda-url.ts`
- [x] Align router + SSG route syntax for catch-all routes.
  - AppTheory canonicalizes catch-all as `{name+}`; FaceTheory runtime currently special-cases `{proxy+}`/`{proxy*}`, while
    SSG planning treats `{name+}`/`{name*}` as catch-all.
  - Decide and document the single accepted syntax (or support both) and make runtime + SSG consistent.
  - References: `ts/src/router.ts`, `ts/src/ssg.ts`
- [x] Make `cd ts && npm run lint` pass (or split lint scopes so “core lint” is green).
  - Explicitly decide whether examples/tests must pass the same lint rules as `ts/src/`.
  - References: `ts/.eslintrc.cjs`, `ts/package.json`

Acceptance criteria
- `cd ts && npm run typecheck && npm test` stays green.
- `cd ts && npm run lint` is green (or a documented “lint:core”/“lint:all” split is green by default).
- Regression tests exist for:
  - Lambda URL cookie mapping (no duplicates)
  - Router/SSG catch-all parity

---

## H1 — AppTheory Runtime Integration (Optional Adapter)

Goal: stop re-implementing AppTheory’s AWS HTTP plumbing; provide a first-class integration path.

Motivation
- AppTheory already implements Lambda Function URL normalization and response streaming wiring:
  - Streaming handler entrypoint: `AppTheory ts/src/app.ts` (`createLambdaFunctionURLStreamingHandler`)
  - Streaming writer + deterministic capture: `AppTheory ts/src/internal/aws-lambda-streaming.ts`
  - Deterministic invoke helpers: `AppTheory ts/src/testkit.ts`

Work
- Add a FaceTheory-to-AppTheory adapter module (name TBD; examples):
  - `ts/src/apptheory/index.ts` in FaceTheory, or a separate package entrypoint if you want dependency isolation.
  - Converts:
    - AppTheory `Request` -> FaceTheory `FaceRequest`
    - FaceTheory `FaceResponse` -> AppTheory `Response` (`bodyStream` for streaming).
- Provide an example AWS handler that uses AppTheory’s streaming handler and invokes FaceTheory through the adapter.
- Add contract tests that prove:
  - Identical headers/cookies/status for buffered responses.
  - Streaming invariants: headers finalized before bytes; document prefix/head appear before body.

Acceptance criteria
- A runnable example uses AppTheory streaming wiring end-to-end (no direct use of FaceTheory `ts/src/lambda-url.ts`).
- Deterministic tests use AppTheory `TestEnv.invokeLambdaFunctionURLStreaming(...)` to assert chunk ordering and headers.

---

## H2 — Deployment Infra via AppTheory CDK (SSR + Assets)

Goal: ship a production-grade default AWS topology by leveraging AppTheory CDK constructs rather than reinventing infra.

Starting point (AppTheory)
- `AppTheorySsrSite` already implements the “CloudFront + S3 + Lambda Function URL” pattern FaceTheory recommends.
  - Reference: `AppTheory cdk/lib/ssr-site.ts`

Work (AppTheory CDK + FaceTheory docs/examples)
- Define the required build outputs and S3 layout for FaceTheory apps:
  - Client assets prefix (e.g. `/assets/*`)
  - Manifest key (Vite commonly emits `.vite/manifest.json`; ensure `assetsManifestKey` is configurable accordingly)
  - Server bundle entrypoint (Lambda handler)
- Add a reference CDK stack (location decision):
  - Option A: a FaceTheory “deployment example” that imports `@theory-cloud/apptheory-cdk` and uses `AppTheorySsrSite`
  - Option B: an AppTheory CDK example that specifically deploys a FaceTheory sample app
- Decide and document a runtime env contract for FaceTheory on AWS:
  - Use AppTheory-wired env vars where possible (`APPTHEORY_ASSETS_BUCKET`, `APPTHEORY_ASSETS_PREFIX`,
    `APPTHEORY_ASSETS_MANIFEST_KEY`, `FACETHEORY_CACHE_TABLE_NAME` when a cache table is configured)
  - Document any FaceTheory-specific env vars for ISR HTML storage/prefix if needed

Acceptance criteria
- `cdk synth` output is snapshotted (AppTheory CDK already uses snapshot tests; ensure a FaceTheory configuration is
  covered).
- A “deploy + curl” smoke guide exists and demonstrates:
  - CloudFront domain serves streamed HTML from the Lambda URL origin
  - `/assets/*` is served from S3 with long-lived caching

---

## H3 — SSG/ISR Deployment Semantics (CloudFront + S3 + Dynamo)

Goal: make SSG and ISR work end-to-end with explicit, testable caching semantics.

Work (FaceTheory + AppTheory CDK + optional TableTheory)
- Pick an SSG routing strategy that achieves “SSG hits avoid Lambda”:
  - Option A: CloudFront origin group (S3 primary for HTML keys, Lambda URL failover for misses)
  - Option B: explicit CloudFront behaviors for known SSG routes (manual or generated)
  - Document the chosen strategy and how it scales for large route sets
- Extend infra to support SSG hydration JSON:
  - `/_facetheory/data/*` routed to S3 (as described in `docs/AWS_DEPLOYMENT_SHAPE.md`)
- Provide “real” AWS client implementations for ISR stores (or an officially supported integration path):
  - `S3HtmlStoreClient` backed by AWS SDK v3 `S3Client`
  - `IsrMetaStore` backed by TableTheory `FaceTheoryIsrMetaStore` (DynamoDB)
- Add an end-to-end ISR example that uses:
  - `S3HtmlStore` + Dynamo-backed meta store
  - AppTheory CDK-provisioned bucket/table names via env vars

Acceptance criteria
- A deployed example demonstrates:
  - SSG pages served from S3 without invoking the SSR Lambda on cache hits
  - ISR regeneration correctness under concurrency (single-writer) and clear state headers (`x-facetheory-isr`)
- CloudFront caching/forwarding policy is consistent with `docs/AWS_DEPLOYMENT_SHAPE.md`

---

## H4 — Operational Hardening (Security, Observability, Limits)

Goal: ship production defaults that app teams can adopt without reverse engineering runtime/infra behavior.

Work (FaceTheory + AppTheory integration points)
- Observability:
  - Request ID propagation and correlation (align with AppTheory conventions when using AppTheory adapter)
  - Structured logs and minimal metrics:
    - SSR render duration
    - streaming readiness timing (shell/all-ready)
    - ISR regeneration count/waiters/stale serves
- Security:
  - CSP nonce conventions for SSR + hydration (including streaming mode)
  - Response headers policy guidance (security headers, caching headers)
  - Request size/timeouts/abort policy (Lambda timeout, React abort, streaming behavior)
- Runbooks:
  - deploy/rollback procedure (SSR Lambda + assets)
  - SSG cache invalidation strategy
  - ISR lock contention diagnostics

Acceptance criteria
- A production checklist exists in docs and matches what the example infra actually provisions.
- Examples emit stable, parseable logs/headers that can be used for dashboards and incident triage.

---

## Suggested execution order

`H0` -> `H1` -> `H2` -> `H3` -> `H4`
