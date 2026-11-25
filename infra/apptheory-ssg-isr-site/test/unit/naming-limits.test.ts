import assert from 'node:assert/strict';
import test from 'node:test';

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AppTheoryResourceNaming } from '@theory-cloud/apptheory-cdk';

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
  for (const resource of resourcesOfType(template, 'AWS::DynamoDB::Table')) {
    const name = resource.Properties?.TableName;
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
 * `infra/apptheory-ssr-site/src/stack.ts` owns these entries. This mirror pins the
 * entry kinds and logical names, which is the part a collision depends on; the
 * context values are that stack's committed stage config, and its own suite pins
 * the exact names its template derives, so a change to its entries or its values
 * fails there rather than passing quietly here.
 */
function ssrSiteNames(): string[] {
  const values = stageNamingValues({ ...REFERENCE_STAGE_CONFIG, app: 'facetheory-ssr-site' });
  const names: string[] = [];
  const composed = AppTheoryResourceNaming.physicalName(values, 's3_bucket', 'site-assets');
  names.push(composed.bucketNamePrefix ?? composed.name ?? '');
  names.push(AppTheoryResourceNaming.logGroupName(values, 'logs/access/cdn/site'));
  for (const type of ['log_delivery_source', 'log_delivery_destination']) {
    names.push(AppTheoryResourceNaming.physicalName(values, type, 'logs/access/cdn/site').name ?? '');
  }
  return names.sort();
}

test('the two reference sites in one account derive disjoint names', () => {
  // `apptheory-ssr-site` and `apptheory-ssg-isr` are deployed side by side in the
  // lab account. They differ in `app`, and that difference has to reach every name
  // they both derive — including the assets bucket prefix both stacks own.
  const ssgIsrNames = contractNames(synth());
  const ssrNames = ssrSiteNames();

  assert.equal(ssgIsrNames.length, 6, 'the SSG+ISR site derives two bucket prefixes, a table and three log names');
  assert.equal(ssrNames.length, 4, 'the SSR site derives one bucket prefix and three log names');
  assert.deepEqual(
    ssgIsrNames.filter((name) => ssrNames.includes(name)),
    [],
    'the two reference sites must not share a physical name in one account',
  );
});

test('one app and stage with two logical names derives two name sets', () => {
  // Deployments that share an `app` id differ in `logicalName`; that has to be
  // enough on its own.
  const reference = contractNames(synth());
  const other = contractNames(
    synth({ ...REFERENCE_STAGE_CONFIG, logicalName: 'store' }, 'FaceTheoryAppTheorySsgIsrSiteStore'),
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
    [
      // Both stacks name their assets bucket from `<app>-<stage>-<logical>-assets`.
      'shop-lab-lab-site-assets',
      // Same for the ISR html store bucket, which stays inside the 63-character
      // budget here so the contract's shortening rule does not separate them.
      'shop-lab-lab-site-html-store',
      // The ISR metadata table collides for the same reason.
      'shop-lab-lab-site-isr-metadata',
    ],
    'the documented separator ambiguity still collides on both derived bucket prefixes and the table name',
  );

  // The same collision, stated at the contract level, so it is clear the ambiguity
  // is in the composition and not in this stack.
  assert.equal(
    AppTheoryResourceNaming.physicalName(
      stageNamingValues({ ...shared, app: 'shop' }),
      'dynamodb_table',
      'lab-site-isr-metadata',
    )
      .name,
    AppTheoryResourceNaming.physicalName(
      stageNamingValues({ ...shared, app: 'shop-lab' }),
      'dynamodb_table',
      'site-isr-metadata',
    )
      .name,
  );
});

test('the documented preflight reports the separator collision for its pair', () => {
  // The same two contexts, through the check `docs/features/resource-naming.md`
  // tells an operator to run: `derivedPhysicalNames()` for each config and
  // `sharedPhysicalNames()` over the two lists. The test above compares two
  // synthesized templates; this one pins the guide's claim that the helper does see
  // this class when it is given the affected pair, so the claim cannot rot into the
  // opposite ("the comparison cannot see the contract's own collisions").
  const shared = { ...REFERENCE_STAGE_CONFIG, stage: 'lab' };
  const siteA = derivedPhysicalNames({ ...shared, app: 'shop', logicalName: 'lab-site' });
  const siteB = derivedPhysicalNames({ ...shared, app: 'shop-lab', logicalName: 'site' });

  assert.deepEqual(
    sharedPhysicalNames(siteA, siteB),
    [
      'dynamodb_table: shop-lab-lab-site-isr-metadata',
      's3_bucket: shop-lab-lab-site-assets',
      's3_bucket: shop-lab-lab-site-html-store',
    ],
    'the helper reports every separator collision this stack derives, not just the assets prefix',
  );

  // And it stays silent about what it was not given: the same pair compared against
  // the committed reference config shares nothing, which is evidence about those two
  // configs and not a statement about the account.
  assert.deepEqual(
    sharedPhysicalNames(siteA, derivedPhysicalNames()),
    [],
    'an unaffected pair yields no shared name',
  );
});

test('an over-budget shortened name can equal a valid unshortened name', () => {
  // The second known collision class, and the reason the check compares the whole
  // name set rather than one entry. `log_delivery_source` and
  // `log_delivery_destination` names have a 60-character budget, and the contract
  // shortens an over-budget name to its head plus an 8-character digest. That
  // shortened form is itself a valid name, so it can coincide with a *different*
  // site's logical name that fits the budget:
  //
  //   site A logical `storefront-collection-renderer-marketing-edition-renewal-page`
  //   site B logical `storefront-collection-rend-ofrzmlkx`
  //
  // Both derive `shop-lab-logs-access-cdn-storefront-collection-rend-ofrzmlkx` as
  // their delivery name — one shortened, one literal — while their assets bucket
  // prefixes differ. An assets-prefix-only check passes here, and the second deploy
  // then collides on a name AWS requires to be unique.
  //
  // Pinned as a known limit of `theorycloud_resource_naming.v0.1`, not as a rule
  // FaceTheory adds: closing it belongs to the Factory resource-naming contract
  // (`docs/155`), which owns the separator class above as well. When the contract
  // stops shortening into a namespace that also holds literal names, this test
  // flips and the matching section of `docs/features/resource-naming.md` goes with
  // it.
  const shared = { ...REFERENCE_STAGE_CONFIG, app: 'shop', stage: 'lab' };
  const siteA = derivedPhysicalNames({
    ...shared,
    logicalName: 'storefront-collection-renderer-marketing-edition-renewal-page',
  });
  const siteB = derivedPhysicalNames({
    ...shared,
    logicalName: 'storefront-collection-rend-ofrzmlkx',
  });

  assert.deepEqual(
    sharedPhysicalNames(siteA, siteB),
    [
      'log_delivery_destination: shop-lab-logs-access-cdn-storefront-collection-rend-ofrzmlkx',
      'log_delivery_source: shop-lab-logs-access-cdn-storefront-collection-rend-ofrzmlkx',
    ],
    'the shortened delivery name equals a valid unshortened name from another site',
  );

  // The assets prefixes differ, which is exactly why comparing that one entry was
  // not a name-set check.
  assert.notEqual(
    siteA[0].name,
    siteB[0].name,
    'the assets bucket prefixes differ, so an assets-only preflight would have passed',
  );
});
