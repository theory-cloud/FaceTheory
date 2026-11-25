import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import { FaceTheoryAppTheorySsrSiteStack } from '../../src/stack.js';
import {
  REFERENCE_STAGE_CONFIG,
  type FaceTheoryReferenceStageConfig,
} from '../../src/stage-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TemplateResource {
  readonly Type?: string;
  readonly Properties?: Record<string, unknown>;
  readonly DeletionPolicy?: string;
  readonly UpdateReplacePolicy?: string;
}

interface TemplateShape {
  readonly Resources: Record<string, TemplateResource>;
  readonly Outputs?: Record<string, { readonly Value?: unknown }>;
}

/**
 * The path B config from `docs/features/resource-naming.md`: nothing is derived,
 * both pre-contract profiles are active, and the one bucket CloudFormation named
 * keeps its generated name.
 */
const LEGACY_CONFIG: FaceTheoryReferenceStageConfig = {
  ...REFERENCE_STAGE_CONFIG,
  namingProfile: 'legacy',
  loggingProfile: 'legacy',
  generated: ['s3_bucket:site-assets'],
};

function synth(config: FaceTheoryReferenceStageConfig): TemplateShape {
  const app = new App();
  const stack = new FaceTheoryAppTheorySsrSiteStack(app, 'FaceTheoryAppTheorySsrSite', {}, config);
  return Template.fromStack(stack).toJSON() as TemplateShape;
}

function buildFaceTheoryDist(): void {
  const repoRoot = path.resolve(__dirname, '../../../..');
  execFileSync('npm', ['--prefix', path.resolve(repoRoot, 'ts'), 'run', 'build'], {
    stdio: 'inherit',
  });
}

function resource(template: TemplateShape, logicalId: string): TemplateResource {
  const found = template.Resources[logicalId];
  assert.ok(found, `template must still contain ${logicalId}; a missing logical ID is a replacement`);
  return found;
}

function distributionConfig(template: TemplateShape): Record<string, unknown> {
  for (const candidate of Object.values(template.Resources)) {
    if (candidate.Type === 'AWS::CloudFront::Distribution' && candidate.Properties?.DistributionConfig) {
      return candidate.Properties.DistributionConfig as Record<string, unknown>;
    }
  }
  assert.fail('template should include a CloudFront distribution');
}

test('the legacy naming profile keeps the deployment\'s assets bucket in place', () => {
  // Every logical ID below is the one the pre-contract stack synthesized
  // (`4a2dc75`). CloudFormation keys a resource on its logical ID, so a moved ID
  // is a create-then-delete even when `BucketName` is absent: the bucket and
  // everything in it goes. This test is the guard on that, which is why it names
  // the IDs instead of only checking that no name property is set.
  const template = synth(LEGACY_CONFIG);

  const bucket = resource(template, 'AssetsBucket5CB76180');
  assert.equal(bucket.Type, 'AWS::S3::Bucket');
  assert.equal(bucket.Properties?.BucketName, undefined, 'a generated entry sets no bucket name');
  assert.equal(bucket.Properties?.BucketNamePrefix, undefined, 'the legacy profile derives no prefix');
  assert.equal(bucket.Properties?.BucketNamespace, undefined, 'the legacy profile sets no namespace');
  assert.equal(bucket.DeletionPolicy, 'Delete', 'the deployed bucket keeps its retention posture');
  assert.equal(bucket.UpdateReplacePolicy, 'Delete');

  const autoDelete = resource(template, 'AssetsBucketAutoDeleteObjectsCustomResource51BA1286');
  assert.equal(autoDelete.Type, 'Custom::S3AutoDeleteObjects');
  assert.deepEqual(
    autoDelete.Properties?.BucketName,
    { Ref: 'AssetsBucket5CB76180' },
    'the auto-delete custom resource still targets the same bucket',
  );

  const policy = resource(template, 'AssetsBucketPolicyFFACF6C4');
  assert.equal(policy.Type, 'AWS::S3::BucketPolicy');
  assert.deepEqual(policy.Properties?.Bucket, { Ref: 'AssetsBucket5CB76180' });
});

test('the legacy profiles keep the S3 access-log bucket CloudFront already writes to', () => {
  const template = synth(LEGACY_CONFIG);

  const logsBucket = resource(template, 'SiteCloudFrontLogsBucketF9C1CD02');
  assert.equal(logsBucket.Type, 'AWS::S3::Bucket');
  assert.equal(logsBucket.Properties?.BucketName, undefined);
  assert.equal(logsBucket.DeletionPolicy, 'Delete');
  resource(template, 'SiteCloudFrontLogsBucketPolicy816DFF56');
  resource(template, 'SiteCloudFrontLogsBucketAutoDeleteObjectsCustomResource016FEC8F');
});

test('the legacy path exports the log destination it actually creates', () => {
  // Exporting `AccessLogGroupName` here would name a log group neither template
  // creates: under the legacy logging profile CloudFront writes S3 access logs to
  // the construct's bucket. The output must name that bucket.
  const template = synth(LEGACY_CONFIG);

  assert.equal(
    template.Outputs?.AccessLogGroupName,
    undefined,
    'the legacy logging profile creates no contract log group, so it exports none',
  );
  assert.deepEqual(
    template.Outputs?.AccessLogsBucketName?.Value,
    { Ref: 'SiteCloudFrontLogsBucketF9C1CD02' },
    'the exported destination is the bucket CloudFront writes to',
  );

  const logging = distributionConfig(template).Logging as
    | { readonly Bucket?: unknown }
    | undefined;
  assert.deepEqual(
    logging?.Bucket,
    { 'Fn::GetAtt': ['SiteCloudFrontLogsBucketF9C1CD02', 'RegionalDomainName'] },
    'the distribution logging block and the output name the same bucket',
  );
});

