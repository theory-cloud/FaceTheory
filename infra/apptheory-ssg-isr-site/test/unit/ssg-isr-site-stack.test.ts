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

interface OriginGroupTemplate {
  readonly Id?: string;
  readonly FailoverCriteria?: { readonly StatusCodes?: { readonly Items?: number[] } };
  readonly Members?: { readonly Items?: Array<{ readonly OriginId?: string }> };
}

interface DistributionTemplate {
  readonly DefaultCacheBehavior?: CacheBehaviorTemplate;
  readonly CacheBehaviors?: CacheBehaviorTemplate[];
  readonly Origins?: OriginTemplate[];
  readonly OriginGroups?: { readonly Items?: OriginGroupTemplate[] };
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
  const origin = findOriginById(distribution, behavior.TargetOriginId);
  assert.ok(origin, `missing CloudFront origin for ${behavior.PathPattern}`);
  return origin;
}

function findOriginById(
  distribution: DistributionTemplate,
  originId: string | undefined,
): OriginTemplate | undefined {
  return distribution.Origins?.find((candidate) => candidate.Id === originId);
}

function findFunctionCode(template: Record<string, unknown>, expectedSnippet: string): string {
  const resources = template.Resources as
    | Record<string, { Type?: string; Properties?: { FunctionCode?: unknown } }>
    | undefined;
  assert.ok(resources, 'template should include resources');

  const code = Object.values(resources)
    .filter((resource) => resource.Type === 'AWS::CloudFront::Function')
    .map((resource) => String(resource.Properties?.FunctionCode ?? ''))
    .find((candidate) => candidate.includes(expectedSnippet));

  assert.ok(code, `missing CloudFront Function code containing: ${expectedSnippet}`);
  return code;
}

function assertOldInlineFunctionsDeleted(template: Record<string, unknown>): void {
  const resources = template.Resources as Record<string, { Type?: string }> | undefined;
  assert.ok(resources, 'template should include resources');
  const logicalIds = Object.keys(resources);

  assert.ok(
    !logicalIds.some((id) => id.includes('SsgRewrite')),
    'legacy hand-rolled SsgRewrite CloudFront Function must be deleted',
  );
  assert.ok(
    !logicalIds.some((id) => id.includes('RequestIdResponseHeader')),
    'legacy hand-rolled RequestIdResponseHeader CloudFront Function must be deleted',
  );
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
  assertOldInlineFunctionsDeleted(template);

  const distribution = findDistribution(template);
  const defaultBehavior = distribution.DefaultCacheBehavior;
  assert.ok(defaultBehavior, 'SSG_ISR mode should synthesize a default CloudFront behavior');
  const originGroup = distribution.OriginGroups?.Items?.find(
    (candidate) => candidate.Id === defaultBehavior.TargetOriginId,
  );
  assert.ok(originGroup, 'SSG_ISR default behavior must target an origin group');
  assert.deepEqual(
    originGroup.FailoverCriteria?.StatusCodes?.Items,
    [403, 404],
    'SSG_ISR origin group must fail over to Lambda on S3 403/404 misses',
  );

  const originGroupOrigins =
    originGroup.Members?.Items?.map((member) => findOriginById(distribution, member.OriginId)) ?? [];
  assert.ok(
    originGroupOrigins.some((origin) => origin?.S3OriginConfig),
    'SSG_ISR origin group must keep S3 as the static HTML origin',
  );
  assert.ok(
    originGroupOrigins.some((origin) => origin?.CustomOriginConfig),
    'SSG_ISR origin group must keep Lambda Function URL as the failover origin',
  );

  const viteManifestOrigin = findOrigin(distribution, findBehavior(distribution, '.vite/*'));
  const ssgSidecarOrigin = findOrigin(distribution, findBehavior(distribution, '_facetheory/data/*'));
  const ssrSidecarOrigin = findOrigin(distribution, findBehavior(distribution, '_facetheory/ssr-data/*'));

  assert.ok(viteManifestOrigin.S3OriginConfig, 'Vite manifest paths must stay on the S3/static origin');
  assert.ok(ssgSidecarOrigin.S3OriginConfig, 'SSG sidecars must stay on the S3/static origin');
  assert.ok(
    ssrSidecarOrigin.CustomOriginConfig,
    'SSR hydration sidecars must route directly to the Lambda Function URL origin',
  );

  const viewerRequestCode = findFunctionCode(template, "headers['x-facetheory-original-uri']");
  assert.ok(
    viewerRequestCode.includes("headers['x-apptheory-original-uri']"),
    'AppTheorySsrSite should preserve AppTheory original URI for SSR failover routing',
  );
  assert.ok(
    viewerRequestCode.includes("headers['x-request-id']"),
    'AppTheorySsrSite should set/propagate request IDs at the edge',
  );
  assert.ok(
    viewerRequestCode.includes("request.uri = uri.endsWith('/') ? uri + 'index.html' : uri + '/index.html';"),
    'AppTheorySsrSite SSG_ISR mode should rewrite extensionless routes to S3 index.html keys',
  );
  assert.ok(
    viewerRequestCode.includes("'/_facetheory/data'") && viewerRequestCode.includes("'/_facetheory/ssr-data'"),
    'AppTheorySsrSite should keep SSG sidecars on S3 and SSR sidecars on Lambda passthrough paths',
  );
  const viewerResponseCode = findFunctionCode(template, "response.headers['x-request-id']");
  assert.ok(
    viewerResponseCode.includes("response.headers['x-request-id']"),
    'AppTheorySsrSite should echo request IDs on viewer responses',
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
