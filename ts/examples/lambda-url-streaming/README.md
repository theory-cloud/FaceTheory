# Lambda URL Streaming Example

## Demonstrates

This example wires FaceTheory directly to AWS Lambda Function URL streaming through `createLambdaUrlStreamingHandler`. It keeps the Lambda adapter surface small while preserving streamed SSR output and the catch-all route behavior used by Lambda URL deployments.

## Run

From `ts/`, typecheck it with the standard example compilation gate:

```bash
npm run typecheck
```

To use it as a Lambda entry, import `handler` from `examples/lambda-url-streaming/handler.ts` in a bundled function that runs in the AWS Lambda streaming runtime.

## Backs

- `docs/AWS_DEPLOYMENT_SHAPE.md` — Lambda Function URL deployment contract.
- `docs/api-reference.md` — `createLambdaUrlStreamingHandler` public export.
- Public package surface: core runtime export `@theory-cloud/facetheory`.
