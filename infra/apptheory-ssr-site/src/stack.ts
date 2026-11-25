import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { AppTheoryBucket, AppTheorySsrSite } from '@theory-cloud/apptheory-cdk';
import { Construct } from 'constructs';

import {
  REFERENCE_STAGE_CONFIG,
  createNamingContext,
  stageEnvironment,
  type FaceTheoryReferenceStageConfig,
} from './stage-config.js';

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

  /**
   * The bound stage config this stack synthesized from.
   */
  public readonly stageConfig: FaceTheoryReferenceStageConfig;

  constructor(
    scope: Construct,
    id: string,
    props: StackProps = {},
    stageConfig: FaceTheoryReferenceStageConfig = REFERENCE_STAGE_CONFIG,
  ) {
    super(scope, id, { env: stageEnvironment(stageConfig), ...props });

    this.stageConfig = stageConfig;

    // Every physical name this stack sets comes from the naming context, which
    // is bound from the stage config above. No construct here takes a hand-built
    // name: the contract treats an explicit name under a context as an error.
    const naming = createNamingContext(this, stageConfig);
    const logical = stageConfig.logicalName;

    const assetsBucket = new AppTheoryBucket(this, 'AssetsBucket', {
      namingContext: naming,
      // Matches the logical AppTheorySsrSite derives for a bucket it creates
      // itself, so this stack's own bucket and the construct's default are the
      // same entry.
      logical: `${logical}-assets`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    }).bucket;

    const ssrFunction = new NodejsFunction(this, 'SsrFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
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

    // The manifest and SSG deployments share the assets bucket root with each
    // other and with the `assets` prefix deployment. A pruning deployment at
    // the bucket root would delete every object another deployment placed
    // there, so only the prefix-scoped assets deployment may prune.
    const manifestDir = requireDir('vite manifest', '../deploy/vite-manifest');
    new s3deploy.BucketDeployment(this, 'AssetsDeploymentManifest', {
      sources: [s3deploy.Source.asset(manifestDir)],
      destinationBucket: assetsBucket,
      destinationKeyPrefix: '',
      prune: false,
      cacheControl: [s3deploy.CacheControl.fromString('public,max-age=0,must-revalidate')],
    });

    const ssgDir = requireDir('ssg hydration data', '../deploy/ssg');
    new s3deploy.BucketDeployment(this, 'AssetsDeploymentSsgData', {
      sources: [s3deploy.Source.asset(ssgDir)],
      destinationBucket: assetsBucket,
      destinationKeyPrefix: '',
      prune: false,
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
      namingContext: naming,
      logicalName: logical,
    });

    new CfnOutput(this, 'CloudFrontDomainName', {
      value: this.site.distribution.distributionDomainName,
    });

    new CfnOutput(this, 'AssetsBucketName', {
      value: assetsBucket.bucketName,
    });

    new CfnOutput(this, 'AccessLogGroupName', {
      // The standard logging profile puts CloudFront access logs in this
      // contract-named log group; the site construct creates it and AppTheory
      // attaches the delivery source, destination and delivery.
      value: naming.logGroupName(`logs/access/cdn/${logical}`),
    });

    new CfnOutput(this, 'SsrFunctionUrl', {
      value: this.site.ssrUrl.url,
    });
  }
}
