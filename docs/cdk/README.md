---
title: CDK Integration Guide
permalink: /cdk/
---

# FaceTheory CDK And AWS Notes

FaceTheory's paved AWS deployment path is **AppTheory `AppTheorySsrSite`**: CloudFront in front of S3 and a Lambda
Function URL, with FaceTheory rendering through a real `FaceApp`. The reference stacks in `infra/` are synth/test proof
for that shape; they are not evidence that this checkout was deployed to a live AWS account.

Use this page when you want one path from hello world to a CloudFront URL. Use
[AWS Deployment Shape](./aws-deployment.md) for the deeper routing, cache, CSP, OAC, and ISR rationale, and
[Operations Guide](./operations.md) for runbook posture.

## The end-to-end path

1. **Scaffold a real FaceTheory handler** — create a `FaceApp`, adapt it with `createAppTheoryFaceHandler`, and export
   an AppTheory Lambda Function URL streaming handler.
2. **Build client/static outputs** — place immutable assets under `assets/`, the Vite manifest at
   `.vite/manifest.json`, and optional SSG HTML / hydration sidecars in the S3 upload tree.
3. **Wrap it with `AppTheorySsrSite`** — let AppTheory own CloudFront, Function URL OAC, origin groups, request-id
   propagation, and runtime env wiring.
4. **Synthesize and test** — run the local stack tests/synth before touching AWS.
5. **Deploy deliberately** — only an operator with the intended AWS account/region credentials should run `cdk deploy`.
6. **Curl the CloudFront URL** — verify headers and route placement after the deploy. Do not claim live deployment proof
   unless those commands were actually run against the deployed distribution.

## 1. Scaffold the handler

The minimal SSR handler shape mirrors `infra/apptheory-ssr-site/src/handler.ts`:

```ts
import { createApp, createLambdaFunctionURLStreamingHandler } from "@theory-cloud/apptheory";
import { createFaceApp } from "@theory-cloud/facetheory";
import { createAppTheoryFaceHandler } from "@theory-cloud/facetheory/apptheory";

const faceApp = createFaceApp({
  faces: [
    {
      route: "/",
      mode: "ssr",
      render: () => ({
        headers: { "cache-control": "private, no-store" },
        head: { title: "Hello FaceTheory" },
        html: "<main><h1>Hello FaceTheory</h1></main>",
      }),
    },
  ],
});

const app = createApp();
const faceHandler = createAppTheoryFaceHandler({ app: faceApp });

app.get("/", faceHandler);
app.get("/{proxy+}", faceHandler);
app.handle("HEAD", "/", faceHandler);
app.handle("HEAD", "/{proxy+}", faceHandler);

export const handler = createLambdaFunctionURLStreamingHandler(app);
```

Keep consumer data fetching in `load(ctx)` or request handlers, and escape any caller-controlled HTML. Head tags go
through the FaceTheory head primitive (`head`, `headTags`, `styleTags`); do not emit ad-hoc document head strings in the
component tree.

## 2. Build assets and optional SSG output

A Vite-style build typically produces:

```text
deploy/
  assets/entry.<hash>.js
  assets/entry.<hash>.css
  .vite/manifest.json
  ssg/index.html                    # optional SSG output
  _facetheory/data/index.json        # optional strict-CSP SSG hydration data
```

The FaceTheory reference stacks keep explicit `BucketDeployment` resources for immutable assets, the Vite manifest, and
SSG HTML. This preserves cache-control differences while `AppTheorySsrSite` owns the CloudFront distribution. AppTheory
v1.17.0 does not yet expose per-deployment `distributionPaths` invalidation controls for those uploads; invalidate changed
HTML and hydration JSON paths in your deployment pipeline until that AppTheory gap is closed.

Local reference validation before any deploy:

```bash
cd infra/apptheory-ssr-site
npm ci
npm test

cd ../apptheory-ssg-isr-site
npm ci
npm test
```

## 3. Wrap with `AppTheorySsrSite`

### SSR-only hello world

```ts
import { CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { AppTheorySsrSite } from "@theory-cloud/apptheory-cdk";

const assetsBucket = new s3.Bucket(this, "AssetsBucket", {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  removalPolicy: RemovalPolicy.RETAIN,
});

const ssrFunction = new NodejsFunction(this, "SsrFunction", {
  runtime: lambda.Runtime.NODEJS_20_X,
  entry: "src/handler.ts",
  handler: "handler",
  timeout: Duration.seconds(10),
  memorySize: 512,
});

new s3deploy.BucketDeployment(this, "AssetsDeployment", {
  sources: [s3deploy.Source.asset("deploy/assets")],
  destinationBucket: assetsBucket,
  destinationKeyPrefix: "assets",
});

const site = new AppTheorySsrSite(this, "Site", {
  ssrFunction,
  ssrUrlAuthType: lambda.FunctionUrlAuthType.AWS_IAM,
  assetsBucket,
  assetsKeyPrefix: "assets",
  assetsManifestKey: ".vite/manifest.json",
  // Optional production edge controls:
  domainName: "app.example.com",
  certificateArn: "arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-0000-0000-000000000000",
  webAclId: "arn:aws:wafv2:us-east-1:111122223333:global/webacl/example/00000000-0000-0000-0000-000000000000",
});

new CfnOutput(this, "CloudFrontDomainName", {
  value: site.distribution.distributionDomainName,
});
```

