import assert from 'node:assert/strict';
import test from 'node:test';

import { compile } from 'svelte/compiler';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createFaceApp } from '../../src/app.js';
import { createSvelteFace } from '../../src/svelte/index.js';
import type { OperatorCorrelationMetadata } from '../../src/stitch-admin/index.js';

const sampleCorrelation = {
  correlationId: 'corr_release_20260424_001',
  correlationSource: 'eventbridge.envelope',
  trigger: 'eventbridge',
  requestId: 'lambda_req_123',
} satisfies OperatorCorrelationMetadata;

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

  // Discover and compile dependent .svelte files in the same source dir so
  // wizard components that embed (for example) MetadataBadgeGroup.svelte can
  // resolve their imports under the temp dir at runtime.
  const dependentSvelteImport = /from\s+['"](\.\/[A-Za-z0-9_\-]+\.svelte)['"]/g;
  const componentDir = path.dirname(componentPath);
  const dependentSources = new Set<string>();
  for (const match of source.matchAll(dependentSvelteImport)) {
    const importPath = match[1];
    if (importPath === undefined) continue;
    dependentSources.add(importPath.replace(/^\.\//, ''));
  }
  // Compile each dependent .svelte into a sibling .mjs in the temp dir.
  for (const dep of dependentSources) {
    const depSource = await readFile(path.join(componentDir, dep), 'utf8');
    const depCompiled = compile(depSource, {
      generate: 'server',
      filename: dep,
    } as never);
    const depMjsName = dep.replace(/\.svelte$/, '.mjs');
    await writeFile(path.join(dir, depMjsName), depCompiled.js.code, 'utf8');
  }

  // Rewrite ./Foo.svelte imports in the main component's compiled JS to
  // point at the sibling .mjs files we just emitted, so Node can resolve
  // them under the temp dir.
  const rewrittenCode = compiled.js.code.replace(
    /(['"])(\.\/[A-Za-z0-9_\-]+)\.svelte\1/g,
    '$1$2.mjs$1',
  );

  const file = path.join(
    dir,
    `${path.basename(componentPath, '.svelte')}-${process.pid}-${Date.now()}.mjs`,
  );
  await writeFile(file, rewrittenCode, 'utf8');

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

test('svelte stitch-admin: MetadataBadgeGroup renders provenance, correlation, and stable freshness', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/MetadataBadgeGroup.svelte'),
    {
      metadata: {
        provenance: {
          source: 'Release manifest',
          href: '/operator/sources/release-manifest',
        },
        correlation: sampleCorrelation,
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
  assert.ok(body.includes('Correlation'));
  assert.ok(body.includes('corr_release_20260424_001'));
  assert.ok(body.includes('Source: eventbridge.envelope'));
  assert.ok(body.includes('Trigger: eventbridge'));
  assert.ok(body.includes('Request ID: lambda_req_123'));
  assert.ok(body.includes('refreshed 4 minutes ago'));
});

test('svelte stitch-admin: MetadataBadge blocks executable href protocols', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/MetadataBadge.svelte'),
    {
      label: 'Unsafe source',
      href: 'javascript:alert(1)',
    },
  );

  assert.ok(body.includes('Unsafe source'));
  assert.equal(body.includes('<a'), false);
  assert.equal(body.includes('javascript:alert(1)'), false);
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

test('svelte stitch-admin: HealthStatusPanel renders degraded and stale health states', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/HealthStatusPanel.svelte'),
    {
      title: 'Release control plane health',
      description: 'Stable health observations from Lambda checks.',
      rows: [
        {
          key: 'checkout-api',
          label: 'Checkout API',
          status: 'healthy',
          description: 'Lambda URL responded successfully.',
          detail: 'p95 83ms',
          checkedAt: '2026-04-24T22:00:00.000Z',
          metadata: {
            provenance: {
              source: 'lambda-health-check',
              sourceId: 'req_healthy_001',
            },
            staleness: {
              state: 'fresh',
              ageLabel: 'checked 1 minute ago',
            },
          },
        },
        {
          key: 'release-worker',
          label: 'Release worker',
          status: 'degraded',
          description: 'Queue depth exceeded warning threshold.',
          detail: 'depth 42',
          checkedAt: '2026-04-24T21:58:00.000Z',
          metadata: {
            provenance: { source: 'cloudwatch-snapshot' },
            staleness: {
              state: 'stale',
              ageLabel: 'checked 9 minutes ago',
              reason: 'Worker metrics are outside the freshness window.',
            },
          },
        },
        {
          key: 'audit-stream',
          label: 'Audit stream',
          status: 'down',
          detail: 'HTTP 503',
        },
        { key: 'partner-sync', label: 'Partner sync', status: 'unknown' },
      ],
    },
  );

  assert.ok(body.includes('facetheory-stitch-health-status-panel'));
  assert.ok(body.includes('Release control plane health'));
  assert.ok(body.includes('facetheory-stitch-health-status-healthy'));
  assert.ok(body.includes('facetheory-stitch-health-status-degraded'));
  assert.ok(body.includes('facetheory-stitch-health-status-down'));
  assert.ok(body.includes('facetheory-stitch-health-status-unknown'));
  assert.ok(body.includes('Healthy: 1'));
  assert.ok(body.includes('Degraded: 1'));
  assert.ok(body.includes('Down: 1'));
  assert.ok(body.includes('Unknown: 1'));
  assert.ok(body.includes('p95 83ms'));
  assert.ok(body.includes('HTTP 503'));
  assert.ok(body.includes('2026-04-24T22:00:00.000Z'));
  assert.ok(body.includes('req_healthy_001'));
  assert.ok(body.includes('lambda-health-check'));
  assert.ok(body.includes('checked 9 minutes ago'));
  assert.ok(body.includes('facetheory-stitch-health-row-stale'));
  assert.ok(body.includes('facetheory-stitch-metadata-badge-danger'));
});

test('svelte stitch-admin: HealthStatusPanel renders empty observations', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/HealthStatusPanel.svelte'),
    {
      rows: [],
      emptyLabel: 'No API health observations available yet.',
    },
  );

  assert.ok(body.includes('facetheory-stitch-health-status-panel-empty'));
  assert.ok(body.includes('No API health observations available yet.'));
});

test('svelte stitch-admin: VisibilityMatrix renders cell metadata and states', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/VisibilityMatrix.svelte'),
    {
      title: 'Partner service visibility',
      description: 'Caller-supplied visibility by service environment.',
      dimensions: [
        { key: 'checkout-prod', label: 'Checkout production' },
        { key: 'checkout-sandbox', label: 'Checkout sandbox' },
        { key: 'payouts-prod', label: 'Payouts production' },
      ],
      rows: [
        {
          entity: {
            key: 'partner-alpha',
            label: 'Partner Alpha',
            description: 'Enterprise partner imported from Factory.',
          },
          cells: [
            {
              entityKey: 'partner-alpha',
              dimensionKey: 'checkout-prod',
              state: 'visible',
              label: 'Live',
              detail: 'Release gate passed.',
              metadata: {
                authority: 'authoritative',
                provenance: {
                  source: 'visibility-import',
                  sourceId: 'vis_001',
                },
                confidence: { level: 'high', label: 'High confidence' },
                staleness: {
                  state: 'fresh',
                  ageLabel: 'refreshed 3 minutes ago',
                },
              },
            },
            {
              entityKey: 'partner-alpha',
              dimensionKey: 'checkout-sandbox',
              state: 'partial',
              detail: 'Sandbox merchant mapping is pending review.',
              metadata: {
                authority: 'non-authoritative',
                confidence: { level: 'medium', label: 'Medium confidence' },
                staleness: {
                  state: 'stale',
                  ageLabel: 'refreshed 2 hours ago',
                  reason: 'Import has passed its freshness window.',
                },
              },
            },
            {
              entityKey: 'partner-alpha',
              dimensionKey: 'payouts-prod',
              state: 'blocked',
              detail: 'Missing payout capability.',
              metadata: {
                confidence: { level: 'low', label: 'Low confidence' },
              },
            },
          ],
        },
        {
          entity: { key: 'partner-beta', label: 'Partner Beta' },
          cells: [
            {
              entityKey: 'partner-beta',
              dimensionKey: 'checkout-prod',
              state: 'not-visible',
              detail: 'No active rollout for production.',
            },
            {
              entityKey: 'partner-beta',
              dimensionKey: 'checkout-sandbox',
              state: 'unknown',
            },
          ],
        },
      ],
    },
  );

  assert.ok(body.includes('facetheory-stitch-visibility-matrix'));
  assert.ok(body.includes('Partner service visibility'));
  assert.ok(body.includes('Checkout production'));
  assert.ok(body.includes('Partner Alpha'));
  assert.ok(body.includes('facetheory-stitch-visibility-matrix-cell-visible'));
  assert.ok(body.includes('facetheory-stitch-visibility-matrix-cell-partial'));
  assert.ok(body.includes('facetheory-stitch-visibility-matrix-cell-blocked'));
  assert.ok(
    body.includes('facetheory-stitch-visibility-matrix-cell-not-visible'),
  );
  assert.ok(body.includes('facetheory-stitch-visibility-matrix-cell-unknown'));
  assert.ok(body.includes('data-cell-state="partial"'));
  assert.ok(body.includes('data-authority-state="non-authoritative"'));
  assert.ok(body.includes('data-confidence-level="medium"'));
  assert.ok(body.includes('data-staleness-state="stale"'));
  assert.ok(body.includes('visibility-import'));
  assert.ok(body.includes('High confidence'));
  assert.ok(body.includes('refreshed 2 hours ago'));
  assert.ok(body.includes('facetheory-stitch-metadata-badge-warning'));
  assert.ok(body.includes('facetheory-stitch-metadata-badge-danger'));
});

