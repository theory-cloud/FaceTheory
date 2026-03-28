# Vite SSR Example (Svelte External Library Host)

This example shows the recommended FaceTheory pattern for a packaged external Svelte UI library:

- import the package component from a package name
- import the package CSS from the client entry
- use `viteAssetsForEntry()` for stylesheet and asset tags
- use `viteHydrationForEntry()` so the hydrated client entry matches the SSR asset graph

## Build

From `ts/`:

```bash
npm run example:vite:svelte:library:build
```

Outputs:

- `ts/examples/vite-ssr-svelte-library/dist/client/.vite/manifest.json`
- `ts/examples/vite-ssr-svelte-library/dist/client/assets/*`
- `ts/examples/vite-ssr-svelte-library/dist/server/entry-server.js`

## Run

```bash
npm run example:vite:svelte:library:serve
```

Then open `http://localhost:4177/`.
