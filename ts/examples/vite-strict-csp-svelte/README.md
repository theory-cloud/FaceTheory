# Strict CSP Vite SSR Example (Svelte)

Canonical strict-CSP Svelte/Vite FaceTheory example.

It demonstrates:

- external Vite CSS and asset injection via manifest head tags;
- same-origin module bootstrap;
- framework-owned SSR hydration sidecar JSON via `<link rel="facetheory-hydration">`
  under `/_facetheory/ssr-data/...`;
- strict no-inline CSP render validation (`inlineScripts:false`, `inlineStyles:false`, `rawHead:false`);
- deterministic server/client hydration data equivalence without an example-owned
  `/_facetheory/data/*` router.

## Build

From `ts/`:

```bash
npm run example:vite:svelte:strict-csp:build
```

Outputs:

- `ts/examples/vite-strict-csp-svelte/dist/client/.vite/manifest.json`
- `ts/examples/vite-strict-csp-svelte/dist/client/assets/*`
- `ts/examples/vite-strict-csp-svelte/dist/server/entry-server.js`

## Run

```bash
npm run example:vite:svelte:strict-csp:serve
```

Then open `http://localhost:4178/`. The local server forwards
`/_facetheory/ssr-data/...` requests to the same FaceTheory app that rendered
the page so the sidecar returns raw no-store JSON from the render-time payload.
