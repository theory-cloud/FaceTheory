import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import { FaceTheoryAppTheorySsrSiteStack } from '../../src/stack.js';

interface CacheBehaviorTemplate {
  readonly PathPattern?: string;
  readonly TargetOriginId?: string;
}

interface OriginTemplate {
  readonly Id?: string;
  readonly CustomOriginConfig?: unknown;
  readonly S3OriginConfig?: unknown;
}

interface DistributionTemplate {
  readonly CacheBehaviors?: CacheBehaviorTemplate[];
  readonly Origins?: OriginTemplate[];
}

async function readOrNull(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function findDistribution(template: Record<string, unknown>): DistributionTemplate {
  const resources = template.Resources as
    | Record<string, { Type?: string; Properties?: { DistributionConfig?: DistributionTemplate } }>
    | undefined;
  assert.ok(resources, 'template should include resources');

  for (const resource of Object.values(resources)) {
    if (resource.Type === 'AWS::CloudFront::Distribution' && resource.Properties?.DistributionConfig) {
      return resource.Properties.DistributionConfig;
    }
  }

  assert.fail('template should include a CloudFront distribution');
}

function findBehavior(distribution: DistributionTemplate, pathPattern: string): CacheBehaviorTemplate {
  const behavior = distribution.CacheBehaviors?.find((candidate) => candidate.PathPattern === pathPattern);
  assert.ok(behavior, `missing CloudFront behavior for ${pathPattern}`);
  return behavior;
}

function findOrigin(distribution: DistributionTemplate, behavior: CacheBehaviorTemplate): OriginTemplate {
  const origin = distribution.Origins?.find((candidate) => candidate.Id === behavior.TargetOriginId);
  assert.ok(origin, `missing CloudFront origin for ${behavior.PathPattern}`);
  return origin;
}

test('H2: AppTheorySsrSite stack synth is snapshotted', async () => {
  const app = new App();
  const stack = new FaceTheoryAppTheorySsrSiteStack(app, 'FaceTheoryAppTheorySsrSite');

  const template = Template.fromStack(stack).toJSON();
  const distribution = findDistribution(template);
  const ssgSidecarOrigin = findOrigin(distribution, findBehavior(distribution, '_facetheory/data/*'));
  const ssrSidecarOrigin = findOrigin(distribution, findBehavior(distribution, '_facetheory/ssr-data/*'));

  assert.ok(ssgSidecarOrigin.S3OriginConfig, 'SSG sidecars must stay on the S3/static origin');
  assert.ok(
    ssrSidecarOrigin.CustomOriginConfig,
    'SSR hydration sidecars must route to the Lambda Function URL origin',
  );

  const actual = `${JSON.stringify(template, null, 2)}\n`;

  const snapshotDir = path.resolve('test/__snapshots__');
  const snapshotFile = path.resolve(snapshotDir, 'ssr-site-stack.template.json');

  if (process.env.UPDATE_SNAPSHOTS === '1') {
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(snapshotFile, actual);
    return;
  }

  const expected = await readOrNull(snapshotFile);
  assert.ok(expected !== null, `missing snapshot: ${snapshotFile} (run: npm run test:update)`);
  assert.equal(actual, expected);
});