test('svelte stitch-admin: VisibilityMatrix renders explicit empty matrix cells', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/VisibilityMatrix.svelte'),
    {
      dimensions: [
        { key: 'checkout-prod', label: 'Checkout production' },
        { key: 'payouts-prod', label: 'Payouts production' },
      ],
      rows: [
        {
          entity: { key: 'partner-gamma', label: 'Partner Gamma' },
          cells: [
            {
              entityKey: 'partner-gamma',
              dimensionKey: 'checkout-prod',
              state: 'visible',
            },
          ],
        },
      ],
      emptyCellLabel: 'No imported visibility record',
    },
  );

  assert.ok(body.includes('facetheory-stitch-visibility-matrix-cell-empty'));
  assert.ok(body.includes('data-empty-cell="true"'));
  assert.ok(body.includes('No imported visibility record'));
  assert.ok(body.includes('data-cell-state="unknown"'));
});

test('svelte stitch-admin: WizardEditableTokenInputPanel renders parity DOM with React adapter', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardEditableTokenInputPanel.svelte'),
    {
      input: {
        inputId: 'svelte-allowed-senders',
        value: ['qa@example.com', 'ops@example.com'],
        label: 'Allowed senders',
        description: 'Server validation remains authoritative.',
        placeholder: 'Add another address…',
        removeLabelKind: 'sender',
        safetyPolicy: 'no-secret-or-production-like-data',
      },
      onChange: (): void => {},
    },
  );
  assert.ok(body.includes('facetheory-stitch-wizard-editable-token-input'));
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
  assert.ok(body.includes('data-input-id="svelte-allowed-senders"'));
  assert.ok(body.includes('data-token-count="2"'));
  assert.ok(body.includes('data-token-value="qa@example.com"'));
  assert.ok(body.includes('data-token-value="ops@example.com"'));
  assert.ok(body.includes('aria-label="Remove sender qa@example.com"'));
  assert.ok(body.includes('aria-label="Remove sender ops@example.com"'));
  assert.ok(body.includes('for="svelte-allowed-senders"'));
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
});

