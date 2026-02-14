# Vite SSR Example (Vue)

Builds both:

- client assets + `manifest.json`
- server bundle entrypoint

Then runs FaceTheory SSR using the manifest to inject preload/CSS/asset tags and hydration bootstrap.

## Build

From `ts/`:

```bash
npm run example:vite:vue:build
```

Outputs:

- `ts/examples/vite-ssr-vue/dist/client/.vite/manifest.json`
- `ts/examples/vite-ssr-vue/dist/client/assets/*`
- `ts/examples/vite-ssr-vue/dist/server/entry-server.js`

## Run

```bash
npm run example:vite:vue:serve
```

Then open `http://localhost:4175/`.
