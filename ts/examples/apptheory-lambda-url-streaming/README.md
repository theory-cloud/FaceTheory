# AppTheory Lambda URL Streaming Example

## Demonstrates

This example wires a FaceTheory SSR app through AppTheory's Lambda Function URL streaming runtime. It shows the public `@theory-cloud/facetheory/apptheory` adapter, AppTheory route registration, direct streaming HTML, and catch-all route handling without reaching around either framework boundary.

## Run

`make examples-local` runs this handler in the digest-pinned official Lambda
Node image through the released `apptheory-local` v7.0.0 (pinned in
`scripts/local/examples-local.json`; no AppTheory checkout), with the pinned
`@theory-cloud/apptheory` v7.0.0 runtime. It bundles this example's own
`handler.ts`, sends Function URL payload 2.0 events, and asserts incremental
chunk delivery, the catch-all route and the example's 405 method refusal:

```bash
make examples-local ONLY=apptheory-lambda-url-streaming#serve
```

The row is class L2. The warm session uses `--stream-chunks`, so the harness
observes a first chunk carrying the document start while the handler is still
running and the document end only in a later chunk; a fully buffered response
fails the assertion, and the harness self-test proves that negative control. The
managed Function URL edge (TLS, auth, edge network) is a docs/125 true limit and
the only named gap. The row runs against the released `apptheory-local` v7.0.0
pinned in the harness manifest.

From `ts/`, run the smoke-covered handler with the unit suite:

```bash
node --import tsx --test --test-concurrency=1 test/unit/examples-integrity.test.ts
```

To use the handler in a local or bundled Lambda entry, import `handler` from `examples/apptheory-lambda-url-streaming/handler.ts` after installing this workspace's dependencies.

## Backs

- `docs/integrations/apptheory.md` — AppTheory integration entrypoint and example reference.
- `docs/core-patterns.md` — AppTheory Lambda Function URL streaming pattern.
- Public package surface: `@theory-cloud/facetheory/apptheory`.
