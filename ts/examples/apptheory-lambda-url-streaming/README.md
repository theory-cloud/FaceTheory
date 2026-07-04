# AppTheory Lambda URL Streaming Example

## Demonstrates

This example wires a FaceTheory SSR app through AppTheory's Lambda Function URL streaming runtime. It shows the public `@theory-cloud/facetheory/apptheory` adapter, AppTheory route registration, direct streaming HTML, and catch-all route handling without reaching around either framework boundary.

## Run

From `ts/`, run the smoke-covered handler with the unit suite:

```bash
node --import tsx --test --test-concurrency=1 test/unit/examples-integrity.test.ts
```

To use the handler in a local or bundled Lambda entry, import `handler` from `examples/apptheory-lambda-url-streaming/handler.ts` after installing this workspace's dependencies.

## Backs

- `docs/integrations/apptheory.md` — AppTheory integration entrypoint and example reference.
- `docs/core-patterns.md` — AppTheory Lambda Function URL streaming pattern.
- Public package surface: `@theory-cloud/facetheory/apptheory`.
