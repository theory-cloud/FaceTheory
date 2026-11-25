import assert from 'node:assert/strict';
import test from 'node:test';

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {
  AppTheoryResourceNaming,
  RESOURCE_NAMING_CONTRACT,
} from '@theory-cloud/apptheory-cdk';

import { derivedPhysicalNames, sharedPhysicalNames } from '../../src/physical-names.js';
import { FaceTheoryAppTheorySsrSiteStack } from '../../src/stack.js';
import {
  REFERENCE_STAGE_CONFIG,
  stageNamingValues,
  type FaceTheoryReferenceStageConfig,
} from '../../src/stage-config.js';

interface TemplateResource {
  readonly Type?: string;
  readonly Properties?: Record<string, unknown>;
}

interface TemplateShape {
  readonly Resources: Record<string, TemplateResource>;
  readonly Outputs?: Record<string, { readonly Value?: unknown }>;
}

function synth(
  config: FaceTheoryReferenceStageConfig = REFERENCE_STAGE_CONFIG,
  stackId = 'FaceTheoryAppTheorySsrSite',
): TemplateShape {
  const app = new App();
  const stack = new FaceTheoryAppTheorySsrSiteStack(app, stackId, {}, config);
  return Template.fromStack(stack).toJSON() as TemplateShape;
}

function resourcesOfType(template: TemplateShape, type: string): TemplateResource[] {
  return Object.values(template.Resources).filter((resource) => resource.Type === type);
}

/**
 * The contract-derived physical names of a synthesized template: the names that
 * live in a namespace shared with every other resource in the account (bucket
 * names are global), plus the log-group and log-delivery names.
 */
function contractNames(template: TemplateShape): string[] {
  const names: string[] = [];
  for (const resource of resourcesOfType(template, 'AWS::S3::Bucket')) {
    const prefix = resource.Properties?.BucketNamePrefix;
    if (typeof prefix === 'string') names.push(prefix);
    const name = resource.Properties?.BucketName;
    if (typeof name === 'string') names.push(name);
  }
  for (const resource of resourcesOfType(template, 'AWS::Logs::LogGroup')) {
    const name = resource.Properties?.LogGroupName;
    if (typeof name === 'string') names.push(name);
  }
  for (const type of ['AWS::Logs::DeliverySource', 'AWS::Logs::DeliveryDestination']) {
    for (const resource of resourcesOfType(template, type)) {
      const name = resource.Properties?.Name;
      if (typeof name === 'string') names.push(name);
    }
  }
  return names.sort();
}

function distributionConfig(template: TemplateShape): Record<string, unknown> {
  for (const resource of resourcesOfType(template, 'AWS::CloudFront::Distribution')) {
    const config = resource.Properties?.DistributionConfig;
    if (config) return config as Record<string, unknown>;
  }
  assert.fail('template should include a CloudFront distribution');
}

test('the reference stack adopts theorycloud_resource_naming.v0.1', () => {
  assert.equal(
    RESOURCE_NAMING_CONTRACT,
    'theorycloud_resource_naming.v0.1',
    'this stack is pinned to the contract version it was reviewed against',
  );
  assert.doesNotThrow(
    () => AppTheoryResourceNaming.validateContext(stageNamingValues()),
    'the committed stage config must satisfy the contract grammar',
  );
});

