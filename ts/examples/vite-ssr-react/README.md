# Vite SSR React Example

## Demonstrates

This example builds a React SSR app with Vite client assets, a Vite server bundle, manifest-derived head tags, and a matching hydration bootstrap module. It is also the default FaceTheory Vite middleware dev-loop example.

## Run

From `ts/`:

```bash
npm run example:vite:ssr:build
npm run example:vite:ssr:serve
```

Open `http://localhost:4174/`.

For the dev loop, from `ts/examples/vite-ssr-react/` run:

```bash
npm run dev
```

## Backs

- `docs/adapters/react.md` — React Vite SSR example.
- `docs/getting-started.md` — Vite middleware dev loop.
- Public package surfaces: Vite helpers from `@theory-cloud/facetheory` and React adapter exports.
