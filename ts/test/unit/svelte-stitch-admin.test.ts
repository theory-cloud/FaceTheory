import assert from 'node:assert/strict';
import test from 'node:test';

import { compile } from 'svelte/compiler';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createFaceApp } from '../../src/app.js';
import { createSvelteFace } from '../../src/svelte/index.js';

async function renderComponent(
  componentPath: string,
  props: Record<string, unknown>,
): Promise<string> {
  const source = await readFile(componentPath, 'utf8');
  const compiled = compile(source, {
    generate: 'server',
    filename: path.basename(componentPath),
  } as never);

  const dir = path.resolve('.tmp-facetheory-svelte-stitch-admin');
  await mkdir(dir, { recursive: true });

  const file = path.join(
    dir,
    `${path.basename(componentPath, '.svelte')}-${process.pid}-${Date.now()}.mjs`,
  );
  await writeFile(file, compiled.js.code, 'utf8');

  try {
    const mod = await import(pathToFileURL(file).href);
    const Component = mod.default as unknown;
    const app = createFaceApp({
      faces: [
        createSvelteFace({
          route: '/',
          mode: 'ssr',
          render: () => {
            const input = { component: Component, props };
            if (compiled.css?.code === undefined) return input;
            return { ...input, cssText: compiled.css.code };
          },
        }),
      ],
    });

    const resp = await app.handle({ method: 'GET', path: '/' });
    return new TextDecoder().decode(resp.body as Uint8Array);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('svelte stitch-admin: NonAuthoritativeBanner renders metadata parity markers', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/NonAuthoritativeBanner.svelte'),
    {
      metadata: {
        authority: 'non-authoritative',
        provenance: {
          source: 'Factory import',
          observedAt: '2026-04-24T18:30:00.000Z',
        },
        confidence: {
          level: 'low',
          label: 'Low confidence',
          reason: 'Only one imported source agreed.',
        },
        staleness: {
          state: 'stale',
          ageLabel: 'refreshed 2 hours ago',
          reason: 'Import has passed its freshness window.',
        },
      },
    },
  );

  assert.ok(body.includes('facetheory-stitch-non-authoritative-banner'));
  assert.ok(body.includes('Non-authoritative data'));
  assert.ok(body.includes('Non-authoritative'));
  assert.ok(body.includes('Factory import'));
  assert.ok(body.includes('Low confidence'));
  assert.ok(body.includes('refreshed 2 hours ago'));
  assert.ok(body.includes('facetheory-stitch-metadata-badge-warning'));
  assert.ok(body.includes('facetheory-stitch-metadata-badge-danger'));
});

test('svelte stitch-admin: MetadataBadgeGroup renders provenance links and stable freshness', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/MetadataBadgeGroup.svelte'),
    {
      metadata: {
        provenance: {
          source: 'Release manifest',
          href: '/operator/sources/release-manifest',
        },
        staleness: {
          state: 'fresh',
          ageLabel: 'refreshed 4 minutes ago',
        },
      },
    },
  );

  assert.ok(body.includes('facetheory-stitch-metadata-badge-group'));
  assert.ok(body.includes('href="/operator/sources/release-manifest"'));
  assert.ok(body.includes('Release manifest'));
  assert.ok(body.includes('refreshed 4 minutes ago'));
});

test('svelte stitch-admin: OperatorEmptyState renders explicit no-mock intent', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/OperatorEmptyState.svelte'),
    {
      config: {
        intent: 'no-data',
        title: 'No imported visibility records',
        description: 'Connect a source system before operator data appears.',
        actionLabel: 'Open import settings',
        placeholderDataPolicy: 'no-production-like-data',
      },
    },
  );

  assert.ok(body.includes('facetheory-stitch-operator-empty-state'));
  assert.ok(body.includes('data-empty-intent="no-data"'));
  assert.ok(body.includes('data-placeholder-policy="no-production-like-data"'));
  assert.ok(body.includes('No imported visibility records'));
  assert.ok(body.includes('Open import settings'));
  assert.ok(!body.includes('Acme'));
});