test('the standard logging profile exports the log group instead', () => {
  const template = synth(REFERENCE_STAGE_CONFIG);
  assert.ok(template.Outputs?.AccessLogGroupName, 'the standard profile exports its log group');
  assert.equal(
    template.Outputs?.AccessLogsBucketName,
    undefined,
    'the standard profile creates no S3 access-log bucket to export',
  );
});

test('the legacy profile refuses to pin a bucket CloudFormation generated', () => {
  // A pin is a literal name. Setting `BucketName` on a bucket CloudFormation named
  // is a replacement, so the migration path must fail loudly rather than offer it.
  assert.throws(
    () =>
      synth({
        ...REFERENCE_STAGE_CONFIG,
        namingProfile: 'legacy',
        loggingProfile: 'legacy',
        generated: [],
        pins: { 's3_bucket:site-assets': 'theorycloud-facetheory-ssr-site-assets' },
      }),
    /refuses a pin for s3_bucket:site-assets.*replaces the bucket/s,
  );
});

test('cutting Path B over to the derived profile removes these resources', () => {
  // `docs/features/resource-naming.md` says to stay on Path B unless everything in
  // the site buckets can be restored, and lists exactly what the cutover deletes.
  // Pin that list here so the guide cannot drift from the template: a change to the
  // construct shape shows up as an extra or missing logical ID rather than as a
  // quiet addition to what a cutover destroys.
  const legacy = synth(LEGACY_CONFIG);
  const derived = synth(REFERENCE_STAGE_CONFIG);

  const removed = Object.keys(legacy.Resources)
    .filter((logicalId) => !(logicalId in derived.Resources))
    .sort();
  const added = Object.keys(derived.Resources)
    .filter((logicalId) => !(logicalId in legacy.Resources))
    .sort();

  assert.deepEqual(removed, [
    // The site assets bucket, its auto-delete custom resource and its policy: the
    // derived bucket sits one construct deeper, so CloudFormation sees a different
    // resource, creates the new one and deletes this one with the objects in it.
    'AssetsBucket5CB76180',
    'AssetsBucketAutoDeleteObjectsCustomResource51BA1286',
    'AssetsBucketPolicyFFACF6C4',
    // The CloudFront S3 access-log bucket and its two companions: the standard
    // logging profile does not create it at all.
    'SiteCloudFrontLogsBucketAutoDeleteObjectsCustomResource016FEC8F',
    'SiteCloudFrontLogsBucketF9C1CD02',
    'SiteCloudFrontLogsBucketPolicy816DFF56',
  ]);
  assert.deepEqual(added, [
    'AssetsBucket0481D73F',
    'AssetsBucketAutoDeleteObjectsCustomResource4EEDE0F2',
    'AssetsBucketPolicyE8CC694A',
    'SiteCdnLoggingDelivery1416FEBB',
    'SiteCdnLoggingDeliveryDestinationC2E0B5F7',
    'SiteCdnLoggingDeliverySource159DB5E3',
    'SiteCdnLoggingLogGroup5FA337C7',
  ]);

  // Why the removal is destructive rather than a handover: both buckets carry a
  // delete policy and an auto-delete custom resource, so CloudFormation empties
  // them before deleting them. Objects these stacks did not put there do not
  // survive, which is the stop condition the guide states.
  for (const logicalId of ['AssetsBucket5CB76180', 'SiteCloudFrontLogsBucketF9C1CD02']) {
    assert.equal(legacy.Resources[logicalId].DeletionPolicy, 'Delete', logicalId);
    assert.equal(legacy.Resources[logicalId].UpdateReplacePolicy, 'Delete', logicalId);
  }
  assert.equal(
    legacy.Resources.AssetsBucketAutoDeleteObjectsCustomResource51BA1286?.Type,
    'Custom::S3AutoDeleteObjects',
  );
  assert.equal(
    legacy.Resources.SiteCloudFrontLogsBucketAutoDeleteObjectsCustomResource016FEC8F?.Type,
    'Custom::S3AutoDeleteObjects',
  );
});

test('the legacy template is the pre-contract template, snapshotted', async () => {
  buildFaceTheoryDist();

  const template = synth(LEGACY_CONFIG);
  const actual = `${JSON.stringify(template, null, 2)}\n`;

  const snapshotDir = path.resolve('test/__snapshots__');
  const snapshotFile = path.resolve(snapshotDir, 'ssr-site-stack.legacy.template.json');

  if (process.env.UPDATE_SNAPSHOTS === '1') {
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(snapshotFile, actual);
    return;
  }

  const expected = await readFile(snapshotFile, 'utf8').catch(() => null);
  assert.ok(
    expected !== null,
    `missing snapshot: ${snapshotFile} (run: npm run test:update)`,
  );
  assert.equal(
    actual,
    expected,
    'the legacy template must stay resource-for-resource the pre-contract template',
  );
});
