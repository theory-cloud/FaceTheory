# React Buffered SSR Example

## Demonstrates

This example shows buffered React SSR through `createReactFace()` and `FaceApp.handle()`. It emits a complete HTML document without streaming so consumers can compare the buffered response contract with the streaming React example.

## Run

From `ts/`:

```bash
npm run example:buffered:serve
```

Open `http://localhost:4172/`.

## Backs

- `docs/adapters/react.md` — minimal React buffered SSR reference.
- `docs/api-reference.md` — React adapter export surface.
- Public package surfaces: `@theory-cloud/facetheory` and `@theory-cloud/facetheory/react`.
