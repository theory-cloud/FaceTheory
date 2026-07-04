# Vue Streaming SSR Example

## Demonstrates

This example shows Vue streaming SSR through `createVueStreamFace()` and `FaceApp.handle()`. FaceTheory emits the document head before the streamed Vue body and preserves the shared `AsyncIterable<Uint8Array>` response contract.

## Run

From `ts/`:

```bash
npm run example:vue:streaming:serve
```

Open `http://localhost:4176/`.

## Backs

- `docs/adapters/vue.md` — Vue streaming SSR example.
- Public package surfaces: `@theory-cloud/facetheory` and `@theory-cloud/facetheory/vue`.
