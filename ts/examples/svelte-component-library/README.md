# Svelte Component Library Example

## Demonstrates

This example is a packaged Svelte UI library consumed by `vite-ssr-svelte-library`. It demonstrates the library-side package shape: exported component, CSS file, SVG asset, and package metadata that the host imports as a dependency instead of copying source files.

## Run

From `ts/`, run the host example that consumes this package:

```bash
npm run example:vite:svelte:library:build
npm run example:vite:svelte:library:serve
```

The library itself is typechecked by `npm run typecheck` through the examples include list.

## Backs

- `docs/adapters/svelte.md` — external Svelte library packaging shape.
- `docs/core-patterns.md` — packaged Svelte component library pattern.
- Reference surface: package-style Svelte library consumed by `ts/examples/vite-ssr-svelte-library/`.