`AWS_IAM` is the default Function URL posture; AppTheory adds Lambda URL Origin Access Control so viewers reach Lambda
through CloudFront, not through a public unauthenticated Function URL.

### SSG + blocking ISR

Use `SSG_ISR` mode when S3 should be the primary HTML origin and Lambda should handle SSR/ISR fallback on S3 `403`/`404`
misses:

```ts
import { AppTheoryDynamoTable, AppTheorySsrSite, AppTheorySsrSiteMode } from "@theory-cloud/apptheory-cdk";

const htmlStoreBucket = new s3.Bucket(this, "IsrBucket", {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  removalPolicy: RemovalPolicy.RETAIN,
});

const cacheTable = new AppTheoryDynamoTable(this, "CacheTable", {
  partitionKeyName: "pk",
  sortKeyName: "sk",
  timeToLiveAttribute: "ttl",
  removalPolicy: RemovalPolicy.RETAIN,
});

const site = new AppTheorySsrSite(this, "Site", {
  mode: AppTheorySsrSiteMode.SSG_ISR,
  ssrFunction,
  ssrUrlAuthType: lambda.FunctionUrlAuthType.AWS_IAM,
  assetsBucket,
  assetsKeyPrefix: "assets",
  assetsManifestKey: ".vite/manifest.json",
  htmlStoreBucket,
  htmlStoreKeyPrefix: "isr",
  isrMetadataTable: cacheTable.table,
  directS3PathPatterns: ["/.vite/*"],
  ssrPathPatterns: ["/actions/*"], // form actions, auth callbacks, and other dynamic routes
  domainName: "app.example.com",
  certificateArn: "arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-0000-0000-000000000000",
  webAclId: "arn:aws:wafv2:us-east-1:111122223333:global/webacl/example/00000000-0000-0000-0000-000000000000",
});
```

In `SSG_ISR` mode AppTheory automatically adds:

- an S3-primary / Lambda-fallback origin group for HTML routes;
- generated viewer-request rewrite logic for extensionless SSG paths;
- generated request-id propagation and viewer-response echo;
- direct S3 routing for `/_facetheory/data/*` SSG hydration sidecars;
- direct Lambda routing for `/_facetheory/ssr-data/*` SSR hydration sidecars;
- `APPTHEORY_ASSETS_*`, `FACETHEORY_ISR_*`, and ISR metadata table aliases on the SSR Lambda when those resources are
  supplied.

## 4. Synthesize, deploy, curl

Synthesize first:

```bash
npm run synth
# or your app's CDK command, for example:
npx cdk synth
npx cdk diff
```

Deploy only from the intended AWS account/region with reviewed credentials:

```bash
npx cdk deploy FaceTheoryHelloWorld --outputs-file cdk-outputs.json
```

After deployment, read the output and verify through CloudFront:

```bash
CLOUDFRONT_DOMAIN=$(jq -r '.FaceTheoryHelloWorld.CloudFrontDomainName' cdk-outputs.json)

curl -I "https://${CLOUDFRONT_DOMAIN}/"
curl -sS "https://${CLOUDFRONT_DOMAIN}/" | grep "Hello FaceTheory"
curl -I "https://${CLOUDFRONT_DOMAIN}/assets/entry.css"
```

For `SSG_ISR` stacks, add route-placement checks that match your app:

```bash
curl -I "https://${CLOUDFRONT_DOMAIN}/ssg-demo"      # expected S3/static cache headers when the SSG key exists
curl -I "https://${CLOUDFRONT_DOMAIN}/isr-demo"      # expected FaceTheory ISR headers from Lambda
curl -I "https://${CLOUDFRONT_DOMAIN}/_facetheory/data/index.json" # expected S3 strict-CSP SSG sidecar, if emitted
```

These commands are operator validation steps, not proof performed by this repository. A docs/stacks PR should report only
local synth/tests/docs-build proof unless it actually deployed with authorized AWS credentials.

## Reference stacks

- `infra/apptheory-ssr-site/` — SSR-only CloudFront + S3 assets + Lambda Function URL using a real FaceApp handler.
- `infra/apptheory-ssg-isr-site/` — `AppTheorySsrSiteMode.SSG_ISR`, S3-primary HTML origin group, Lambda fallback, and
  TableTheory-backed ISR metadata wiring.
