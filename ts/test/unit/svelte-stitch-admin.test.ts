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

test('svelte stitch-admin: GuardedOperatorShell renders authorized content', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/GuardedOperatorShell.svelte'),
    {
      guard: { state: 'authorized', principalLabel: 'Release Ops' },
      authorized: 'Release queue',
    },
  );

  assert.ok(
    body.includes('facetheory-stitch-guarded-operator-shell-authorized'),
  );
  assert.ok(body.includes('data-operator-guard-state="authorized"'));
  assert.ok(body.includes('Release queue'));
  assert.ok(!body.includes('Operator access required'));
});

test('svelte stitch-admin: GuardedOperatorShell renders unauthorized state', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/GuardedOperatorShell.svelte'),
    {
      guard: {
        state: 'unauthorized',
        principalLabel: 'readonly@example.com',
        reason: 'Missing release:write permission.',
        requestId: 'req_guard_123',
      },
      authorized: 'Sensitive release controls',
    },
  );

  assert.ok(
    body.includes('facetheory-stitch-guarded-operator-shell-unauthorized'),
  );
  assert.ok(body.includes('data-empty-intent="not-authorized"'));
  assert.ok(body.includes('Operator access required'));
  assert.ok(body.includes('Missing release:write permission.'));
  assert.ok(body.includes('readonly@example.com'));
  assert.ok(body.includes('req_guard_123'));
  assert.ok(!body.includes('Sensitive release controls'));
});

test('svelte stitch-admin: GuardedOperatorShell renders loading state', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/GuardedOperatorShell.svelte'),
    {
      guard: { state: 'loading', requestId: 'req_guard_loading' },
      authorized: 'Loaded dashboard',
    },
  );

  assert.ok(body.includes('facetheory-stitch-guarded-operator-shell-loading'));
  assert.ok(body.includes('data-empty-intent="loading"'));
  assert.ok(body.includes('Checking operator access'));
  assert.ok(body.includes('req_guard_loading'));
  assert.ok(!body.includes('Loaded dashboard'));
});

test('svelte stitch-admin: GuardedOperatorShell renders error state', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/GuardedOperatorShell.svelte'),
    {
      guard: {
        state: 'error',
        reason: 'Autheory policy endpoint timed out.',
        requestId: 'req_guard_error',
      },
      authorized: 'Policy editor',
    },
  );

  assert.ok(body.includes('facetheory-stitch-guarded-operator-shell-error'));
  assert.ok(body.includes('data-empty-intent="error"'));
  assert.ok(body.includes('Operator access unavailable'));
  assert.ok(body.includes('Autheory policy endpoint timed out.'));
  assert.ok(body.includes('req_guard_error'));
  assert.ok(!body.includes('Policy editor'));
});
