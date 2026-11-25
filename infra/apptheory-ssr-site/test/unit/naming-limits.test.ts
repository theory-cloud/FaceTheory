import assert from 'node:assert/strict';
import test from 'node:test';

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {
  AppTheoryLoggingProfile,
  AppTheoryNamingProfile,
  AppTheoryResourceNaming,
  type AppTheoryNamingContextValues,
} from '@theory-cloud/apptheory-cdk';

import { FaceTheoryAppTheorySsrSiteStack } from '../../src/stack.js';
import {
  REFERENCE_STAGE_CONFIG,
  type FaceTheoryReferenceStageConfig,
} from '../../src/stage-config.js';

interface TemplateResource {
  readonly Type?: string;
  readonly Properties?: Record<string, unknown>;
}

interface TemplateShape {
  readonly Resources: Record<string, TemplateResource>;
}

function synth(
  config: FaceTheoryReferenceStageConfig = REFERENCE_STAGE_CONFIG,
  stackId = 'FaceTheoryAppTheorySsrSite',
): TemplateShape {
  const app = new App();
  const stack = new FaceTheoryAppTheorySsrSiteStack(app, stackId, {}, config);
  return Template.fromStack(stack).toJSON() as TemplateShape;
}

/**
 * The contract input for a stage config.
 *
 * `AppTheoryNamingContextValues` is the published, enum-typed shape the contract
 * API takes; the stack config keeps its own readonly string-literal shape so
 * `src/stage-config.ts` reads as configuration rather than as an API struct.
 */
function namingValues(
  config: FaceTheoryReferenceStageConfig = REFERENCE_STAGE_CONFIG,
): AppTheoryNamingContextValues {
  return {
    namespace: config.namespace,
    app: config.app,
    stage: config.stage,
    account: config.account,
    region: config.region,
    namingProfile: AppTheoryNamingProfile.DERIVED,
    loggingProfile: AppTheoryLoggingProfile.STANDARD,
    retentionDays: config.retentionDays,
    pins: { ...(config.pins ?? {}) },
    generated: [...(config.generated ?? [])],
  };
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

/**
 * The other reference site's contract entries, composed by the contract itself.
 *
 * `infra/apptheory-ssg-isr-site/src/stack.ts` owns these entries. This mirror pins
 * the entry kinds and logical names, which is the part a collision depends on; the
 * context values are that stack's committed stage config, and its own suite pins
 * the exact names its template derives, so a change to its entries or its values
 * fails there rather than passing quietly here.
 */
function ssgIsrSiteNames(): string[] {
  const values = namingValues({ ...REFERENCE_STAGE_CONFIG, app: 'facetheory-ssg-isr' });
  const names: string[] = [];
  for (const logical of ['site-assets', 'site-html-store']) {
    const composed = AppTheoryResourceNaming.physicalName(values, 's3_bucket', logical);
    names.push(composed.bucketNamePrefix ?? composed.name ?? '');
  }
  names.push(AppTheoryResourceNaming.physicalName(values, 'dynamodb_table', 'site-isr-metadata').name ?? '');
  names.push(AppTheoryResourceNaming.logGroupName(values, 'logs/access/cdn/site'));
  for (const type of ['log_delivery_source', 'log_delivery_destination']) {
    names.push(AppTheoryResourceNaming.physicalName(values, type, 'logs/access/cdn/site').name ?? '');
  }
  return names.sort();
}

test('the two reference sites in one account derive disjoint names', () => {
  // `apptheory-ssr-site` and `apptheory-ssg-isr` are deployed side by side in the
  // lab account. They differ in `app`, and that difference has to reach every name
  // they both derive.
  const ssrNames = contractNames(synth());
  const ssgIsrNames = ssgIsrSiteNames();

  assert.equal(ssrNames.length, 4, 'the SSR site derives one bucket prefix and three log names');
  assert.equal(ssgIsrNames.length, 6, 'the SSG+ISR site derives two bucket prefixes, a table and three log names');
  assert.deepEqual(
    ssrNames.filter((name) => ssgIsrNames.includes(name)),
    [],
    'the two reference sites must not share a physical name in one account',
  );
});

test('one app and stage with two logical names derives two name sets', () => {
  // Deployments that share an `app` id differ in `logicalName`; that has to be
  // enough on its own.
  const reference = contractNames(synth());
  const other = contractNames(
    synth({ ...REFERENCE_STAGE_CONFIG, logicalName: 'store' }, 'FaceTheoryAppTheorySsrSiteStore'),
  );

  assert.deepEqual(
    reference.filter((name) => other.includes(name)),
    [],
    'a different logicalName must derive a disjoint name set',
  );
  assert.equal(other.length, reference.length);
});

test('separator ambiguity is a known limit of the contract, not a FaceTheory rule', () => {
  // `theorycloud_resource_naming.v0.1` composes `<app>-<stage>-<logical>` by joining
  // with `-`, so the segment boundaries are not encoded in the result: app `shop`
  // with logical name `lab-site` and app `shop-lab` with logical name `site` compose
  // the same string. No FaceTheory code re-implements that composition, so no
  // FaceTheory change can fix it; the fix belongs to AppTheory's contract.
  //
  // This test pins the ambiguity so it cannot be forgotten and so it fails — loudly,
  // with this comment attached — the day the contract encodes its boundaries. At that
  // point the expected collision list becomes empty and the "known limit" section of
  // `docs/features/resource-naming.md` goes away with it.
  const shared = { ...REFERENCE_STAGE_CONFIG, stage: 'lab' };
  const siteA = contractNames(synth({ ...shared, app: 'shop', logicalName: 'lab-site' }, 'ShopA'));
  const siteB = contractNames(synth({ ...shared, app: 'shop-lab', logicalName: 'site' }, 'ShopB'));

  assert.deepEqual(
    siteA.filter((name) => siteB.includes(name)),
    ['shop-lab-lab-site-assets'],
    'the documented separator ambiguity still collides on the derived bucket prefix',
  );

  // The same collision, stated at the contract level, so it is clear the ambiguity
  // is in the composition and not in this stack.
  assert.equal(
    AppTheoryResourceNaming.physicalName(namingValues({ ...shared, app: 'shop' }), 's3_bucket', 'lab-site-assets')
      .bucketNamePrefix,
    AppTheoryResourceNaming.physicalName(namingValues({ ...shared, app: 'shop-lab' }), 's3_bucket', 'site-assets')
      .bucketNamePrefix,
  );
});
