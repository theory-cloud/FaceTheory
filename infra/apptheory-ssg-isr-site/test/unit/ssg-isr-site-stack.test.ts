import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import { FaceTheoryAppTheorySsgIsrSiteStack } from '../../src/stack.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function buildFaceTheoryDist(): void {
  const repoRoot = path.resolve(__dirname, '../../../..');
  execFileSync('npm', ['--prefix', path.resolve(repoRoot, 'ts'), 'run', 'build'], {
    stdio: 'inherit',
  });
}

test('H3: SSG+ISR stack synth is snapshotted', async () => {
  // NodejsFunction bundles the SSR handler, which imports FaceTheory from ts/dist.
  // Ensure dist exists so synth is deterministic and succeeds in clean checkouts.
  buildFaceTheoryDist();

  const app = new App();
  const stack = new FaceTheoryAppTheorySsgIsrSiteStack(app, 'FaceTheoryAppTheorySsgIsrSite');

  const template = Template.fromStack(stack).toJSON();
  const distribution = findDistribution(template);
  const ssgSidecarOrigin = findOrigin(distribution, findBehavior(distribution, '/_facetheory/data/*'));
  const ssrSidecarOrigin = findOrigin(distribution, findBehavior(distribution, '/_facetheory/ssr-data/*'));

  assert.ok(ssgSidecarOrigin.S3OriginConfig, 'SSG sidecars must stay on the S3/static origin');
  assert.ok(
    ssrSidecarOrigin.CustomOriginConfig,
    'SSR hydration sidecars must route directly to the Lambda Function URL origin',
  );

  const actual = `${JSON.stringify(template, null, 2)}\n`;

  const snapshotDir = path.resolve('test/__snapshots__');
  const snapshotFile = path.resolve(snapshotDir, 'ssg-isr-site-stack.template.json');

  if (process.env.UPDATE_SNAPSHOTS === '1') {
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(snapshotFile, actual);
    return;
  }

  const expected = await readOrNull(snapshotFile);
  assert.ok(expected !== null, `missing snapshot: ${snapshotFile} (run: npm run test:update)`);
  assert.equal(actual, expected);
});
