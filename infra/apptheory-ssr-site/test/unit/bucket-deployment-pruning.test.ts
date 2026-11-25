import assert from 'node:assert/strict';
import test from 'node:test';

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import { FaceTheoryAppTheorySsrSiteStack } from '../../src/stack.js';

interface TemplateResource {
  readonly Type?: string;
  readonly Properties?: Record<string, unknown>;
}

interface TemplateShape {
  readonly Resources: Record<string, TemplateResource>;
}

function synth(): TemplateShape {
  const app = new App();
  const stack = new FaceTheoryAppTheorySsrSiteStack(app, 'FaceTheoryAppTheorySsrSite');
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
 * be restored after a Path B cutover, and that answer is only true while exactly
 * one deployment prunes and only under the immutable assets prefix. Flipping
 * `prune` on a root deployment - or on any prefix an operator was told is safe -
 * fails here, so the guide cannot promise a survival the deploy does not provide.
 */
test('the deploy prunes exactly the immutable assets prefix', () => {
  const found = deployments(synth());

  assert.deepEqual(
    found.map((deployment) => deployment.id),
    ['AssetsDeploymentImmutable', 'AssetsDeploymentManifest', 'AssetsDeploymentSsgData'],
    'the SSR site deploys the immutable assets, the Vite manifest and the SSG data',
  );

  const immutable = found.find((deployment) => deployment.id === 'AssetsDeploymentImmutable');
  assert.ok(immutable, 'the immutable assets deployment is present');
  assert.equal(immutable.prefix, 'assets', 'the immutable cache-control deployment owns the `assets/` prefix');
  assert.equal(immutable.prune, true, '`assets/` is the prefix the deploy prunes');

  for (const id of ['AssetsDeploymentManifest', 'AssetsDeploymentSsgData']) {
    const deployment = found.find((candidate) => candidate.id === id);
    assert.ok(deployment, `${id} is present`);
    assert.equal(
      deployment.prune,
      false,
      `${id} shares the bucket root with the other deployment, so it must never prune`,
    );
    assert.equal(deployment.bucket, immutable.bucket, `${id} targets the same assets bucket`);
  }
});