test('every derived physical name follows the contract composition', () => {
  const template = synth();

  // s3_bucket, derived kind `s3ar`: `<app>-<stage>-<logical>` within a 63-character
  // budget, then CloudFormation appends `-<account>-<region>-an` through the
  // account-regional bucket namespace. The stack must therefore set a prefix and a
  // namespace, never a literal bucket name.
  const assetsBuckets = resourcesOfType(template, 'AWS::S3::Bucket');
  assert.equal(assetsBuckets.length, 1, 'the SSR reference stack owns exactly one bucket');
  assert.equal(
    assetsBuckets[0].Properties?.BucketNamePrefix,
    'facetheory-ssr-site-lab-site-assets',
  );
  assert.equal(assetsBuckets[0].Properties?.BucketNamespace, 'account-regional');
  assert.equal(
    assetsBuckets[0].Properties?.BucketName,
    undefined,
    'a derived bucket name is a prefix plus namespace, never a literal name',
  );

  // log: `theorycloud_<namespace>_<app>_<stage>_` plus the logical source with
  // `/` mapped to `_`. AppTheory's composed prefix carries the contract's fixed
  // `theorycloud` segment and then the configured namespace, so the default
  // namespace repeats that literal.
  assert.equal(
    template.Outputs?.AccessLogGroupName?.Value,
    'theorycloud_theorycloud_facetheory-ssr-site_lab_logs_access_cdn_site',
    'CloudFront access logs must land in the contract-named log group',
  );

  // log_delivery_source / log_delivery_destination, derived kind `dash`:
  // `<app>-<stage>-<logical>`.
  for (const type of ['AWS::Logs::DeliverySource', 'AWS::Logs::DeliveryDestination']) {
    const resources = resourcesOfType(template, type);
    assert.equal(resources.length, 1, `the standard logging profile creates one ${type}`);
    assert.equal(resources[0].Properties?.Name, 'facetheory-ssr-site-lab-logs-access-cdn-site');
  }

  // The same entries, composed by the contract itself, so a change in AppTheory's
  // composition shows up here as a failure rather than as silent drift.
  assert.equal(
    AppTheoryResourceNaming.physicalName(stageNamingValues(), 's3_bucket', 'site-assets')
      .bucketNamePrefix,
    assetsBuckets[0].Properties?.BucketNamePrefix,
  );
  assert.equal(
    AppTheoryResourceNaming.logGroupName(stageNamingValues(), 'logs/access/cdn/site'),
    template.Outputs?.AccessLogGroupName?.Value,
  );
});

test('the documented collision check lists every name the stack derives', () => {
  // `src/physical-names.ts` is the list `docs/features/resource-naming.md` tells an
  // operator to compare between two sites. Pin it to the template: a new derived
  // name fails here until it is in the list, so comparing one entry — the assets
  // bucket prefix, say — can never quietly stand in for comparing the set.
  const derived = derivedPhysicalNames(REFERENCE_STAGE_CONFIG);

  assert.deepEqual(
    derived.map((entry) => entry.name).sort(),
    contractNames(synth()),
    'the documented list is exactly the contract names this template sets',
  );
  assert.deepEqual(
    derived.map((entry) => entry.entry).sort(),
    [
      'log_delivery_destination:logs/access/cdn/site',
      'log_delivery_source:logs/access/cdn/site',
      'log_group:logs/access/cdn/site',
      's3_bucket:site-assets',
    ],
    'one entry per contract entry the stack consumes',
  );

  // The comparison is not vacuous: one config derives every name twice...
  assert.deepEqual(
    sharedPhysicalNames(derived, derivedPhysicalNames()),
    derived
      .map((entry) => `${entry.entry.slice(0, entry.entry.indexOf(':'))}: ${entry.name}`)
      .sort(),
    'identical configs share every entry',
  );
  // ...and two sites that differ in `app` share none.
  assert.deepEqual(
    sharedPhysicalNames(
      derived,
      derivedPhysicalNames({ ...REFERENCE_STAGE_CONFIG, app: 'facetheory-marketing-site' }),
    ),
    [],
    'a different app id derives a disjoint set',
  );
});