test('svelte stitch-admin: WizardEditableTokenInputPanel surfaces invalid + duplicate feedback with role=alert', async () => {
  const invalidBody = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardEditableTokenInputPanel.svelte'),
    {
      input: {
        inputId: 'svelte-allowed-senders-invalid',
        value: ['qa@example.com'],
        label: 'Allowed senders',
        draftValue: 'not-an-email',
        removeLabelKind: 'sender',
        validateToken: (token: string) =>
          token.includes('@')
            ? { valid: true }
            : { valid: false, message: 'Address must contain @' },
        safetyPolicy: 'no-secret-or-production-like-data',
      },
      onChange: (): void => {},
    },
  );
  assert.ok(invalidBody.includes('role="alert"'));
  assert.ok(invalidBody.includes('data-feedback-source="validator"'));
  assert.ok(invalidBody.includes('Address must contain @'));

  const duplicateBody = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardEditableTokenInputPanel.svelte'),
    {
      input: {
        inputId: 'svelte-allowed-senders-duplicate',
        value: ['qa@example.com'],
        label: 'Allowed senders',
        draftValue: 'qa@example.com',
        removeLabelKind: 'sender',
        safetyPolicy: 'no-secret-or-production-like-data',
      },
      onChange: (): void => {},
    },
  );
  assert.ok(duplicateBody.includes('data-feedback-source="duplicate"'));
  assert.ok(duplicateBody.includes('is already in the list'));
});

