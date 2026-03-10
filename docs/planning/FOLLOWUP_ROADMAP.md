# FaceTheory Followup Roadmap (Implementation Completion)

This roadmap turns the gaps identified during the docs vs implementation review into a concrete execution plan with
clear acceptance criteria.

It is intentionally **implementation-focused** (what to build next), while the existing docs remain the **vision/design**
(`docs/ARCHITECTURE.md`, `docs/planning/ROADMAP.md`, `docs/planning/ROADMAP_COMPONENT_LIBRARIES.md`).

## Guiding principles

- **Contract-first**: define and test the runtime contract before wiring AWS specifics.
- **Deterministic SSR**: stable head/style ordering; no “works once” rendering.
- **Streaming correctness**: headers must be finalized before the first body byte; head/styles must precede body content.
- **Production semantics**: cookies, multi-value headers, and error behavior are explicit and tested.
- **AWS-first, not AWS-only**: keep core portable; isolate AWS adapters behind small interfaces.

## Milestone R0 — Core HTTP contract + error semantics

Goal: make `FaceApp.handle()` robust under failure and clarify HTTP merging/streaming rules.

Work

- Add a single response assembly layer that:
  - normalizes and merges headers deterministically
  - merges cookies into `set-cookie` correctly (multi-value semantics)
  - guarantees “headers finalized before first body byte” in streaming mode
- Wrap `load()` and `render()` with deterministic error handling:
  - buffered: return a safe 500 HTML response
  - streaming: if no bytes sent yet, return a safe buffered 500; otherwise append a non-sensitive marker/footer and close
- Improve request normalization:
  - preserve query when `path` includes `?…` and `query` is not provided
  - add (optional) cookie parsing helper from request headers

Acceptance criteria

- Automated:
  - Unit tests: thrown `load()`/`render()` produces deterministic 500 responses (buffered + streaming).
  - Unit tests: multiple `set-cookie` values are never comma-joined; are preserved as separate header values.
  - Unit tests: `handle({ path: '/x?a=1&b=2' })` yields `ctx.request.query` with `a=['1']`, `b=['2']`.
  - Unit tests: streaming responses emit the document prefix/head before any body content.
- Non-functional:
  - Documented rules for header merging and cookie behavior (single place).

## Milestone R1 — AWS Lambda Function URL adapter (buffered + streaming)

Goal: replace the current “sketch” with a real Lambda Function URL integration.

Work

- Implement `lambdaUrlEventToFaceRequest()`:
  - method/path, querystring parsing, header normalization, cookies, body + base64
  - CloudFront/Lambda URL forwarding headers are preserved (no lossy normalization)
- Implement buffered response mapping `faceResponseToLambdaUrlResult()`:
  - status, headers (including multi-value), cookies, base64 flag
- Implement streaming response writing:
  - use `awslambda.streamifyResponse` (or wrap it behind a tiny interface for testability)
  - write headers once, then stream `AsyncIterable<Uint8Array>` to the response stream
- Provide a real example handler using the adapter (not pseudocode).

Acceptance criteria

- Automated:
  - Golden fixture tests for Lambda Function URL event shapes → `FaceRequest`.
  - Golden fixture tests for response mapping:
    - `set-cookie` is emitted correctly and never merged into a single comma-separated string.
    - binary responses set base64 correctly when requested.
  - Streaming tests:
    - first chunk contains `<!doctype` and the `<head>…</head><body>` prefix
    - headers are written exactly once before any body bytes
- Manual (smoke):
  - Deploy a minimal function URL and verify:
    - `/` returns HTML
    - unknown route returns 404
    - streaming route flushes chunks (TTFB visibly earlier than buffered)

## Milestone R2 — Vite manifest + asset injection completeness

Goal: make runtime asset injection cover real Vite outputs beyond modulepreload + CSS.

Work

- Extend `viteAssetsForEntry()` to optionally emit tags for `assets` (images/fonts/etc).
- Decide and document a policy for `dynamicImports`:
  - ignore (simplest) vs emit `prefetch` hints (future)
- Define and test ordering + dedupe rules across:
  - modulepreload
  - stylesheet
  - asset hints (if enabled)
- Ensure `base` supports:
  - root (`/`)
  - subpath (`/portal/`)
  - absolute CDN base (`https://cdn.example.com/portal/`)

Acceptance criteria

- Automated:
  - Unit tests covering `assets` handling, ordering, and dedupe.
  - Integration test: Vite SSR example renders and every injected file exists in `dist/client`.
- Manual:
  - Serve the example behind a non-root base path and verify asset links resolve.

## Milestone R3 — SSG (build-time static generation)

Goal: implement `mode:'ssg'` end-to-end and produce deployable static artifacts.

Work

- Define build-time SSG API/CLI that:
  - enumerates faces with `mode:'ssg'`
  - calls `generateStaticParams()` for param routes
  - renders HTML (and optional hydration JSON) deterministically
  - writes files using a well-defined route→path mapping
