# FaceTheory Roadmap (planning)

This roadmap is organized as shippable milestones. The goal is to reach a production-capable **Lambda Function URL +
streaming SSR** stack with **SSG + ISR** support and adapters for React/Vue/Svelte.

## M0 — Planning baseline (docs)

- Architecture + decisions documented (`docs/ARCHITECTURE.md`).
- Roadmap and dependency wishlist documented (`docs/planning/ROADMAP.md`, `docs/planning/WISHLIST.md`).

## M1 — Minimal SSR (buffered) on Lambda Function URL

Deliverable: a FaceTheory “hello world” SSR app that returns HTML through AppTheory’s Lambda Function URL event support.

- AppTheory: solidify Lambda Function URL event normalization (TS runtime).
- FaceTheory: minimal `FaceModule` contract and router integration.
- Output: buffered HTML response, correct headers, basic 404 handling.

Acceptance:
- Local test harness can invoke Lambda URL event shape deterministically.
- Deployed Lambda URL returns HTML for `/` and 404 for unknown paths.

## M2 — Streaming SSR core

Deliverable: streaming response plumbing end-to-end.

- AppTheory: add a streaming response abstraction and Lambda Function URL “streaming handler” integration (TS first).
- FaceTheory: stream `<head>` quickly, then stream body chunks.
- Basic failure semantics: if streaming started, handle late errors predictably (abort vs footer).

Acceptance:
- Measurable early flush (TTFB improvement) for streaming-capable adapter.
- Works behind CloudFront without buffering regressions in basic tests.

## M3 — React adapter (streaming)

Deliverable: React SSR adapter with hydration and asset injection.

- Adapter: React 18 streaming SSR (`renderToPipeableStream` / web streams as available).
- Standardize hydration payload serialization + escaping.
- Asset manifest contract for scripts/styles/preloads.

Acceptance:
- React app hydrates on the client with data produced by `load(ctx)`.
- Streaming mode works on Lambda URL.

## M4 — Build pipeline (one toolchain, multi-adapter)

Deliverable: a build system that can produce:
- server bundle for Lambda
- client assets for S3
- manifest consumed by runtime

Recommendation: **Vite** as the common build interface (React/Vue/Svelte plugin ecosystem + SSR builds + manifest).

Acceptance:
- `build` emits server + client outputs and a manifest.
- Runtime injects correct asset tags for the chosen adapter.

## M5 — SSG

Deliverable: build-time static generation and deployment output.

- `generateStaticParams()` contract for enumerating pages.
- Build produces pre-rendered HTML (and optional JSON) artifacts.
- CloudFront/S3 behavior serves SSG pages without hitting Lambda when possible.

Acceptance:
- A set of pages can be generated at build time and served from S3.
- Fallback to Lambda SSR for non-prebuilt pages.

## M6 — ISR (blocking)

Deliverable: incremental regeneration with correctness-first semantics.

- Cache metadata + locks in DynamoDB via TableTheory.
- HTML body stored in S3; metadata points to object keys + freshness.
- Policy: “blocking ISR” (regenerate in-request when stale).

Acceptance:
- Stale pages regenerate safely with lock/lease behavior.
- No HTML stored in DynamoDB; only pointers/metadata.

## M7 — Vue + Svelte adapters

Deliverable: adapters that match the FaceTheory contract.

- Vue: stream where supported; otherwise buffer.
- Svelte: buffer (initially), with an upgrade path if/when streaming SSR is viable.

Acceptance:
- Same FaceTheory app contract works with each adapter (per-app selection).
- Hydration and asset injection behave consistently.

## M8 — Production hardening

- Cache headers strategy and CloudFront policies (SSR vs SSG vs ISR).
- Multi-tenant considerations (header/query extraction, cache key partitioning).
- Observability defaults (logs/metrics/traces) consistent with AppTheory.
- Security posture: CSP, cookies, origin handling, request size limits.
