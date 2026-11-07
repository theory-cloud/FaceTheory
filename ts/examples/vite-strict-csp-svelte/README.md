# Strict CSP Vite SSR Svelte Example

## Demonstrates

This example renders Svelte + Vite SSR under FaceTheory's strict no-inline CSP path. It uses external CSS/assets, same-origin module bootstrap, framework-owned SSR hydration sidecar JSON, and strict render validation without inline scripts, inline styles, or raw head output.

The sidecar store defaults to memory. When the stack environment is present
(`FACETHEORY_ISR_BUCKET` and `FACETHEORY_ISR_PREFIX`, plus
`FACETHEORY_CACHE_TABLE_NAME` or `APPTHEORY_CACHE_TABLE_NAME`), the same server
selects `S3HtmlStore`, and the local harness row
`vite-strict-csp-svelte#real-storage` asserts the stored sidecar objects on
s3proxy. The SSR sidecar store has no metadata model, so no DynamoDB item is
written; the row asserts the shared ISR table stays empty. See
`docs/examples/local-harness.md`.

## Run

From `ts/`:

```bash
npm run example:vite:svelte:strict-csp:build
npm run example:vite:svelte:strict-csp:serve
```

Open `http://localhost:4178/`. The server forwards `/_facetheory/ssr-data/...` to the same FaceTheory app so the sidecar returns no-store JSON from the render-time payload.

## Backs

- `docs/features/strict-csp.md` — strict CSP delivery.
- `docs/features/ssr-hydration-sidecars.md` — SSR hydration sidecars.
- `docs/core-patterns.md` — strict no-inline CSP with external hydration.
