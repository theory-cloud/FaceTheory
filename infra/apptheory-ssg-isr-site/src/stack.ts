import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import {
  AppTheoryDynamoTable,
  AppTheorySsrSite,
  AppTheorySsrSiteMode,
} from '@theory-cloud/apptheory-cdk';
import { Construct } from 'constructs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function requireDir(name: string, relativePath: string): string {
  const resolved = path.resolve(__dirname, relativePath);
  if (!path.isAbsolute(resolved)) {
    throw new Error(`${name} path must be absolute: ${resolved}`);
  }
  return resolved;
}

export class FaceTheoryAppTheorySsgIsrSiteStack extends Stack {
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

    const isrBucket = new s3.Bucket(this, 'IsrBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const ssrFunction = new NodejsFunction(this, 'SsrFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.resolve(__dirname, './ssr-handler.ts'),
      handler: 'handler',
      // Don't rely on the Lambda runtime shipping AWS SDK v3 modules. Bundle them.
      bundleAwsSDK: true,
      timeout: Duration.seconds(10),
      memorySize: 512,
      environment: {
        APPTHEORY_ASSETS_BUCKET: assetsBucket.bucketName,
        APPTHEORY_ASSETS_PREFIX: 'assets',
        APPTHEORY_ASSETS_MANIFEST_KEY: '.vite/manifest.json',
        FACETHEORY_ISR_BUCKET: isrBucket.bucketName,
        FACETHEORY_ISR_PREFIX: 'isr',
      },
      bundling: {
        // Keep stack templates stable; minification changes hashes frequently.
        minify: false,
        sourceMap: false,
      },
    });

    // DynamoDB table for FaceTheory ISR metadata and leases (TableTheory schema).
    const cacheTable = new AppTheoryDynamoTable(this, 'CacheTable', {
      tableName: `${Stack.of(this).stackName}-facetheory-cache`,
      partitionKeyName: 'pk',
      sortKeyName: 'sk',
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Deploy assets + manifest + SSG output with explicit cache semantics.
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

    const ssgDir = requireDir('ssg output', '../deploy/ssg');
    new s3deploy.BucketDeployment(this, 'AssetsDeploymentSsg', {
      sources: [s3deploy.Source.asset(ssgDir)],
      destinationBucket: assetsBucket,
      destinationKeyPrefix: '',
      prune: true,
      // Reasonable default for build output; tune per environment.
      cacheControl: [s3deploy.CacheControl.fromString('public,max-age=0,s-maxage=600')],
    });

    // AppTheory owns the CloudFront/Lambda URL/S3 edge topology. In SSG_ISR mode it
    // uses S3 as the primary HTML origin and Lambda Function URL as the 403/404
    // failover origin, while preserving FaceTheory's original-URI and request-id
    // headers through generated CloudFront Functions.
    this.site = new AppTheorySsrSite(this, 'Site', {
      mode: AppTheorySsrSiteMode.SSG_ISR,
      ssrFunction,
      ssrUrlAuthType: lambda.FunctionUrlAuthType.AWS_IAM,
      assetsBucket,
      assetsKeyPrefix: 'assets',
      // Vite commonly emits `.vite/manifest.json` in the client build output.
      assetsManifestKey: '.vite/manifest.json',
      htmlStoreBucket: isrBucket,
      htmlStoreKeyPrefix: 'isr',
      isrMetadataTable: cacheTable.table,
      directS3PathPatterns: ['/.vite/*'],
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

    new CfnOutput(this, 'IsrBucketName', {
      value: isrBucket.bucketName,
    });

    new CfnOutput(this, 'CacheTableName', {
      value: cacheTable.table.tableName,
    });

    new CfnOutput(this, 'SsrFunctionUrl', {
      value: this.site.ssrUrl.url,
    });
  }
}