test('svelte stitch-admin: WizardEditableTokenInputPanel is byte-identical across repeated SSR renders', async () => {
  const props = {
    input: {
      inputId: 'svelte-allowed-senders-determinism',
      value: ['qa@example.com', 'ops@example.com'],
      label: 'Allowed senders',
      removeLabelKind: 'sender',
      safetyPolicy: 'no-secret-or-production-like-data',
    },
    onChange: (): void => {},
  };
  const first = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardEditableTokenInputPanel.svelte'),
    props,
  );
  const second = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardEditableTokenInputPanel.svelte'),
    props,
  );
  assert.equal(first, second);
});

test('svelte wizard parity: WizardProgress renders steps with stable data attrs', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardProgress.svelte'),
    {
      state: {
        steps: [
          { key: 'a', label: 'A', status: 'complete' },
          { key: 'b', label: 'B', status: 'in-progress' },
          { key: 'c', label: 'C', status: 'pending' },
        ],
        currentStepKey: 'b',
      },
    },
  );
  assert.ok(body.includes('facetheory-stitch-wizard-progress'));
  assert.ok(body.includes('data-step-count="3"'));
  assert.ok(body.includes('data-completed-count="1"'));
  assert.ok(body.includes('data-step-key="b"'));
  assert.ok(body.includes('data-step-status="in-progress"'));
  assert.ok(body.includes('facetheory-stitch-wizard-step-active'));
});

test('svelte wizard parity: WizardPackageSummaryPanel renders file totals + safety footnote', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardPackageSummaryPanel.svelte'),
    {
      summary: {
        name: 'pkg',
        version: '0.1.0',
        files: [{ key: 'a', path: 'agent.json' }],
        totals: { fileCount: 1 },
        safetyPolicy: 'no-secret-or-production-like-data',
      },
    },
  );
  assert.ok(body.includes('facetheory-stitch-wizard-package-summary'));
  assert.ok(body.includes('data-file-count="1"'));
  assert.ok(body.includes('agent.json'));
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
});

test('svelte wizard parity: WizardFindingListPanel renders severity chips and evidence', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardFindingListPanel.svelte'),
    {
      list: {
        findings: [
          { id: 'f1', severity: 'info', title: 'Manifest parsed' },
          { id: 'f2', severity: 'error', title: 'Bad capability', evidence: 'cap[0]' },
        ],
        safetyPolicy: 'no-secret-or-production-like-data',
      },
    },
  );
  assert.ok(body.includes('facetheory-stitch-wizard-finding-list'));
  assert.ok(body.includes('data-finding-count="2"'));
  assert.ok(body.includes('data-finding-severity="info"'));
  assert.ok(body.includes('data-finding-severity="error"'));
  assert.ok(body.includes('Info: 1'));
  assert.ok(body.includes('Error: 1'));
  assert.ok(body.includes('cap[0]'));
});

test('svelte wizard parity: WizardReconcileSummaryPanel replaces redacted detail with marker', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardReconcileSummaryPanel.svelte'),
    {
      summary: {
        entries: [
          { key: 'a', label: 'a', kind: 'added' },
          { key: 'b', label: 'b', kind: 'changed', detail: 'super-secret', redacted: true },
          { key: 'c', label: 'c', kind: 'redacted' },
        ],
        totals: { added: 1, removed: 0, changed: 1, unchanged: 0, redacted: 1 },
        safetyPolicy: 'no-secret-or-production-like-data',
      },
    },
  );
  assert.ok(body.includes('Added: 1'));
  assert.ok(body.includes('Redacted: 1'));
  assert.ok(!body.includes('super-secret'));
  assert.ok(body.includes('[redacted]'));
});

