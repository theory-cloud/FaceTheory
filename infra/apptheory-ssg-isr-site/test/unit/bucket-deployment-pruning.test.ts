import assert from 'node:assert/strict';
import test from 'node:test';

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import { FaceTheoryAppTheorySsgIsrSiteStack } from '../../src/stack.js';

interface TemplateResource {
  readonly Type?: string;
  readonly Properties?: Record<string, unknown>;
}

interface TemplateShape {
  readonly Resources: Record<string, TemplateResource>;
}

function synth(): TemplateShape {
  const app = new App();
  const stack = new FaceTheoryAppTheorySsgIsrSiteStack(app, 'FaceTheoryAppTheorySsgIsrSite');
  return Template.fromStack(stack).toJSON() as TemplateShape;
}

interface Deployment {
  /**
   * The construct id, with the CDK's trailing logical-id hash stripped, so the
   * assertion names the deployment in `src/stack.ts` rather than a hex suffix.
   */
  readonly id: string;

  /**
   * The destination prefix, or `''` for the bucket root.
   */
  readonly prefix: string;

  /**
   * Whether the deployment deletes objects under that prefix that its source does
   * not contain.
   */
  readonly prune: boolean;

  /**
   * The logical id of the destination bucket resource.
   */
  readonly bucket: string;
}

function deployments(template: TemplateShape): Deployment[] {
  return Object.entries(template.Resources)
    .filter(([, resource]) => resource.Type === 'Custom::CDKBucketDeployment')
    .map(([logicalId, resource]) => {
      const properties = resource.Properties ?? {};
      const destination = properties.DestinationBucketName as { Ref?: string } | undefined;
      const prefix = properties.DestinationBucketKeyPrefix;
      return {
        id: logicalId.replace(/CustomResource[0-9A-F]+$/, ''),
        prefix: typeof prefix === 'string' ? prefix : '',
        prune: properties.Prune === true,
        bucket: destination?.Ref ?? '',
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * The pruning the deployed stack does, pinned against the synthesized template.
 *
 * `docs/features/resource-naming.md` tells an operator where a foreign object may
 * be restored after a Path B cutover, and that answer is only true while the
 * immutable assets deployment is the only one that prunes and it never touches the
 * `isr/` prefix the runtime also writes. Flipping `prune` anywhere else fails here,
 * so the guide cannot promise a survival the deploy does not provide.
 */
test('the deploy prunes exactly the immutable assets prefix', () => {
  const found = deployments(synth());

  assert.deepEqual(
    found.map((deployment) => deployment.id),
    [
      'AssetsDeploymentImmutable',
      'AssetsDeploymentManifest',
      'AssetsDeploymentSsg',
      'AssetsDeploymentSsgSidecars',
    ],
    'the SSG+ISR site deploys immutable assets, the manifest, the SSG html and the hydration sidecars',
  );

  const immutable = found.find((deployment) => deployment.id === 'AssetsDeploymentImmutable');
  assert.ok(immutable, 'the immutable assets deployment is present');
  assert.equal(immutable.prefix, 'assets', 'the immutable cache-control deployment owns the `assets/` prefix');
  assert.equal(immutable.prune, true, '`assets/` is the prefix the deploy prunes');

  for (const id of ['AssetsDeploymentManifest', 'AssetsDeploymentSsg', 'AssetsDeploymentSsgSidecars']) {
    const deployment = found.find((candidate) => candidate.id === id);
    assert.ok(deployment, `${id} is present`);
    assert.equal(deployment.prune, false, `${id} must never prune: the deploy does not own every key it covers`);
  }
});

test('the html store is deployed under the isr prefix without pruning', () => {
  // The ISR runtime writes cache entries under `isr/` at request time, so a pruning
  // deployment there would delete live cache state on every deploy - and an
  // operator object parked under any other prefix in that bucket has to survive a
  // deployment for the guide's restore advice to be true.
  const found = deployments(synth());
  const ssg = found.find((deployment) => deployment.id === 'AssetsDeploymentSsg');
  const immutable = found.find((deployment) => deployment.id === 'AssetsDeploymentImmutable');
  assert.ok(ssg, 'the SSG html deployment is present');
  assert.ok(immutable, 'the immutable assets deployment is present');

  assert.equal(ssg.prefix, 'isr', 'the pre-rendered SSG HTML lands under the `isr` prefix');
  assert.equal(ssg.prune, false, 'the `isr` prefix is shared with runtime ISR writes, so it is never pruned');
  assert.notEqual(
    ssg.bucket,
    immutable.bucket,
    'the SSG html deployment targets the html store bucket, not the assets bucket',
  );
});
