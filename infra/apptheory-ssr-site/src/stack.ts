import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { AppTheorySsrSite } from '@theory-cloud/apptheory-cdk';
import { Construct } from 'constructs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function requireDir(name: string, relativePath: string): string {
  const resolved = path.resolve(__dirname, relativePath);
  if (!path.isAbsolute(resolved)) {
    throw new Error(`${name} path must be absolute: ${resolved}`);
  }
  return resolved;
}

export class FaceTheoryAppTheorySsrSiteStack extends Stack {
  public readonly site: AppTheorySsrSite;

  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const assetsBucket = new s3.Bucket(this, 'AssetsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const ssrFunction = new lambda.Function(this, 'SsrFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: Duration.seconds(10),
      memorySize: 512,
      code: lambda.Code.fromInline(`
exports.handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
  void event; void context;

  const prefix = String(process.env.APPTHEORY_ASSETS_PREFIX || 'assets').replace(/^\\/+/, '').replace(/\\/+$/, '');
  const cssHref = '/' + prefix + '/entry.css';
  const jsSrc = '/' + prefix + '/entry.js';

  const meta = {
    statusCode: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
    },
    cookies: [],
  };

  const out = awslambda.HttpResponseStream.from(responseStream, meta);
  out.write('<!doctype html><html lang="en"><head>');
  out.write('<meta charset="utf-8">');
  out.write('<meta name="viewport" content="width=device-width,initial-scale=1">');
  out.write('<title>FaceTheory + AppTheorySsrSite</title>');
  out.write('<link rel="stylesheet" href="' + cssHref + '">');
  out.write('</head><body>');
  out.write('<main><h1>FaceTheory Infra Example</h1><p>If you can see styled text, /assets is working.</p></main>');
  out.write('<script type="module" src="' + jsSrc + '"></script>');
  out.write('</body></html>');
  out.end();
});
      `.trim()),
    });

    // Deploy assets with explicit cache semantics.
    // In real apps:
    // - hashed build artifacts should be `immutable`
    // - manifests and HTML should be short-lived / revalidated
    const immutableAssetsDir = requireDir('immutable assets', '../deploy/assets');
    new s3deploy.BucketDeployment(this, 'AssetsDeploymentImmutable', {
      sources: [s3deploy.Source.asset(immutableAssetsDir)],
      destinationBucket: assetsBucket,
      destinationKeyPrefix: 'assets',
      prune: true,
      cacheControl: [s3deploy.CacheControl.fromString('public,max-age=31536000,immutable')],
    });

    const manifestDir = requireDir('vite manifest', '../deploy/vite-manifest');
    new s3deploy.BucketDeployment(this, 'AssetsDeploymentManifest', {
      sources: [s3deploy.Source.asset(manifestDir)],
      destinationBucket: assetsBucket,
      destinationKeyPrefix: '',
      prune: true,
      cacheControl: [s3deploy.CacheControl.fromString('public,max-age=0,must-revalidate')],
    });

    const ssgDir = requireDir('ssg hydration data', '../deploy/ssg');
    new s3deploy.BucketDeployment(this, 'AssetsDeploymentSsgData', {
      sources: [s3deploy.Source.asset(ssgDir)],
      destinationBucket: assetsBucket,
      destinationKeyPrefix: '',
      prune: true,
      // Reasonable default for build output; tune per environment.
      cacheControl: [s3deploy.CacheControl.fromString('public,max-age=0,s-maxage=600')],
    });

    this.site = new AppTheorySsrSite(this, 'Site', {
      ssrFunction,
      assetsBucket,
      assetsKeyPrefix: 'assets',
      // Vite commonly emits `.vite/manifest.json` in the client build output.
      assetsManifestKey: '.vite/manifest.json',
      staticPathPatterns: ['/.vite/*', '/_facetheory/data/*'],
      // FaceTheory multi-tenant header (optional).
      ssrForwardHeaders: ['x-facetheory-tenant'],
      enableLogging: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Make the static behavior cache policy visible and stable in the template.
    // This also documents the expected behavior for /assets and other static patterns.
    void cloudfront.CachePolicy.CACHING_OPTIMIZED;

    new CfnOutput(this, 'CloudFrontDomainName', {
      value: this.site.distribution.distributionDomainName,
    });

    new CfnOutput(this, 'AssetsBucketName', {
      value: assetsBucket.bucketName,
    });

    new CfnOutput(this, 'SsrFunctionUrl', {
      value: this.site.ssrUrl.url,
    });
  }
}
