import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import { FaceTheoryAppTheorySsrSiteStack } from '../../src/stack.js';

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

function findSsrFunction(template: Record<string, unknown>): {
  readonly Properties?: { readonly Code?: Record<string, unknown>; readonly Handler?: string };
} {
  const resources = template.Resources as
    | Record<string, { Type?: string; Properties?: { Code?: Record<string, unknown>; Handler?: string } }>
    | undefined;
  assert.ok(resources, 'template should include resources');

  const entry = Object.entries(resources).find(
    ([logicalId, resource]) =>
      logicalId.includes('SsrFunction') && resource.Type === 'AWS::Lambda::Function',
  );
  assert.ok(entry, 'template should include the reference SSR Lambda function');
  return entry[1];
}

test('H2: AppTheorySsrSite stack synth is snapshotted', async () => {
  // NodejsFunction bundles the SSR handler, which imports FaceTheory from ts/dist.
  // Ensure dist exists so synth is deterministic and succeeds in clean checkouts.
  buildFaceTheoryDist();

  const handlerSource = await readFile(path.resolve(__dirname, '../../src/handler.ts'), 'utf8');
  assert.match(handlerSource, /createFaceApp/, 'SSR reference handler must build a real FaceTheory app');
  assert.match(
    handlerSource,
    /createAppTheoryFaceHandler/,
    'SSR reference handler must cross the FaceTheory/AppTheory adapter boundary',
  );

  const app = new App();
  const stack = new FaceTheoryAppTheorySsrSiteStack(app, 'FaceTheoryAppTheorySsrSite');

  const template = Template.fromStack(stack).toJSON();
  const ssrFunction = findSsrFunction(template);
  assert.ok(!ssrFunction.Properties?.Code?.ZipFile, 'SSR Lambda must not be an inline HTML string');

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
