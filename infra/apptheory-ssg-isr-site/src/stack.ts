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

import { createSiteBucket } from './site-bucket.js';
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

export class FaceTheoryAppTheorySsgIsrSiteStack extends Stack {
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
    // is bound from the stage config above.
    const naming = createNamingContext(this, stageConfig);
    const logical = stageConfig.logicalName;

    const assetsBucket = createSiteBucket(this, 'AssetsBucket', {
      namingContext: naming,
      logical: `${logical}-assets`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const isrBucket = createSiteBucket(this, 'IsrBucket', {
      namingContext: naming,
      logical: `${logical}-html-store`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const ssrFunction = new NodejsFunction(this, 'SsrFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.resolve(__dirname, './ssr-handler.ts'),
      handler: 'handler',
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
    //
    // The name is the contract's `dynamodb_table` derivation for the same
    // `{logicalName}-isr-metadata` entry AppTheorySsrSite would consume if it
    // created the table itself, so the construct still owns no name here and the
    // stack's table and the site's ISR wiring agree. Under the derived naming
    // context AppTheoryDynamoTable also applies the contract's Security Hub
    // defaults: point-in-time recovery on, and deletion protection only for a
    // RETAIN table (this one is DESTROY, so protection stays off).
    const isrMetadataTableName = naming.physicalName('dynamodb_table', `${logical}-isr-metadata`).name;
    if (!isrMetadataTableName) {
      throw new Error(
        `the naming context did not derive a name for dynamodb_table:${logical}-isr-metadata; ` +
          'AppTheoryDynamoTable requires a physical tableName, so under the legacy naming profile a DynamoDB table ' +
          'needs a pins entry, not a generated entry',
      );
    }
    const cacheTable = new AppTheoryDynamoTable(this, 'CacheTable', {
      tableName: isrMetadataTableName,
      namingContext: naming,
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
    // The manifest, asset, and SSG sidecar deployments share the assets bucket;
    // a root-prefix deployment with prune enabled would delete every object the
    // other deployments placed (`assets/*`, `_facetheory/data/*`). Only the
    // prefix-scoped assets deployment may prune.
    new s3deploy.BucketDeployment(this, 'AssetsDeploymentManifest', {
      sources: [s3deploy.Source.asset(manifestDir)],
      destinationBucket: assetsBucket,
      destinationKeyPrefix: '',
      prune: false,
      cacheControl: [s3deploy.CacheControl.fromString('public,max-age=0,must-revalidate')],
    });

    const ssgDir = requireDir('ssg output', '../deploy/ssg');
    // Pre-rendered SSG HTML must land at the primary CloudFront HTML origin: the
    // ISR html store bucket under the `isr` prefix. That prefix is shared with
    // runtime ISR writes, so pruning must stay off to preserve objects this
    // deployment did not place. The hydration sidecars are excluded here because
    // they are served from a different origin and deploy separately below.
    new s3deploy.BucketDeployment(this, 'AssetsDeploymentSsg', {
      sources: [s3deploy.Source.asset(ssgDir, { exclude: ['_facetheory/**'] })],
      destinationBucket: isrBucket,
      destinationKeyPrefix: 'isr',
      prune: false,
      // Reasonable default for build output; tune per environment.
      cacheControl: [s3deploy.CacheControl.fromString('public,max-age=0,s-maxage=600')],
    });

    // FaceTheory external hydration data (`__FACETHEORY_DATA_URL__`, e.g.
    // `_facetheory/data/<page>.json`) is fetched through the `/_facetheory/data/*`
    // path pattern, which the edge routes to the assets bucket origin, not the ISR
    // html store. Deploy the sidecars to that bucket under the exact
    // `_facetheory/data` prefix. The assets bucket is shared with the immutable
    // assets and manifest deployments, so this deployment must not prune.
    const ssgSidecarDir = requireDir('ssg hydration sidecars', '../deploy/ssg/_facetheory/data');
    new s3deploy.BucketDeployment(this, 'AssetsDeploymentSsgSidecars', {
      sources: [s3deploy.Source.asset(ssgSidecarDir)],
      destinationBucket: assetsBucket,
      destinationKeyPrefix: '_facetheory/data',
      prune: false,
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
      namingContext: naming,
      logicalName: logical,
    });

    new CfnOutput(this, 'CloudFrontDomainName', {
      value: this.site.distribution.distributionDomainName,
    });

    // The output names the destination this stack actually deploys. Under the
    // standard logging profile that is a contract-named CloudWatch Logs group the
    // site construct creates; under the legacy profile it is the construct's S3
    // access-log bucket, and exporting a log-group name there would point an
    // operator at a group nothing creates.
    if (naming.standardLogging) {
      new CfnOutput(this, 'AccessLogGroupName', {
        value: naming.logGroupName(`logs/access/cdn/${logical}`),
      });
    } else {
      const accessLogsBucket = this.site.logsBucket;
      if (!accessLogsBucket) {
        throw new Error(
          'the legacy logging profile must create the site S3 access-log bucket; enableLogging is required for this stack',
        );
      }
      new CfnOutput(this, 'AccessLogsBucketName', {
        value: accessLogsBucket.bucketName,
      });
    }

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
