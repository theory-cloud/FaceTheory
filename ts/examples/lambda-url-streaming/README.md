# Lambda URL Streaming Example

## Demonstrates

This example wires FaceTheory directly to AWS Lambda Function URL streaming through `createLambdaUrlStreamingHandler`. It keeps the Lambda adapter surface small while preserving streamed SSR output and the catch-all route behavior used by Lambda URL deployments.

## Run

`make examples-local` runs this handler in the digest-pinned official Lambda
Node image through the released `apptheory-local` v7.0.0 (pinned in
`scripts/local/examples-local.json`; no AppTheory checkout). It bundles this
example's own `handler.ts`, sends Function URL payload 2.0 events, and asserts
incremental chunk delivery and the catch-all route:

```bash
make examples-local ONLY=lambda-url-streaming#serve
```

The row is class L2. The warm session uses `--stream-chunks`, so the harness
observes a first chunk carrying the document start while the handler is still
running and the document end only in a later chunk; a fully buffered response
fails the assertion, and the harness self-test proves that negative control. The
managed Function URL edge (TLS, auth, edge network) is a docs/125 true limit and
the only named gap. The row runs against the released `apptheory-local` v7.0.0
pinned in the harness manifest.

From `ts/`, typecheck it with the standard example compilation gate:

```bash
npm run typecheck
```

To use it as a Lambda entry, import `handler` from `examples/lambda-url-streaming/handler.ts` in a bundled function that runs in the AWS Lambda streaming runtime.

## Backs

- `docs/AWS_DEPLOYMENT_SHAPE.md` — Lambda Function URL deployment contract.
- `docs/api-reference.md` — `createLambdaUrlStreamingHandler` public export.
- Public package surface: core runtime export `@theory-cloud/facetheory`.
