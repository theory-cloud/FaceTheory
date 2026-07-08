import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
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

    const ssrFunction = new NodejsFunction(this, 'SsrFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.resolve(__dirname, './handler.ts'),
      handler: 'handler',
      timeout: Duration.seconds(10),
      memorySize: 512,
      bundling: {
        // Keep stack templates stable; minification changes hashes frequently.
        minify: false,
        sourceMap: false,
      },
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
      ssrUrlAuthType: lambda.FunctionUrlAuthType.AWS_IAM,
      assetsBucket,
      assetsKeyPrefix: 'assets',
      // Vite commonly emits `.vite/manifest.json` in the client build output.
      assetsManifestKey: '.vite/manifest.json',
      // Raw object/data paths stay on direct S3 behaviors; `staticPathPatterns` is now for
      // extensionless HTML sections in AppTheorySsrSite.
      // Keep SSG hydration sidecars on S3, but reserve SSR runtime hydration sidecars for
      // the same Lambda/FaceApp handler that rendered the SSR HTML.
      directS3PathPatterns: ['/.vite/*', '/_facetheory/data/*'],
      ssrPathPatterns: ['/_facetheory/ssr-data/*'],
      enableLogging: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

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