test('the standard logging profile replaces the per-stack S3 logs bucket', () => {
  const template = synth();
  const logicalIds = Object.keys(template.Resources);

  assert.ok(
    !logicalIds.some((logicalId) => logicalId.startsWith('SiteCloudFrontLogsBucket')),
    'under the standard logging profile no S3 access-log bucket is created',
  );
  assert.equal(
    distributionConfig(template).Logging,
    undefined,
    'CloudFront logs go to CloudWatch Logs delivery, not to an S3 logging configuration',
  );

  const deliveries = resourcesOfType(template, 'AWS::Logs::Delivery');
  assert.equal(deliveries.length, 1, 'the standard logging profile wires one CloudFront delivery');
  assert.deepEqual(
    deliveries[0].Properties?.RecordFields,
    [
      'timestamp',
      'x-edge-request-id',
      'cs-method',
      'cs-uri-stem',
      'sc-status',
      'sc-bytes',
      'time-taken',
      'x-edge-result-type',
      'c-ip',
    ],
    'the delivery carries the contract record fields in order',
  );

  const logGroup = resourcesOfType(template, 'AWS::Logs::LogGroup')[0];
  assert.equal(logGroup.Properties?.RetentionInDays, 30, 'the contract default retention applies');
});

test('an SSR-only site keeps the root on the function URL origin', () => {
  const config = distributionConfig(synth());
  assert.equal(
    config.DefaultRootObject,
    undefined,
    'ssr-only has no S3 HTML root object; a default root object would rewrite `/` onto the function URL',
  );
});

test('two FaceTheory sites in one account cannot collide on a name', () => {
  const reference = synth();
  const other = synth(
    { ...REFERENCE_STAGE_CONFIG, app: 'facetheory-marketing-site' },
    'FaceTheoryMarketingSite',
  );
  const otherStage = synth(
    { ...REFERENCE_STAGE_CONFIG, stage: 'prod' },
    'FaceTheoryAppTheorySsrSiteProd',
  );

  const referenceNames = contractNames(reference);
  assert.ok(referenceNames.length >= 3, 'the reference stack derives several names');
  for (const candidate of [contractNames(other), contractNames(otherStage)]) {
    const collisions = referenceNames.filter((name) => candidate.includes(name));
    assert.deepEqual(collisions, [], 'two sites in one account must derive disjoint names');
    assert.equal(candidate.length, referenceNames.length, 'both sites derive the same name kinds');
  }

  assert.deepEqual(
    contractNames(synth()).length,
    referenceNames.length,
    'the same app and stage derive the same number of names',
  );
  assert.deepEqual(contractNames(synth()), referenceNames, 'derivation is deterministic');
});

test('the collision check accepts the documented Path B config', () => {
  // `docs/features/resource-naming.md` tells an operator who stays on Path B to run
  // the same check. That config consumes only the bucket entry: the legacy logging
  // profile keeps the construct's S3 access-log bucket, so the config names no log
  // group and no log delivery. The bucket is `generated`, so the config carries no
  // name for it either — CloudFormation owns that name and only the account knows it.
  const pathB: FaceTheoryReferenceStageConfig = {
    ...REFERENCE_STAGE_CONFIG,
    namingProfile: 'legacy',
    loggingProfile: 'legacy',
    generated: ['s3_bucket:site-assets'],
  };

  const entries = derivedPhysicalNames(pathB);
  assert.deepEqual(
    entries.map((entry) => entry.entry),
    ['s3_bucket:site-assets'],
    'a Path B config consumes no log entry, so the list has none',
  );
  assert.equal(entries[0].generated, true);
  assert.equal(entries[0].name, undefined, 'the config has no name to compare for a generated entry');

  assert.deepEqual(
    sharedPhysicalNames(entries, derivedPhysicalNames(pathB)),
    [],
    'nothing comparable: read the deployed name from the AssetsBucketName output instead',
  );
  assert.deepEqual(
    sharedPhysicalNames(entries, derivedPhysicalNames()),
    [],
    'a legacy bucket name is unknown from config, so the check claims nothing about it',
  );
});

test('the collision check refuses a legacy config it cannot name', () => {
  // A legacy naming profile with the standard logging profile consumes a log group
  // and a log delivery the config does not name. Listing a gap or returning an empty
  // comparison would read as an all-clear, so the contract's own refusal surfaces.
  assert.throws(
    () =>
      derivedPhysicalNames({
        ...REFERENCE_STAGE_CONFIG,
        namingProfile: 'legacy',
        loggingProfile: 'standard',
        generated: ['s3_bucket:site-assets'],
      }),
    /legacy naming profile requires a pin or a generated entry for log_group:logs\/access\/cdn\/site/,
    'an entry the config does not name is refused rather than silently dropped',
  );
});

