# React Blocking ISR Example

## Demonstrates

This example renders a real React tree through FaceTheory blocking ISR. It uses
`createReactFace({ mode: 'isr' })` for the render, sets `revalidateSeconds` on the
returned `FaceModule`, and backs the cache with local in-memory HTML and metadata
stores. It is smoke-tested so the first request regenerates the React output
(`x-facetheory-isr: miss`) and the next request serves the identical cached bytes
(`x-facetheory-isr: hit`). Rendering is tenant-invariant: no tenant, auth, or
cookie headers are read while producing cached HTML.

When the stack environment is present, the same handler selects `S3HtmlStore`
plus the TableTheory ISR metadata and lease store instead: `FACETHEORY_ISR_BUCKET`
and `FACETHEORY_ISR_PREFIX` for the bucket, and `FACETHEORY_CACHE_TABLE_NAME` or
`APPTHEORY_CACHE_TABLE_NAME` for the table, with endpoints from the standard AWS
SDK variables. The local harness row `react-isr#real-storage` runs that mode on
DynamoDB Local and s3proxy and asserts the stored S3 object and DynamoDB item;
`docs/examples/local-harness.md` has the by-hand commands.

## Run

From `ts/`, run the smoke-covered handler with the unit suite:

```bash
node --import tsx --test --test-concurrency=1 test/unit/examples-react-isr.test.ts
```

The handler accepts Lambda Function URL shaped events and defaults to `/news/home`
when no path is supplied. A deployed stack sets `FACETHEORY_ISR_BUCKET` and
`FACETHEORY_ISR_PREFIX` for the S3 store, and `FACETHEORY_CACHE_TABLE_NAME` or
`APPTHEORY_CACHE_TABLE_NAME` for the TableTheory table; the handler then uses the
real stores without a code change. FaceTheory does not own that storage — HTML
lives in S3, and cache metadata plus regeneration leases live in TableTheory.

## Backs

- `docs/modes/isr.md` — blocking ISR local-development shape and store wiring.
- `docs/getting-started.md` — ISR cache-key and tenant-partition defaults.
- Public package surface: `createReactFace` from `@theory-cloud/facetheory/react`
  plus core ISR stores and `handleLambdaUrlEvent` from `@theory-cloud/facetheory`.
