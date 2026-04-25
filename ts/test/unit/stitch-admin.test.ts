import assert from 'node:assert/strict';
import test from 'node:test';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import {
  CopyableCode,
  DataTable,
  DestructiveConfirm,
  DetailPanel,
  FilterChip,
  FilterChipGroup,
  GuardedOperatorShell,
  HealthStatusPanel,
  VisibilityMatrix,
  FormRow,
  FormSection,
  InlineKeyValueList,
  LogStream,
  MetadataBadgeGroup,
  NonAuthoritativeBanner,
  OperatorEmptyState,
  PropertyGrid,
  SplitForm,
  StatusTag,
  Tabs,
} from '../../src/react/stitch-admin/index.js';

const h = React.createElement;

async function renderSSR(element: React.ReactElement): Promise<string> {
  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: () => element,
        renderOptions: {
          integrations: [createAntdIntegration({ hashed: false })],
        },
      }),
    ],
  });
  const resp = await app.handle({ method: 'GET', path: '/' });
  return new TextDecoder().decode(resp.body as Uint8Array);
}

interface Partner {
  key: string;
  name: string;
  status: string;
}

const samplePartners: Partner[] = [
  { key: '1', name: 'Acme Corp', status: 'active' },
  { key: '2', name: 'Globex', status: 'pending' },
];

