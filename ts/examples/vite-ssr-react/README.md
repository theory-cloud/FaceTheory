# Vite SSR Example (React)

Builds both:

- client assets + `manifest.json`
- server bundle entrypoint

Then runs FaceTheory SSR using the manifest to inject preload/CSS tags and the hydration bootstrap module.

## Build

From `ts/`:

```bash
npm run example:vite:ssr:build
```

Outputs:

- `ts/examples/vite-ssr-react/dist/client/.vite/manifest.json`
- `ts/examples/vite-ssr-react/dist/client/assets/*`
- `ts/examples/vite-ssr-react/dist/server/entry-server.js`

## Run

```bash
npm run example:vite:ssr:serve
```

Then open `http://localhost:4174/`.
