# Strict CSP Vite SSR React Example

## Demonstrates

This example renders React + Vite SSR under FaceTheory's strict no-inline CSP path.
It uses `createReactFace({ mode: 'ssr' })`, external CSS/assets from the Vite
manifest, a same-origin module bootstrap, a framework-owned SSR hydration sidecar
(external JSON), and strict render validation (`inlineScripts: false`,
`inlineStyles: false`, `rawHead: false`) with `buildStrictCspHeader()`. No inline
scripts, inline styles, or raw head output are emitted.

## Run

From `ts/`:

```bash
npm run example:vite:react:strict-csp:build
npm run example:vite:react:strict-csp:serve
```

Open `http://localhost:4179/`. The server forwards `/_facetheory/ssr-data/...` to
the same FaceTheory app so the sidecar returns no-store JSON from the render-time
payload. The build + strict-CSP render is smoke-tested in CI via
`test/unit/examples-strict-csp-react.test.ts`.

## Backs

- `docs/features/strict-csp.md` — strict CSP delivery.
- `docs/features/ssr-hydration-sidecars.md` — SSR hydration sidecars.
- `docs/core-patterns.md` — strict no-inline CSP with external hydration.
