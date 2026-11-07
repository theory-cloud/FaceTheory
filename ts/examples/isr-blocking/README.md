# Blocking ISR Example

## Demonstrates

This example shows FaceTheory blocking ISR with explicit `revalidateSeconds`, local in-memory HTML and metadata stores, deterministic cache keys, and tenant-invariant rendering. It is smoke-tested so the first request regenerates and the next request hits the cached HTML.

The same handler selects real storage when the stack environment is present:
`FACETHEORY_ISR_BUCKET` plus `FACETHEORY_ISR_PREFIX` back an `S3HtmlStore`, and
`FACETHEORY_CACHE_TABLE_NAME` (or `APPTHEORY_CACHE_TABLE_NAME`) backs the
TableTheory ISR metadata and lease store. The endpoints come from the standard
AWS SDK variables. With none of those variables set, the in-memory stores above
remain the default, so the unit tests are unchanged. The local harness row
`isr-blocking#real-storage` runs this mode against DynamoDB Local and s3proxy and
asserts the stored S3 object and DynamoDB item; `docs/examples/local-harness.md`
shows the by-hand commands.

## Run

From `ts/`, run the smoke-covered handler with the unit suite:

```bash
node --import tsx --test --test-concurrency=1 test/unit/examples-integrity.test.ts
```

The handler accepts Lambda Function URL shaped events and defaults to `/news/home` when no path is supplied. A deployed stack sets the bucket and cache-table variables, and the handler then uses the real stores without a code change.

## Backs

- `docs/modes/isr.md` — blocking ISR local-development shape.
- `docs/getting-started.md` — ISR cache-key and tenant-partition defaults.
- Public package surface: core ISR stores and `handleLambdaUrlEvent` from `@theory-cloud/facetheory`.
