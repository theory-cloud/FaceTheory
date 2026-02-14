# Vite SSR Example (Svelte)

Builds both:

- client assets + `manifest.json`
- server bundle entrypoint

Then runs FaceTheory SSR using the manifest to inject preload/CSS/asset tags and hydration bootstrap.

## Build

From `ts/`:

```bash
npm run example:vite:svelte:build
```

Outputs:

- `ts/examples/vite-ssr-svelte/dist/client/.vite/manifest.json`
- `ts/examples/vite-ssr-svelte/dist/client/assets/*`
- `ts/examples/vite-ssr-svelte/dist/server/entry-server.js`

## Run

```bash
npm run example:vite:svelte:serve
```

Then open `http://localhost:4176/`.
