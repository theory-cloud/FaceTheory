# Vite Manifest Injection Example

## Demonstrates

This example exercises FaceTheory's Vite manifest helpers without a full Vite dev server. It renders deterministic asset, preload, CSS, and hydration tags from a manifest-shaped object through the public package surface.

## Run

From `ts/`, typecheck it with the standard example compilation gate:

```bash
npm run typecheck
```

A test or host can import the handler from `examples/vite-manifest-injection/handler.ts` and invoke it with Lambda Function URL shaped events.

## Backs

- `docs/api-reference.md` — Vite and hydration helpers.
- `docs/core-patterns.md` — Vite manifest asset and hydration patterns.
- Public package surface: Vite helpers from `@theory-cloud/facetheory`.
