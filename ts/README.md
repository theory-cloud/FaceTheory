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
