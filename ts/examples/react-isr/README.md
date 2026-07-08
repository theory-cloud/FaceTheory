# React Blocking ISR Example

## Demonstrates

This example renders a real React tree through FaceTheory blocking ISR. It uses
`createReactFace({ mode: 'isr' })` for the render, sets `revalidateSeconds` on the
returned `FaceModule`, and backs the cache with local in-memory HTML and metadata
stores. It is smoke-tested so the first request regenerates the React output
(`x-facetheory-isr: miss`) and the next request serves the identical cached bytes
(`x-facetheory-isr: hit`). Rendering is tenant-invariant: no tenant, auth, or
cookie headers are read while producing cached HTML.

## Run

From `ts/`, run the smoke-covered handler with the unit suite:

```bash
node --import tsx --test --test-concurrency=1 test/unit/examples-react-isr.test.ts
```

The handler accepts Lambda Function URL shaped events and defaults to `/news/home`
when no path is supplied. In production, replace the in-memory stores with an
`S3HtmlStore` for cached HTML and a TableTheory-backed ISR metadata store for cache
metadata and regeneration leases, wired from the Lambda environment (for example
`FACETHEORY_ISR_HTML_BUCKET` for the S3 bucket and `FACETHEORY_ISR_TABLE` for the
TableTheory table). FaceTheory does not own that storage — HTML lives in S3, and
cache metadata plus regeneration leases live in TableTheory.

## Backs

- `docs/modes/isr.md` — blocking ISR local-development shape and store wiring.
- `docs/getting-started.md` — ISR cache-key and tenant-partition defaults.
- Public package surface: `createReactFace` from `@theory-cloud/facetheory/react`
  plus core ISR stores and `handleLambdaUrlEvent` from `@theory-cloud/facetheory`.
