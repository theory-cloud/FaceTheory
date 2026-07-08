# Strict CSP Vite SSR Svelte Example

## Demonstrates

This example renders Svelte + Vite SSR under FaceTheory's strict no-inline CSP path. It uses external CSS/assets, same-origin module bootstrap, framework-owned SSR hydration sidecar JSON, and strict render validation without inline scripts, inline styles, or raw head output.

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