test('svelte wizard parity: WizardCapabilityReviewPanel suppresses sensitive/redacted detail', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardCapabilityReviewPanel.svelte'),
    {
      review: {
        capabilities: [
          { key: 'pub', label: 'Pub', intent: 'granted', sensitivity: 'public', detail: 'visible' },
          { key: 'sen', label: 'Sen', intent: 'requested', sensitivity: 'sensitive', detail: 'should-suppress' },
          { key: 'red', label: 'Red', intent: 'denied', sensitivity: 'redacted', detail: 'should-redact' },
        ],
        safetyPolicy: 'no-secret-or-production-like-data',
      },
    },
  );
  assert.ok(body.includes('visible'));
  assert.ok(!body.includes('should-suppress'));
  assert.ok(!body.includes('should-redact'));
  assert.ok(body.includes('Detail suppressed (sensitive).'));
  assert.ok(body.includes('[redacted]'));
});

test('svelte wizard parity: WizardEnablementChecklistPanel renders caller summary + allReady', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardEnablementChecklistPanel.svelte'),
    {
      checklist: {
        items: [{ key: 'a', label: 'ready', status: 'ready' }],
        summaryLabel: '1 of 1 ready',
        allReady: true,
      },
    },
  );
  assert.ok(body.includes('facetheory-stitch-wizard-enablement-checklist'));
  assert.ok(body.includes('data-all-ready="true"'));
  assert.ok(body.includes('1 of 1 ready'));
});

test('svelte wizard parity: WizardRecoveryStatusPanel uses role=alert for failed state', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardRecoveryStatusPanel.svelte'),
    { status: { state: 'failed', description: 'Failed.' } },
  );
  assert.ok(body.includes('data-recovery-state="failed"'));
  assert.ok(body.includes('role="alert"'));
  assert.ok(body.includes('Failed'));
});

test('svelte wizard parity: WizardEmptyState renders safety-policy footnote', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardEmptyState.svelte'),
    {
      config: {
        intent: 'no-data',
        title: 'No data',
        safetyPolicy: 'no-secret-or-production-like-data',
      },
    },
  );
  assert.ok(body.includes('data-empty-intent="no-data"'));
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
});

test('svelte wizard parity: WizardReconciliationPlanPanel marks conflict/blocked/external prominent', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardReconciliationPlanPanel.svelte'),
    {
      plan: {
        rows: [
          { key: 'c', label: 'c', kind: 'conflict', reason: 'r' },
          { key: 'b', label: 'b', kind: 'blocked', reason: 'r' },
          { key: 'e', label: 'e', kind: 'external_step_required', reason: 'r' },
        ],
        totals: { create: 0, update: 0, satisfied: 0, conflict: 1, blocked: 1, external: 1, noop: 0 },
        safetyPolicy: 'no-secret-or-production-like-data',
      },
    },
  );
  assert.ok(body.includes('data-row-kind="external"'));
  assert.ok(body.includes('data-row-kind-input="external_step_required"'));
  assert.ok(body.includes('data-row-prominent="true"'));
  assert.equal(body.split('role="alert"').length - 1, 3);
});

test('svelte wizard parity: WizardAuthorityContextStripPanel renders text-labeled authority + copy button', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardAuthorityContextStripPanel.svelte'),
    {
      strip: {
        items: [
          { key: 'tenant', label: 'Tenant', value: 'theory-mcp' },
          { key: 'route', label: 'MCP route', value: '/agents/acme', copyable: true },
        ],
        authorityLabel: 'Server-derived',
        readOnlyLabel: 'Read-only',
        layout: 'auto',
        safetyPolicy: 'no-secret-or-production-like-data',
      },
    },
  );
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
  assert.ok(body.includes('data-layout="auto"'));
  assert.ok(body.includes('Server-derived'));
  assert.ok(body.includes('aria-label="Read-only"'));
  assert.ok(body.includes('aria-label="Copy MCP route"'));
  assert.ok(body.includes('data-copy-value="/agents/acme"'));
});

