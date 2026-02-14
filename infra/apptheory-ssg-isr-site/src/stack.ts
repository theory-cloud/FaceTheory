import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { AppTheoryDynamoTable } from '@theory-cloud/apptheory-cdk';
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

    cacheTable.table.grantReadWriteData(ssrFunction);
    isrBucket.grantReadWrite(ssrFunction);

    // Mirror AppTheory's cache table env aliases for compatibility.
    ssrFunction.addEnvironment('APPTHEORY_CACHE_TABLE_NAME', cacheTable.table.tableName);
    ssrFunction.addEnvironment('FACETHEORY_CACHE_TABLE_NAME', cacheTable.table.tableName);
    ssrFunction.addEnvironment('CACHE_TABLE_NAME', cacheTable.table.tableName);
    ssrFunction.addEnvironment('CACHE_TABLE', cacheTable.table.tableName);

    const ssrUrl = ssrFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
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

    // CloudFront:
    // - S3 is the primary origin for HTML keys (SSG/static)
    // - Lambda URL is the fallback origin for misses (SSR/ISR)
    //
    // This strategy scales for large SSG route sets because no per-route behaviors are required.
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(assetsBucket);
    const ssrOrigin = origins.FunctionUrlOrigin.withOriginAccessControl(ssrUrl);

    const ssgRewrite = new cloudfront.Function(this, 'SsgRewrite', {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var req = event.request;
  var uri = req.uri || '/';

  // Preserve the original path so SSR can route correctly when S3 misses.
  req.headers['x-facetheory-original-uri'] = { value: uri };

  if (uri === '/assets' || uri.startsWith('/assets/')) return req;
  if (uri === '/.vite' || uri.startsWith('/.vite/')) return req;
  if (uri === '/_facetheory/data' || uri.startsWith('/_facetheory/data/')) return req;

  // If the final segment contains a dot, treat it as a file request.
  var idx = uri.lastIndexOf('/');
  var last = uri.substring(idx + 1);
  if (last.indexOf('.') !== -1) return req;

  if (uri.endsWith('/')) {
    req.uri = uri + 'index.html';
    return req;
  }

  req.uri = uri + '/index.html';
  return req;
}
      `.trim()),
    });

    const originRequestPolicy = new cloudfront.OriginRequestPolicy(this, 'OriginRequestPolicy', {
      comment: 'Forward enough for SSR/ISR, without exploding the static cache key',
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList('x-facetheory-original-uri', 'x-facetheory-tenant'),
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.all(),
    });

    const htmlOriginGroup = new origins.OriginGroup({
      primaryOrigin: s3Origin,
      fallbackOrigin: ssrOrigin,
      fallbackStatusCodes: [403, 404],
    });

    const logsBucket = new s3.Bucket(this, 'LogsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      enableLogging: true,
      logBucket: logsBucket,
      defaultBehavior: {
        origin: htmlOriginGroup,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.USE_ORIGIN_CACHE_CONTROL_HEADERS,
        originRequestPolicy,
        functionAssociations: [
          {
            function: ssgRewrite,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        '/assets/*': {
          origin: s3Origin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.USE_ORIGIN_CACHE_CONTROL_HEADERS,
        },
        '/.vite/*': {
          origin: s3Origin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.USE_ORIGIN_CACHE_CONTROL_HEADERS,
        },
        '/_facetheory/data/*': {
          origin: s3Origin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.USE_ORIGIN_CACHE_CONTROL_HEADERS,
        },
      },
    });

    new CfnOutput(this, 'CloudFrontDomainName', {
      value: distribution.distributionDomainName,
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
      value: ssrUrl.url,
    });
  }
}
