# Blocking ISR Example

## Demonstrates

This example shows FaceTheory blocking ISR with explicit `revalidateSeconds`, local in-memory HTML and metadata stores, deterministic cache keys, and tenant-invariant rendering. It is smoke-tested so the first request regenerates and the next request hits the cached HTML.

## Run

From `ts/`, run the smoke-covered handler with the unit suite:

```bash
node --import tsx --test --test-concurrency=1 test/unit/examples-integrity.test.ts
```

The handler accepts Lambda Function URL shaped events and defaults to `/news/home` when no path is supplied. Production deployments should replace the in-memory stores with `S3HtmlStore` and the TableTheory-backed ISR metadata store.

## Backs

- `docs/modes/isr.md` — blocking ISR local-development shape.
- `docs/getting-started.md` — ISR cache-key and tenant-partition defaults.
- Public package surface: core ISR stores and `handleLambdaUrlEvent` from `@theory-cloud/facetheory`.
