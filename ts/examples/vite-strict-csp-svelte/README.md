# Strict CSP Vite SSR Example (Svelte)

Canonical strict-CSP Svelte/Vite FaceTheory example.

It demonstrates:

- external Vite CSS and asset injection via manifest head tags;
- same-origin module bootstrap;
- external FaceTheory hydration JSON via `<link rel="facetheory-hydration">`;
- strict no-inline CSP render validation (`inlineScripts:false`, `inlineStyles:false`, `rawHead:false`);
- deterministic server/client hydration data equivalence.

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

Then open `http://localhost:4178/`.