test('the collision check does not validate a config the stack refuses', () => {
  // SANITY-639-N2-01: `derivedPhysicalNames` assumes a config that synthesizes; it
  // does not validate one. A `pins` entry for a legacy site bucket is compared as the
  // literal it is, while `createSiteBucket` refuses it — naming a bucket
  // CloudFormation generated replaces the bucket and deletes its objects — which is
  // why the guide says to run `cdk synth` (or construct the stack) on each config
  // first.
  const refused: FaceTheoryReferenceStageConfig = {
    ...REFERENCE_STAGE_CONFIG,
    namingProfile: 'legacy',
    loggingProfile: 'legacy',
    pins: { 's3_bucket:site-assets': 'shop-lab-lab-site-assets' },
  };

  assert.throws(
    () => synth(refused),
    /createSiteBucket refuses a pin for s3_bucket:site-assets/,
    'the stack refuses the config, so the pinned name is never deployed',
  );

  const entries = derivedPhysicalNames(refused);
  assert.equal(entries[0].name, 'shop-lab-lab-site-assets');
  assert.deepEqual(
    sharedPhysicalNames(entries, derivedPhysicalNames(refused)),
    ['s3_bucket: shop-lab-lab-site-assets'],
    'the check compares a name the stack refuses, which is why the config must synthesize first',
  );
});

test('the legacy profiles keep the physical names a deployment already owns', () => {
  // The migration path documented in docs/features/resource-naming.md: no name is
  // derived, CloudFormation keeps the bucket it generated, and CloudFront goes
  // back to the construct's S3 access-log bucket so no log destination moves.
  const template = synth({
    ...REFERENCE_STAGE_CONFIG,
    namingProfile: 'legacy',
    loggingProfile: 'legacy',
    generated: ['s3_bucket:site-assets'],
  });

  const assetsBucket = resourcesOfType(template, 'AWS::S3::Bucket').find(
    (resource) => resource.Properties?.BucketNamePrefix === undefined,
  );
  assert.ok(assetsBucket, 'a generated entry sets no physical name at all');
  assert.equal(assetsBucket.Properties?.BucketName, undefined);
  assert.equal(assetsBucket.Properties?.BucketNamePrefix, undefined);
  assert.equal(assetsBucket.Properties?.BucketNamespace, undefined);

  const logicalIds = Object.keys(template.Resources);
  assert.ok(
    logicalIds.some((logicalId) => logicalId.startsWith('SiteCloudFrontLogsBucket')),
    'the legacy logging profile keeps the S3 access-log bucket',
  );
  assert.ok(distributionConfig(template).Logging, 'the distribution keeps its S3 logging block');
  assert.equal(
    resourcesOfType(template, 'AWS::Logs::Delivery').length,
    0,
    'the legacy logging profile wires no CloudWatch Logs delivery',
  );
});

test('a legacy config without an entry for a resource fails synthesis', () => {
  assert.throws(
    () => synth({ ...REFERENCE_STAGE_CONFIG, namingProfile: 'legacy', pins: {}, generated: [] }),
    /legacy naming profile requires a pin or a generated entry/,
    'the contract refuses a legacy context that cannot name a resource',
  );
});

test('a stage config outside the contract grammar fails synthesis', () => {
  for (const config of [
    { ...REFERENCE_STAGE_CONFIG, app: 'FaceTheory_Ssr' },
    { ...REFERENCE_STAGE_CONFIG, stage: 'Lab' },
    { ...REFERENCE_STAGE_CONFIG, stage: 'lab-stage-1' },
    { ...REFERENCE_STAGE_CONFIG, account: '1234' },
    { ...REFERENCE_STAGE_CONFIG, region: 'us-east' },
  ]) {
    assert.throws(
      () => synth(config),
      /app|stage|account|region/,
      `the contract must refuse ${JSON.stringify(config)}`,
    );
  }
});