test('svelte wizard parity: WizardPackageSummaryPanel renders summary.metadata via MetadataBadgeGroup', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardPackageSummaryPanel.svelte'),
    {
      summary: {
        name: 'pkg',
        files: [],
        totals: { fileCount: 0 },
        safetyPolicy: 'no-secret-or-production-like-data',
        metadata: {
          authority: 'non-authoritative',
          provenance: { source: 'Factory import' },
        },
      },
    },
  );
  assert.ok(body.includes('facetheory-stitch-metadata-badge-group'));
  assert.ok(body.includes('Non-authoritative'));
  assert.ok(body.includes('Factory import'));
});

test('svelte wizard parity: WizardFindingListPanel renders per-finding.metadata via MetadataBadgeGroup', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardFindingListPanel.svelte'),
    {
      list: {
        findings: [
          {
            id: 'f1',
            severity: 'warning',
            title: 'Imported with provenance',
            metadata: { provenance: { source: 'Factory import' }, correlation: sampleCorrelation },
          },
        ],
        safetyPolicy: 'no-secret-or-production-like-data',
      },
    },
  );
  assert.ok(body.includes('facetheory-stitch-metadata-badge-group'));
  assert.ok(body.includes('Factory import'));
  assert.ok(body.includes('corr_release_20260424_001'));
});

test('svelte wizard parity: WizardRecoveryStatusPanel renders status.metadata via MetadataBadgeGroup', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardRecoveryStatusPanel.svelte'),
    {
      status: {
        state: 'resumable',
        metadata: { provenance: { source: 'Session store' } },
      },
    },
  );
  assert.ok(body.includes('data-recovery-state="resumable"'));
  assert.ok(body.includes('facetheory-stitch-metadata-badge-group'));
  assert.ok(body.includes('Session store'));
});

test('svelte wizard parity: WizardReconciliationPlanPanel renders row.metadata via MetadataBadgeGroup', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/WizardReconciliationPlanPanel.svelte'),
    {
      plan: {
        rows: [
          {
            key: 'k',
            label: 'k',
            kind: 'update',
            metadata: { provenance: { source: 'Plan diff' } },
          },
        ],
        totals: { create: 0, update: 1, satisfied: 0, conflict: 0, blocked: 0, external: 0, noop: 0 },
        safetyPolicy: 'no-secret-or-production-like-data',
      },
    },
  );
  assert.ok(body.includes('data-row-key="k"'));
  assert.ok(body.includes('facetheory-stitch-metadata-badge-group'));
  assert.ok(body.includes('Plan diff'));
});

test('svelte selectable-card-grid: single-select renders as radiogroup with role=radio cards', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/SelectableCardGridPanel.svelte'),
    {
      grid: {
        groupId: 'allowed-action',
        selection: 'single',
        selectedKeys: ['create'],
        options: [
          { key: 'create', title: 'Create', tone: 'success', recommended: true },
          { key: 'reuse', title: 'Reuse', tone: 'info' },
          { key: 'replace', title: 'Replace', tone: 'warning', riskLabel: 'High blast radius' },
          { key: 'archive', title: 'Archive', disabledReason: 'Requires operator review.' },
          { key: 'forbidden', title: 'Forbidden', blocked: true, blockedReason: 'Server policy blocks this.' },
        ],
        label: 'Allowed action',
        description: 'TheoryMCP resolves availability per route.',
        layout: 'grid',
        safetyPolicy: 'no-secret-or-production-like-data',
      },
      onChange: (): void => {},
    },
  );
  assert.ok(body.includes('facetheory-stitch-selectable-card-grid'));
  assert.ok(body.includes('data-selection="single"'));
  assert.ok(body.includes('data-layout="grid"'));
  assert.ok(body.includes('role="radiogroup"'));
  assert.ok(body.includes('aria-labelledby="allowed-action-label"'));
  assert.ok(body.includes('aria-describedby="allowed-action-description"'));
  assert.equal(body.split('role="radio"').length - 1, 5);
  assert.ok(body.includes('data-option-selected="true"'));
  assert.ok(body.includes('data-pill="recommended"'));
  assert.ok(body.includes('data-pill="risk"'));
  assert.ok(body.includes('data-pill="blocked"'));
  assert.ok(body.includes('id="allowed-action-archive-reason"'));
  assert.ok(body.includes('Requires operator review.'));
  assert.ok(body.includes('Server policy blocks this.'));
});

