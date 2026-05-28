---
title: AppTheory integration
---

FaceTheory consumes AppTheory for serverless runtime composition and CDK construct wiring. AppTheory provides the Lambda runtime, middleware chain, and `AppTheorySsrSite` CDK construct that hosts a FaceTheory app behind CloudFront and Lambda Function URLs.

## Dependency direction

```
FaceTheory  ← you
     │
AppTheory (serverless runtime, CDK constructs)
     │
TableTheory (data layer)
     │
DynamoDB
```

FaceTheory imports from AppTheory; AppTheory does not import from FaceTheory. Cross-repo coordination is needed when a FaceTheory change requires a new AppTheory runtime or construct capability.

## Install

```bash
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v1.11.0/theory-cloud-apptheory-1.11.0.tgz
```

For CDK deployments add the CDK companion tarball:

```bash
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v1.11.0/theory-cloud-apptheory-cdk-1.11.0.tgz
```

## The AppTheory entry point

FaceTheory exposes `@theory-cloud/facetheory/apptheory` for AppTheory integration:

```typescript
import { /* AppTheory helpers */ } from '@theory-cloud/facetheory/apptheory';
```

See the [API Reference → Use AppTheory as the AWS entrypoint](../api-reference.md#use-apptheory-as-the-aws-entrypoint) section for the current exported surface.

## When to use AppTheory vs Lambda Function URL streaming directly

Use AppTheory when:

- You want a CDK construct that wires CloudFront, Lambda, S3 buckets, and OAC together.
- You need AppTheory's middleware chain (auth, observability, tenant resolution).
- You're deploying alongside other Theory Cloud services that already use AppTheory.

Use `createLambdaUrlStreamingHandler` directly when:

- You're hand-rolling the AWS deployment.
- You want the smallest possible cold-start footprint and don't need AppTheory's middleware.

## Examples in the repo

- `ts/examples/apptheory-lambda-url-streaming/` — FaceTheory app deployed through AppTheory's Lambda URL streaming wrapper.

## Related docs

- [AWS Deployment Shape]({{ '/aws-deployment-shape/' | relative_url }})
- [CDK Integration Guide]({{ '/cdk/' | relative_url }})
- [OAC mutating forms](../features/oac-forms.md)
- [Core Patterns → Use AppTheory for Lambda Function URL streaming](../core-patterns.md#pattern-use-apptheory-for-lambda-function-url-streaming)