test('NonAuthoritativeBanner renders authority, provenance, confidence, and staleness metadata', async () => {
  const body = await renderSSR(
    h(NonAuthoritativeBanner, {
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
    }),
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

test('MetadataBadgeGroup renders provenance links without computing freshness', async () => {
  const body = await renderSSR(
    h(MetadataBadgeGroup, {
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
    }),
  );

  assert.ok(body.includes('facetheory-stitch-metadata-badge-group'));
  assert.ok(body.includes('href="/operator/sources/release-manifest"'));
  assert.ok(body.includes('Release manifest'));
  assert.ok(body.includes('refreshed 4 minutes ago'));
});

test('OperatorEmptyState renders explicit no-mock empty state intent', async () => {
  const body = await renderSSR(
    h(OperatorEmptyState, {
      config: {
        intent: 'no-data',
        title: 'No imported visibility records',
        description: 'Connect a source system before operator data appears.',
        actionLabel: 'Open import settings',
        placeholderDataPolicy: 'no-production-like-data',
      },
    }),
  );

  assert.ok(body.includes('facetheory-stitch-operator-empty-state'));
  assert.ok(body.includes('data-empty-intent="no-data"'));
  assert.ok(body.includes('data-placeholder-policy="no-production-like-data"'));
  assert.ok(body.includes('No imported visibility records'));
  assert.ok(body.includes('Open import settings'));
  assert.ok(!body.includes('Acme'));
});

test('GuardedOperatorShell renders authorized children only when authorized', async () => {
  const body = await renderSSR(
    h(GuardedOperatorShell, {
      guard: { state: 'authorized', principalLabel: 'Release Ops' },
      children: h(
        'div',
        { 'data-testid': 'release-dashboard' },
        'Release queue',
      ),
    }),
  );

  assert.ok(
    body.includes('facetheory-stitch-guarded-operator-shell-authorized'),
  );
  assert.ok(body.includes('data-operator-guard-state="authorized"'));
  assert.ok(body.includes('Release queue'));
  assert.ok(!body.includes('Operator access required'));
});

test('GuardedOperatorShell renders unauthorized state from caller-supplied guard status', async () => {
  const body = await renderSSR(
    h(GuardedOperatorShell, {
      guard: {
        state: 'unauthorized',
        principalLabel: 'readonly@example.com',
        reason: 'Missing release:write permission.',
        requestId: 'req_guard_123',
      },
      children: h('div', null, 'Sensitive release controls'),
    }),
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

test('GuardedOperatorShell renders deterministic loading state', async () => {
  const body = await renderSSR(
    h(GuardedOperatorShell, {
      guard: { state: 'loading', requestId: 'req_guard_loading' },
      children: h('div', null, 'Loaded dashboard'),
    }),
  );

  assert.ok(body.includes('facetheory-stitch-guarded-operator-shell-loading'));
  assert.ok(body.includes('data-empty-intent="loading"'));
  assert.ok(body.includes('Checking operator access'));
  assert.ok(body.includes('req_guard_loading'));
  assert.ok(!body.includes('Loaded dashboard'));
});

test('GuardedOperatorShell renders deterministic error state', async () => {
  const body = await renderSSR(
    h(GuardedOperatorShell, {
      guard: {
        state: 'error',
        reason: 'Autheory policy endpoint timed out.',
        requestId: 'req_guard_error',
      },
      children: h('div', null, 'Policy editor'),
    }),
  );

  assert.ok(body.includes('facetheory-stitch-guarded-operator-shell-error'));
  assert.ok(body.includes('data-empty-intent="error"'));
  assert.ok(body.includes('Operator access unavailable'));
  assert.ok(body.includes('Autheory policy endpoint timed out.'));
  assert.ok(body.includes('req_guard_error'));
  assert.ok(!body.includes('Policy editor'));
});

test('HealthStatusPanel renders health states, API metadata, and stale markers', async () => {
  const body = await renderSSR(
    h(HealthStatusPanel, {
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
        {
          key: 'partner-sync',
          label: 'Partner sync',
          status: 'unknown',
        },
      ],
    }),
  );

  assert.ok(body.includes('facetheory-stitch-health-status-panel'));
  assert.ok(body.includes('Release control plane health'));
  assert.ok(body.includes('Stable health observations from Lambda checks.'));
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

test('HealthStatusPanel renders an explicit empty health state', async () => {
  const body = await renderSSR(
    h(HealthStatusPanel, {
      rows: [],
      emptyLabel: 'No API health observations available yet.',
    }),
  );

  assert.ok(body.includes('facetheory-stitch-health-status-panel-empty'));
  assert.ok(body.includes('No API health observations available yet.'));
});

test('VisibilityMatrix renders entity dimensions with cell metadata and states', async () => {
  const body = await renderSSR(
    h(VisibilityMatrix, {
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
    }),
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

test('VisibilityMatrix renders explicit empty matrix cells', async () => {
  const body = await renderSSR(
    h(VisibilityMatrix, {
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
    }),
  );

  assert.ok(body.includes('facetheory-stitch-visibility-matrix-cell-empty'));
  assert.ok(body.includes('data-empty-cell="true"'));
  assert.ok(body.includes('No imported visibility record'));
  assert.ok(body.includes('data-cell-state="unknown"'));
});

test('DataTable renders toolbar slots, rows, and the row-actions column', async () => {
  const body = await renderSSR(
    h(DataTable<Partner>, {
      rowKey: 'key',
      dataSource: samplePartners,
      columns: [
        { key: 'name', dataIndex: 'name', title: 'Name' },
        { key: 'status', dataIndex: 'status', title: 'Status' },
      ],
      toolbar: {
        left: h('span', null, '2 partners'),
        center: h('input', { placeholder: 'Search' }),
        right: h('button', null, 'New partner'),
      },
      rowActions: (record) => h('button', { 'data-key': record.key }, 'Edit'),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-data-table'));
  assert.ok(body.includes('facetheory-stitch-data-table-toolbar'));
  assert.ok(body.includes('2 partners'));
  assert.ok(body.includes('Search'));
  assert.ok(body.includes('New partner'));
  assert.ok(body.includes('Acme Corp'));
  assert.ok(body.includes('Globex'));
  assert.ok(body.includes('data-key="1"'));
  assert.ok(body.includes('data-key="2"'));
});

test('DataTable renders the empty state when dataSource is empty', async () => {
  const body = await renderSSR(
    h(DataTable<Partner>, {
      rowKey: 'key',
      dataSource: [],
      columns: [{ key: 'name', dataIndex: 'name', title: 'Name' }],
      emptyLabel: 'No partners yet',
    }),
  );
  assert.ok(body.includes('No partners yet'));
});

test('PropertyGrid renders key/value pairs and respects span="full"', async () => {
  const body = await renderSSR(
    h(PropertyGrid, {
      items: [
        { key: 'id', label: 'Tenant ID', value: 'acme-prod' },
        { key: 'created', label: 'Created', value: '2025-12-01' },
        {
          key: 'note',
          label: 'Notes',
          value: 'Full-width note that spans both columns',
          span: 'full',
        },
      ],
    }),
  );
  assert.ok(body.includes('facetheory-stitch-property-grid'));
  assert.ok(body.includes('Tenant ID'));
  assert.ok(body.includes('acme-prod'));
  assert.ok(body.includes('Full-width note'));
});

test('DetailPanel renders title, description, actions, and a PropertyGrid', async () => {
  const body = await renderSSR(
    h(DetailPanel, {
      title: 'Acme Corp',
      description: 'Tenant overview',
      actions: h('button', null, 'Edit'),
      properties: [
        { key: 'id', label: 'Tenant ID', value: 'acme-prod' },
        { key: 'plan', label: 'Plan', value: 'Enterprise' },
      ],
    }),
  );
  assert.ok(body.includes('facetheory-stitch-detail-panel'));
  assert.ok(body.includes('Acme Corp'));
  assert.ok(body.includes('Tenant overview'));
  assert.ok(body.includes('Enterprise'));
});

test('SplitForm + FormRow render label/description/control + error region', async () => {
  const body = await renderSSR(
    h(SplitForm, {
      children: [
        h(FormRow, {
          key: 'email',
          label: 'Email',
          description: 'The admin contact for this tenant',
          required: true,
          children: h('input', { type: 'email', name: 'email' }),
        }),
        h(FormRow, {
          key: 'slug',
          label: 'Slug',
          error: 'Slug is already taken',
          children: h('input', { type: 'text', name: 'slug' }),
        }),
      ],
    }),
  );
  assert.ok(body.includes('facetheory-stitch-split-form'));
  assert.ok(body.includes('facetheory-stitch-form-row'));
  assert.ok(body.includes('Email'));
  assert.ok(body.includes('The admin contact for this tenant'));
  assert.ok(body.includes('Slug is already taken'));
  assert.ok(body.includes('role="alert"'));
  assert.ok(body.includes('*'));
});

test('FormSection wraps FormRows with a heading and description', async () => {
  const body = await renderSSR(
    h(FormSection, {
      title: 'Authentication',
      description: 'Control how users sign in to this tenant',
      children: h(FormRow, {
        label: 'Allow passwords',
        children: h('input', { type: 'checkbox' }),
      }),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-form-section'));
  assert.ok(body.includes('Authentication'));
  assert.ok(body.includes('Allow passwords'));
});

test('StatusTag renders each variant with the correct class and default label', async () => {
  const variants = [
    'active',
    'pending',
    'suspended',
    'archived',
    'error',
    'warning',
    'allow',
    'deny',
  ] as const;
  for (const variant of variants) {
    const body = await renderSSR(h(StatusTag, { variant }));
    assert.ok(body.includes(`facetheory-stitch-status-tag-${variant}`));
  }
});

test('StatusTag policy variants render their default labels', async () => {
  const allow = await renderSSR(h(StatusTag, { variant: 'allow' }));
  assert.ok(allow.includes('Allow'));
  const deny = await renderSSR(h(StatusTag, { variant: 'deny' }));
  assert.ok(deny.includes('Deny'));
  const warning = await renderSSR(h(StatusTag, { variant: 'warning' }));
  assert.ok(warning.includes('Warning'));
});

test('StatusTag supports a custom label override', async () => {
  const body = await renderSSR(
    h(StatusTag, { variant: 'active', label: 'Active · 12 members' }),
  );
  assert.ok(body.includes('Active · 12 members'));
});

test('DestructiveConfirm renders title, description, and default button labels', async () => {
  const body = await renderSSR(
    h(DestructiveConfirm, {
      title: 'Delete partner?',
      description: 'This permanently removes Acme Corp and its members.',
    }),
  );
  assert.ok(body.includes('facetheory-stitch-destructive-confirm'));
  assert.ok(body.includes('Delete partner?'));
  assert.ok(body.includes('permanently removes Acme Corp'));
  assert.ok(body.includes('Cancel'));
  assert.ok(body.includes('Delete'));
});

test('DestructiveConfirm with requireText renders a guarded text input', async () => {
  const body = await renderSSR(
    h(DestructiveConfirm, {
      title: 'Delete tenant?',
      requireText: 'acme-prod',
    }),
  );
  // JSX escapes quotes to &quot; in HTML output.
  assert.ok(body.includes('Type &quot;acme-prod&quot; to confirm'));
});

test('Tabs renders labels, count badges, and the active panel content', async () => {
  const body = await renderSSR(
    h(Tabs, {
      activeKey: 'policies',
      items: [
        { key: 'policies', label: 'Knowledge Policies', count: 8 },
        { key: 'catalog', label: 'Knowledge Catalog', count: 12 },
      ],
      children: h('div', { 'data-testid': 'policies-body' }, 'policies body'),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-tabs'));
  assert.ok(body.includes('facetheory-stitch-tabs-label'));
  assert.ok(body.includes('Knowledge Policies'));
  assert.ok(body.includes('Knowledge Catalog'));
  // Count badges render inside a facetheory class.
  assert.ok(body.includes('facetheory-stitch-tabs-count'));
  assert.ok(body.includes('policies body'));
});

test('Tabs uses defaultActiveKey when activeKey is omitted', async () => {
  const body = await renderSSR(
    h(Tabs, {
      defaultActiveKey: 'catalog',
      items: [
        { key: 'policies', label: 'Policies' },
        { key: 'catalog', label: 'Catalog' },
      ],
      children: h('div', { 'data-testid': 'catalog-body' }, 'catalog body'),
    }),
  );
  assert.ok(body.includes('catalog body'));
});

test('Tabs hides items flagged hidden', async () => {
  const body = await renderSSR(
    h(Tabs, {
      items: [
        { key: 'policies', label: 'Policies' },
        { key: 'catalog', label: 'Catalog', hidden: true },
      ],
    }),
  );
  assert.ok(body.includes('Policies'));
  assert.ok(!body.includes('Catalog'));
});

test('FilterChip renders label, count, and a removal affordance', async () => {
  const body = await renderSSR(
    h(FilterChip, {
      key: 'status-active',
      label: 'status: active',
      count: 124,
    }),
  );
  assert.ok(body.includes('facetheory-stitch-filter-chip'));
  assert.ok(body.includes('status: active'));
  assert.ok(body.includes('124'));
  assert.ok(body.includes('facetheory-stitch-filter-chip-remove'));
});

test('FilterChipGroup lays out multiple chips with a trailing slot', async () => {
  const body = await renderSSR(
    h(FilterChipGroup, {
      chips: [
        { key: 'status', label: 'status: active' },
        { key: 'manifest', label: 'manifest: stale', count: 2 },
      ],
      trailing: h('a', { href: '#clear' }, 'Clear all'),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-filter-chip-group'));
  assert.ok(body.includes('status: active'));
  assert.ok(body.includes('manifest: stale'));
  assert.ok(body.includes('Clear all'));
});

test('FilterChip omits the remove affordance when removable is false', async () => {
  const body = await renderSSR(
    h(FilterChip, {
      key: 'system',
      label: 'system: locked',
      removable: false,
    }),
  );
  assert.ok(body.includes('system: locked'));
  assert.ok(!body.includes('facetheory-stitch-filter-chip-remove'));
});

test('InlineKeyValueList renders dense label/value rows', async () => {
  const body = await renderSSR(
    h(InlineKeyValueList, {
      entries: [
        { key: 'org', label: 'ORG', value: 'org_882910' },
        { key: 'wksp', label: 'WKSP', value: 'ws_prod_01' },
        { key: 'client', label: 'CLIENT', value: 'cli_99x_z2' },
      ],
    }),
  );
  assert.ok(body.includes('facetheory-stitch-inline-key-value-list'));
  assert.ok(body.includes('ORG'));
  assert.ok(body.includes('org_882910'));
  assert.ok(body.includes('WKSP'));
  assert.ok(body.includes('cli_99x_z2'));
});

test('CopyableCode renders the code chip and a copy button', async () => {
  const body = await renderSSR(
    h(CopyableCode, { code: 'lab.theorymcp.ai/theorycloud/mcp' }),
  );
  assert.ok(body.includes('facetheory-stitch-copyable-code'));
  assert.ok(body.includes('lab.theorymcp.ai/theorycloud/mcp'));
  assert.ok(body.includes('facetheory-stitch-copyable-code-button'));
  assert.ok(body.includes('aria-label="Copy"'));
});

test('CopyableCode separates visible content from copy payload via children', async () => {
  const body = await renderSSR(
    h(CopyableCode, {
      code: 'tenant_7f3a9c2b',
      children: h('span', null, 'tenant_7f3a…9c2b'),
    }),
  );
  assert.ok(body.includes('tenant_7f3a…9c2b'));
});

test('LogStream plain variant renders each row with a level class', async () => {
  const body = await renderSSR(
    h(LogStream, {
      entries: [
        {
          id: '1',
          timestamp: '09:42:12',
          level: 'info',
          message: 'Created demo-sandbox-01',
        },
        {
          id: '2',
          timestamp: '09:15:00',
          level: 'warn',
          actor: 'System_Bot',
          message: 'Archived legacy-test-env',
        },
        {
          id: '3',
          timestamp: '08:00:05',
          level: 'error',
          message: 'ERROR: key_0x4f2 invalid checksum',
        },
      ],
    }),
  );
  assert.ok(body.includes('facetheory-stitch-log-stream-plain'));
  assert.ok(body.includes('facetheory-stitch-log-stream-row-info'));
  assert.ok(body.includes('facetheory-stitch-log-stream-row-warn'));
  assert.ok(body.includes('facetheory-stitch-log-stream-row-error'));
  assert.ok(body.includes('Created demo-sandbox-01'));
  assert.ok(body.includes('System_Bot'));
});

test('LogStream terminal variant renders window chrome and a title', async () => {
  const body = await renderSSR(
    h(LogStream, {
      variant: 'terminal',
      title: 'repair_logs_tty1',
      entries: [
        {
          id: '1',
          timestamp: '14:02:11',
          level: 'debug',
          message: 'Initiating global state handshake...',
        },
        {
          id: '2',
          timestamp: '14:02:12',
          level: 'success',
          message: 'Handshake SUCCESS',
        },
      ],
    }),
  );
  assert.ok(body.includes('facetheory-stitch-log-stream-terminal'));
  assert.ok(body.includes('facetheory-stitch-log-stream-chrome'));
  assert.ok(body.includes('repair_logs_tty1'));
  assert.ok(body.includes('Handshake SUCCESS'));
});