test('svelte selectable-card-grid: multi-select renders as checkbox group', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/SelectableCardGridPanel.svelte'),
    {
      grid: {
        groupId: 'targets',
        selection: 'multi',
        selectedKeys: ['github', 'mailbox'],
        options: [
          { key: 'github', title: 'GitHub' },
          { key: 'mailbox', title: 'Mailbox' },
          { key: 'policy', title: 'Policy' },
        ],
        layout: 'stack',
        safetyPolicy: 'no-secret-or-production-like-data',
      },
      onChange: (): void => {},
    },
  );
  assert.ok(body.includes('data-selection="multi"'));
  assert.ok(body.includes('role="group"'));
  assert.equal(body.split('role="checkbox"').length - 1, 3);
  assert.equal(body.split('aria-checked="true"').length - 1, 2);
  assert.equal(body.split('aria-checked="false"').length - 1, 1);
});

test('svelte ChoiceCard renders standalone card with selection family + safety policy', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/ChoiceCard.svelte'),
    {
      card: {
        cardId: 'choice-create',
        option: { key: 'create', title: 'Create', recommended: true },
        selection: 'single',
        selected: true,
        safetyPolicy: 'no-secret-or-production-like-data',
      },
    },
  );
  assert.ok(body.includes('facetheory-stitch-choice-card'));
  assert.ok(body.includes('role="radio"'));
  assert.ok(body.includes('aria-checked="true"'));
  assert.ok(body.includes('data-selection-family="single"'));
  assert.ok(body.includes('data-option-recommended="true"'));
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
});

test('svelte package-source-input: renders paste/dropzone/upload with stable data attrs', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/PackageSourceInputPanel.svelte'),
    {
      input: {
        groupId: 'pkg-src',
        value: 'name: acme\n',
        state: 'validating',
        errors: [],
        modes: ['paste', 'dropzone', 'upload'],
        label: 'Package source',
        description: 'TheoryMCP validates server-side.',
        fileAccept: '.yaml,.yml,.json',
        safetyPolicy: 'no-secret-or-production-like-data',
      },
      onValueChange: (): void => {},
      onFiles: (): void => {},
    },
  );
  assert.ok(body.includes('facetheory-stitch-package-source-input'));
  assert.ok(body.includes('data-state="validating"'));
  assert.ok(body.includes('data-modes="paste dropzone upload"'));
  assert.ok(body.includes('id="pkg-src-paste"'));
  assert.ok(body.includes('data-mode="dropzone"'));
  assert.ok(body.includes('accept=".yaml,.yml,.json"'));
  assert.ok(body.includes('Validating source'));
  assert.ok(body.includes('role="status"'));
});

test('svelte package-source-input: never renders caller-supplied evidence for kind=redacted', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/PackageSourceInputPanel.svelte'),
    {
      input: {
        groupId: 'pkg-red',
        value: '',
        state: 'redacted',
        errors: [
          {
            id: 'red-1',
            kind: 'redacted',
            message: 'Manifest contains redacted content.',
            evidence: 'AKIA-NEVER-SHOWN-SVELTE-1234567890',
          },
        ],
        modes: ['paste'],
        safetyPolicy: 'no-secret-or-production-like-data',
      },
      onValueChange: (): void => {},
    },
  );
  assert.ok(body.includes('data-state="redacted"'));
  assert.ok(body.includes('data-error-kind="redacted"'));
  assert.ok(body.includes('Manifest contains redacted content.'));
  assert.equal(body.includes('AKIA-NEVER-SHOWN-SVELTE-1234567890'), false);
});

