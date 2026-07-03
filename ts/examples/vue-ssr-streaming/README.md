# Vue Streaming SSR Example

From `ts/`:

```bash
npm run example:vue:streaming:serve
```

Open `http://localhost:4176/`.

This path exercises Vue streaming SSR through `FaceApp.handle()`: FaceTheory emits the document head before the streamed Vue body and preserves the same `AsyncIterable<Uint8Array>` response contract as other streaming Faces.
