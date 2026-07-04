# React Streaming SSR Example

## Demonstrates

This example shows React streaming SSR through `createReactStreamFace()` and `FaceApp.handle()`. FaceTheory emits headers and document head before streamed body chunks while preserving deterministic head and style boundaries.

## Run

From `ts/`:

```bash
npm run example:streaming:serve
```

Open `http://localhost:4173/`.

## Backs

- `docs/adapters/react.md` — minimal React streaming SSR reference.
- `docs/api-reference.md` — React adapter export surface.
- Public package surfaces: `@theory-cloud/facetheory` and `@theory-cloud/facetheory/react`.
