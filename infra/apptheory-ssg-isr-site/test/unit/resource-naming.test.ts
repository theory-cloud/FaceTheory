import assert from 'node:assert/strict';
import test from 'node:test';

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {
  AppTheoryResourceNaming,
  RESOURCE_NAMING_CONTRACT,
} from '@theory-cloud/apptheory-cdk';

import { derivedPhysicalNames, sharedPhysicalNames } from '../../src/physical-names.js';
import { FaceTheoryAppTheorySsgIsrSiteStack } from '../../src/stack.js';
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
  stackId = 'FaceTheoryAppTheorySsgIsrSite',
): TemplateShape {
  const app = new App();
  const stack = new FaceTheoryAppTheorySsgIsrSiteStack(app, stackId, {}, config);
  return Template.fromStack(stack).toJSON() as TemplateShape;
}

function resourcesOfType(template: TemplateShape, type: string): TemplateResource[] {
  return Object.values(template.Resources).filter((resource) => resource.Type === type);
}

/**
 * The contract-derived physical names of a synthesized template: the names that
 * live in a namespace shared with every other resource in the account (bucket
 * names are global), plus the table, log-group and log-delivery names.
 */
function contractNames(template: TemplateShape): string[] {
  const names: string[] = [];
  for (const resource of resourcesOfType(template, 'AWS::S3::Bucket')) {
    const prefix = resource.Properties?.BucketNamePrefix;
    if (typeof prefix === 'string') names.push(prefix);
    const name = resource.Properties?.BucketName;
    if (typeof name === 'string') names.push(name);
  }
  for (const type of ['AWS::DynamoDB::Table', 'AWS::Logs::LogGroup', 'AWS::Logs::DeliverySource', 'AWS::Logs::DeliveryDestination']) {
    for (const resource of resourcesOfType(template, type)) {
      const key = type === 'AWS::DynamoDB::Table' ? 'TableName' : type === 'AWS::Logs::LogGroup' ? 'LogGroupName' : 'Name';
      const name = resource.Properties?.[key];
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

function cacheTable(template: TemplateShape): TemplateResource {
  const table = Object.values(template.Resources).find(
    (resource) => resource.Type === 'AWS::DynamoDB::Table',
  );
  assert.ok(table, 'the SSG+ISR stack owns the ISR metadata table');
  return table;
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
  const buckets = resourcesOfType(template, 'AWS::S3::Bucket');
  assert.equal(buckets.length, 2, 'the SSG+ISR reference stack owns the assets and html store buckets');

  const prefixes = buckets.map((bucket) => bucket.Properties?.BucketNamePrefix).sort();
  assert.deepEqual(
    prefixes,
    [
      // s3_bucket derived kind `s3ar`: `<app>-<stage>-<logical>` within a
      // 63-character budget, then CloudFormation appends
      // `-<account>-<region>-an` through the account-regional namespace.
      'facetheory-ssg-isr-lab-site-aatexg6p',
      'facetheory-ssg-isr-lab-site-assets',
    ],
    'both buckets derive from the contract and, for the html store, its shortening rule',
  );
  for (const bucket of buckets) {
    assert.equal(bucket.Properties?.BucketNamespace, 'account-regional');
    assert.equal(bucket.Properties?.BucketName, undefined, 'no construct sets a literal bucket name');
  }

  // `facetheory-ssg-isr-lab-site-html-store` is 38 characters and the
  // account-regional suffix is 26, so the contract's 63-character budget is 37:
  // `shorten` keeps the head with its trailing separator removed and appends an
  // 8-character base32 digest of the full name. That is the contract's answer to
  // an over-budget logical, not a stack-local naming choice.
  assert.equal(
    AppTheoryResourceNaming.physicalName(stageNamingValues(), 's3_bucket', 'site-html-store')
      .bucketNamePrefix,
    'facetheory-ssg-isr-lab-site-aatexg6p',
  );
  assert.ok('facetheory-ssg-isr-lab-site-aatexg6p'.length < 63 - 26);

  // dynamodb_table, derived kind `dash` and the same `{logical}-isr-metadata`
  // entry AppTheorySsrSite consumes when it creates the table itself.
  const table = cacheTable(template);
  assert.equal(table.Properties?.TableName, 'facetheory-ssg-isr-lab-site-isr-metadata');
  assert.deepEqual(
    table.Properties?.PointInTimeRecoverySpecification,
    { PointInTimeRecoveryEnabled: true },
    'the derived naming context turns point-in-time recovery on (Security Hub DynamoDB.3)',
  );
  assert.equal(
    table.Properties?.DeletionProtectionEnabled,
    false,
    'a DESTROY table keeps deletion protection off so the stack can still be torn down',
  );

  // log: `theorycloud_<namespace>_<app>_<stage>_` plus the logical source with
  // `/` mapped to `_`.
  assert.equal(
    template.Outputs?.AccessLogGroupName?.Value,
    'theorycloud_theorycloud_facetheory-ssg-isr_lab_logs_access_cdn_site',
  );
  for (const type of ['AWS::Logs::DeliverySource', 'AWS::Logs::DeliveryDestination']) {
    const resources = resourcesOfType(template, type);
    assert.equal(resources.length, 1, `the standard logging profile creates one ${type}`);
    assert.equal(resources[0].Properties?.Name, 'facetheory-ssg-isr-lab-logs-access-cdn-site');
  }
});

test('the SSG+ISR distribution serves a contract-named root object from S3', () => {
  // Security Hub CloudFront.1: with the S3 HTML store as the default origin the
  // contract sets `index.html`, and the SSG deployment puts that key behind the
  // `isr` origin path. A miss still fails over to the Lambda origin (403/404).
  assert.equal(distributionConfig(synth()).DefaultRootObject, 'index.html');
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
      'dynamodb_table:site-isr-metadata',
      'log_delivery_destination:logs/access/cdn/site',
      'log_delivery_source:logs/access/cdn/site',
      'log_group:logs/access/cdn/site',
      's3_bucket:site-assets',
      's3_bucket:site-html-store',
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
  assert.equal(distributionConfig(template).Logging, undefined);
  assert.deepEqual(
    resourcesOfType(template, 'AWS::Logs::Delivery')[0]?.Properties?.RecordFields,
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
  );
});

test('two FaceTheory sites in one account cannot collide on a name', () => {
  const referenceNames = contractNames(synth());
  assert.ok(referenceNames.length >= 5, 'the reference stack derives several names');

  for (const candidate of [
    contractNames(synth({ ...REFERENCE_STAGE_CONFIG, app: 'facetheory-marketing-site' }, 'Other')),
    contractNames(synth({ ...REFERENCE_STAGE_CONFIG, stage: 'prod' }, 'Prod')),
  ]) {
    const collisions = referenceNames.filter((name) => candidate.includes(name));
    assert.deepEqual(collisions, [], 'two sites in one account must derive disjoint names');
    assert.equal(candidate.length, referenceNames.length, 'both sites derive the same name kinds');
  }

  assert.deepEqual(contractNames(synth()), referenceNames, 'derivation is deterministic');
});

test('the legacy profiles keep the physical names a deployment already owns', () => {
  // The migration path documented in docs/features/resource-naming.md: the two
  // buckets keep the names CloudFormation generated, the table keeps the name the
  // deployment already owns through a pin, and CloudFront goes back to the
  // construct's S3 access-log bucket so no log destination moves.
  const template = synth({
    ...REFERENCE_STAGE_CONFIG,
    namingProfile: 'legacy',
    loggingProfile: 'legacy',
    generated: ['s3_bucket:site-assets', 's3_bucket:site-html-store'],
    pins: { 'dynamodb_table:site-isr-metadata': 'FaceTheoryAppTheorySsgIsrSite-facetheory-cache' },
  });

  const buckets = resourcesOfType(template, 'AWS::S3::Bucket');
  assert.equal(
    buckets.length,
    3,
    'the legacy profile creates both stack buckets plus the construct S3 access-log bucket',
  );
  for (const bucket of buckets) {
    assert.equal(bucket.Properties?.BucketName, undefined);
    assert.equal(bucket.Properties?.BucketNamePrefix, undefined);
    assert.equal(bucket.Properties?.BucketNamespace, undefined);
  }

  assert.equal(
    cacheTable(template).Properties?.TableName,
    'FaceTheoryAppTheorySsgIsrSite-facetheory-cache',
    'a pin is used verbatim, so the deployed table is not replaced',
  );

  const logicalIds = Object.keys(template.Resources);
  assert.ok(
    logicalIds.some((logicalId) => logicalId.startsWith('SiteCloudFrontLogsBucket')),
    'the legacy logging profile keeps the S3 access-log bucket',
  );
  assert.ok(distributionConfig(template).Logging);
  assert.equal(resourcesOfType(template, 'AWS::Logs::Delivery').length, 0);
});

test('the ISR table needs a pin, not a generated entry, under the legacy profile', () => {
  // AppTheoryDynamoTable takes a physical tableName, so a generated entry cannot
  // express it; the stack fails with the migration instruction instead of
  // synthesizing a nameless table.
  assert.throws(
    () =>
      synth({
        ...REFERENCE_STAGE_CONFIG,
        namingProfile: 'legacy',
        generated: ['s3_bucket:site-assets', 's3_bucket:site-html-store', 'dynamodb_table:site-isr-metadata'],
      }),
    /needs a pins entry, not a generated entry/,
  );
});

test('a stage config outside the contract grammar fails synthesis', () => {
  for (const config of [
    { ...REFERENCE_STAGE_CONFIG, app: 'FaceTheory-Ssg' },
    { ...REFERENCE_STAGE_CONFIG, stage: 'Lab' },
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