- Define output conventions:
  - trailing slash/index.html policy
  - 404 fallback behavior for static hosting
  - manifest location/format expectations for asset injection
- Provide an example SSG app and a small static server script for local verification.

Acceptance criteria

- Automated:
  - Tests: static + param routes produce expected file paths and deterministic content across runs.
  - Tests: “no network during SSG” guard (fails if `fetch` is called unless explicitly mocked/allowed).
- Manual:
  - Serve the output directory via a static file server and verify pages load without the SSR origin.

## Milestone R4 — ISR (blocking) with S3 + DynamoDB (TableTheory)

Goal: implement `mode:'isr'` with correctness-first semantics (“blocking ISR”).

Work

- Define storage interfaces and provide implementations:
  - `HtmlStore`: write/read HTML bodies (S3 in prod; in-memory for tests)
  - `IsrMetaStore`: metadata + lock/lease (DynamoDB/TableTheory in prod; in-memory for tests)
- Implement ISR behavior:
  - cache keys (route + params + tenant partitioning)
  - freshness tracking (`generatedAt`, `revalidateSeconds`)
  - lock/lease for regeneration to avoid stampedes
  - safe pointer update semantics (never serve partial/corrupt HTML)
  - define failure policy (serve stale vs error)
- Add cache header helpers aligned with ISR semantics and CloudFront behavior.

Acceptance criteria

- Automated:
  - Concurrency tests: N parallel requests to a stale page trigger exactly 1 regeneration; others wait or serve stale per
    the documented policy.
  - Failure tests:
    - regeneration throws → cache pointer remains valid
    - lock expiry/lease behavior does not deadlock regeneration
  - Tests: DynamoDB metadata items never store full HTML bodies (only pointers/metadata).
- Manual (smoke):
  - Deploy ISR example:
    - first request generates and stores
    - subsequent requests serve cached quickly
    - after `revalidateSeconds`, regeneration occurs safely under concurrent load

## Milestone R5 — Streaming + CSS-in-JS “late style” strategy

Goal: make streaming SSR style emission robust with Suspense/async boundaries.

Work

- Choose and document a default strategy (and make it configurable):
  - A: shell-only styles (fastest TTFB; strict constraints)
  - B: style prepass (most robust; higher CPU)
  - C: delay until “all ready” (robust; reduced streaming benefit)
- Implement the chosen strategy for Ant Design + Emotion integrations.
- Add contract tests that simulate “styles appear after shell” scenarios.

Acceptance criteria

- Automated:
  - Test: a Suspense/async boundary that emits new styles after shell still results in required styles being present
    before the first body bytes (per the chosen strategy).
  - Test: CSP nonce is applied to all emitted inline styles/scripts in streaming mode.
- Manual:
  - Simple benchmark notes: buffered vs streaming TTFB locally, so the tradeoff is explicit.

## Milestone R6 — Vue + Svelte parity beyond “hello world”

Goal: move Vue/Svelte from baseline SSR to a reusable parity story.

Work

- Define a minimal parity target for v1:
  - head tag collection
  - style tag collection
  - hydration payload emission
  - asset injection via the same Vite helpers where possible
- Add a UI integration hook pattern for Vue/Svelte similar to React’s `UIIntegration`.
- Provide one Vue and one Svelte example that uses:
  - head/style emission
  - Vite manifest asset injection
  - hydration bootstrap (where supported)

Acceptance criteria

- Automated:
  - Contract tests: Vue/Svelte adapters return deterministic head/style ordering and support CSP nonce application.
  - Example build tests: Vue/Svelte examples build and SSR-render without missing assets.
- Manual:
  - Run examples and confirm no hydration warnings for the basic fixture pages.

## Milestone R7 — Docs + examples reflect reality

Goal: remove “planning-only” drift and make the repo self-explanatory to new contributors.

Work

- Update the top-level `README.md` to:
  - accurately describe what is implemented vs planned
  - list how to run tests and examples
- Add an “AWS deployment shape” doc for:
  - CloudFront + S3 assets + Lambda URL SSR origin
  - recommended cache behaviors for SSR/SSG/ISR
- Ensure each milestone above has:
  - a runnable example and/or
  - automated tests proving the acceptance criteria

Acceptance criteria

- Automated:
  - CI (or local) command set exists and is documented (`npm test`, example build, etc.).
- Manual:
  - A new developer can follow docs to run at least one buffered SSR example, one streaming SSR example, and one Vite SSR
    example end-to-end.

## Suggested execution order

1) R0 (core semantics) → 2) R1 (Lambda URL adapter) → 3) R2 (assets) → 4) R3 (SSG) → 5) R4 (ISR) → 6) R5 (streaming robustness)
→ 7) R6 (Vue/Svelte parity) → 8) R7 (docs polish).