test('svelte code-dropzone: renders state-labeled dropzone with file metadata', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/CodeDropzone.svelte'),
    {
      dropzone: {
        dropzoneId: 'drop-svelte',
        label: 'Drop a package',
        state: 'ready',
        fileMeta: { name: 'acme.yaml', sizeBytes: 412 },
        safetyPolicy: 'no-secret-or-production-like-data',
      },
    },
  );
  assert.ok(body.includes('facetheory-stitch-code-dropzone'));
  assert.ok(body.includes('data-dropzone-id="drop-svelte"'));
  assert.ok(body.includes('data-state="ready"'));
  assert.ok(body.includes('Ready for server preview'));
  assert.ok(body.includes('data-file-name="acme.yaml"'));
});

test('svelte package-source-input: only invalid-syntax renders evidence; forbidden/unsafe/other suppressed', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/PackageSourceInputPanel.svelte'),
    {
      input: {
        groupId: 'pkg-mixed-svelte',
        value: '',
        state: 'invalid',
        errors: [
          { id: 'syntax-1', kind: 'invalid-syntax', message: 'Expected top-level mapping at line 1', evidence: 'line 1, col 1' },
          { id: 'forbidden-1', kind: 'forbidden', message: 'Operator policy blocks this manifest.', evidence: 'AKIA-SVELTE-FORBIDDEN-EVIDENCE-1234567890' },
          { id: 'unsafe-1', kind: 'unsafe', message: 'Manifest references an unsupported scheme.', evidence: 'AKIA-SVELTE-UNSAFE-EVIDENCE-1234567890' },
          { id: 'other-1', kind: 'other', message: 'Validation could not complete.', evidence: 'AKIA-SVELTE-OTHER-EVIDENCE-1234567890' },
        ],
        modes: ['paste'],
        safetyPolicy: 'no-secret-or-production-like-data',
      },
      onValueChange: (): void => {},
    },
  );
  assert.ok(body.includes('line 1, col 1'));
  assert.equal(body.includes('AKIA-SVELTE-FORBIDDEN-EVIDENCE-1234567890'), false);
  assert.equal(body.includes('AKIA-SVELTE-UNSAFE-EVIDENCE-1234567890'), false);
  assert.equal(body.includes('AKIA-SVELTE-OTHER-EVIDENCE-1234567890'), false);
  assert.ok(body.includes('Operator policy blocks this manifest.'));
  assert.ok(body.includes('Manifest references an unsupported scheme.'));
  assert.ok(body.includes('Validation could not complete.'));
});

test('svelte code-dropzone: only invalid-syntax renders evidence; forbidden/unsafe/other suppressed', async () => {
  const body = await renderComponent(
    path.resolve('src/svelte/stitch-admin/CodeDropzone.svelte'),
    {
      dropzone: {
        dropzoneId: 'drop-mixed-svelte',
        label: 'Drop a package',
        state: 'invalid',
        safetyPolicy: 'no-secret-or-production-like-data',
        errors: [
          { id: 'syntax-1', kind: 'invalid-syntax', message: 'Expected top-level mapping at line 1', evidence: 'line 1, col 1' },
          { id: 'forbidden-1', kind: 'forbidden', message: 'Policy blocks.', evidence: 'AKIA-SVELTE-DZ-FORBIDDEN-EVIDENCE-1234567890' },
          { id: 'unsafe-1', kind: 'unsafe', message: 'Unsupported scheme.', evidence: 'AKIA-SVELTE-DZ-UNSAFE-EVIDENCE-1234567890' },
          { id: 'other-1', kind: 'other', message: 'Validation could not complete.', evidence: 'AKIA-SVELTE-DZ-OTHER-EVIDENCE-1234567890' },
        ],
      },
    },
  );
  assert.ok(body.includes('line 1, col 1'));
  assert.equal(body.includes('AKIA-SVELTE-DZ-FORBIDDEN-EVIDENCE-1234567890'), false);
  assert.equal(body.includes('AKIA-SVELTE-DZ-UNSAFE-EVIDENCE-1234567890'), false);
  assert.equal(body.includes('AKIA-SVELTE-DZ-OTHER-EVIDENCE-1234567890'), false);
  assert.ok(body.includes('Policy blocks.'));
  assert.ok(body.includes('Unsupported scheme.'));
  assert.ok(body.includes('Validation could not complete.'));
});
