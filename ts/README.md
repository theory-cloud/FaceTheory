# FaceTheory (TypeScript)

This folder contains the initial TypeScript implementation skeleton for FaceTheory.

Planned integrations:
- AppTheory: request/response normalization and Lambda event wiring
- TableTheory: ISR metadata/locks via DynamoDB (HTML bodies stored in S3)

## Dev

```bash
cd ts
npm ci
npm test
```

## HTTP Semantics (R0)

- Response headers are normalized to lowercase keys and emitted with deterministic key ordering.
- `cookies` and `headers['set-cookie']` are merged into `set-cookie` multi-value headers without comma-joining values.
- `ctx.request.query` is parsed from `request.path` when the incoming request omits an explicit `query` object.
- `ctx.request.cookies` is available by default via cookie-header parsing, and can be overridden with `request.cookies`.
- Streaming responses finalize headers before body bytes; if streaming fails before the first body chunk, a buffered safe
  `500` HTML response is returned.

## Vite Manifest Policy (R2)

- `viteAssetsForEntry()` emits deterministic tags in this order: `modulepreload`, `stylesheet`, then optional asset hints.
- `includeAssets: true` enables hints for `manifest.assets` (images/fonts/audio/video as preload; unknown assets as prefetch).
- `dynamicImports` are intentionally ignored for now (`ignore` policy) to keep head output deterministic and avoid
  speculative prefetch noise.
- `base` supports root, subpath, and absolute CDN prefixes.

## SSG Policy (R3)

- Build API: `buildSsgSite({ faces, outDir, ... })` in `src/ssg.ts`.
- CLI: `npm run ssg -- --entry <module> --out <dir>` (entry module exports `faces`).
- Route-to-file convention:
  - `trailingSlash:'always'` (default): `/about` -> `about/index.html`
  - `trailingSlash:'never'`: `/about` -> `about.html`
- Static hosting fallback: when enabled, `404.html` is emitted (from `/404` if present, otherwise a safe default).
- Build manifest: `.facetheory/ssg-manifest.json`, with ordered page entries and expected Vite manifest path
  (`.vite/manifest.json`) for asset-injection-aware apps.

## ISR Policy (R4)

- Runtime API: `createFaceApp({ faces, isr: { ... } })` with ISR routes (`mode:'isr'`), implemented in `src/isr.ts`.
- Storage interfaces:
  - `HtmlStore` for HTML bodies (with `InMemoryHtmlStore` and `S3HtmlStore`).
  - `IsrMetaStore` for metadata + lock/lease (with `InMemoryIsrMetaStore` and `DynamoDbIsrMetaStore`).
- Blocking ISR behavior:
  - cache key includes tenant + route pattern + params (default tenant header: `x-facetheory-tenant`).
  - stale requests use a lease lock to ensure single-writer regeneration and safe pointer swaps.
  - regeneration failures keep the previous pointer valid and serve stale by default.
- Cache headers:
  - `blockingIsrCacheControl()` emits CloudFront-safe defaults (`max-age=0`, `s-maxage=0`, `must-revalidate`).
  - responses include `x-facetheory-isr` (`miss`, `hit`, `wait-hit`, `stale`) for runtime visibility.

## Streaming Style Strategy (R5)

- React streaming style strategy is configurable via `renderReactStream(..., { styleStrategy })`:
  - `all-ready` (default): wait for `onAllReady` before finalizing styles; robust with Suspense/async late styles.
  - `shell`: finalize at `onShellReady`; lower TTFB but late styles may miss head emission.
- Ant Design + Emotion integrations now follow the selected strategy automatically through integration finalization timing.
- Streaming CSP nonce coverage:
  - FaceTheory-applied `<style>/<script>` head tags are nonce-applied.
  - React streaming inline scripts (Suspense patches) are nonce-applied via `renderToPipeableStream({ nonce })`.
- Local benchmark note:
  - compare `styleStrategy:'shell'` vs default `all-ready` in the same route and record first-byte timing to make the
    robustness/latency tradeoff explicit.
