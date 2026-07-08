# Vite SSR Svelte External Library Host Example

## Demonstrates

This example shows the host side of consuming a packaged Svelte component library during SSR. The host imports the package component and CSS, emits Vite manifest assets, and hydrates with the same client entry that owns the library asset graph.

## Run

From `ts/`:

```bash
npm run example:vite:svelte:library:build
npm run example:vite:svelte:library:serve
```

Open `http://localhost:4177/`.

## Backs

- `docs/adapters/svelte.md` — external Svelte library host.
- `docs/core-patterns.md` — package CSS in the Vite client graph.
- Public package surfaces: Vite helpers from `@theory-cloud/facetheory` and Svelte adapter exports.
