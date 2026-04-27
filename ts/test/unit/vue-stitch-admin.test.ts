import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import type { OperatorCorrelationMetadata } from '../../src/stitch-admin/index.js';
import { createVueFace, h } from '../../src/vue/index.js';
import {
  CopyableCode,
  DataTable,
  DestructiveConfirm,
  DetailPanel,
  FilterChipGroup,
  GuardedOperatorShell,
  HealthStatusPanel,
  VisibilityMatrix,
  FormRow,
  FormSection,
  InlineKeyValueList,
  LogStream,
  MetadataBadge,
  MetadataBadgeGroup,
  NonAuthoritativeBanner,
  OperatorEmptyState,
  PropertyGrid,
  SplitForm,
  StatusTag,
  Tabs,
} from '../../src/vue/stitch-admin/index.js';

const sampleCorrelation = {
  correlationId: 'corr_release_20260424_001',
  correlationSource: 'eventbridge.envelope',
  trigger: 'eventbridge',
  requestId: 'lambda_req_123',
} satisfies OperatorCorrelationMetadata;

async function renderSSR(vnode: ReturnType<typeof h>): Promise<string> {
  const app = createFaceApp({
    faces: [
      createVueFace({
        route: '/',
        mode: 'ssr',
        render: () => vnode,
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  return new TextDecoder().decode(resp.body as Uint8Array);
}

test('vue stitch-admin: operator visibility notices render parity metadata', async () => {
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

test('vue stitch-admin: MetadataBadgeGroup renders provenance, correlation, and stable freshness', async () => {
  const body = await renderSSR(
    h(MetadataBadgeGroup, {
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
    }),
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

test('vue stitch-admin: MetadataBadge blocks executable href protocols', async () => {
  const body = await renderSSR(
    h(MetadataBadge, {
      label: 'Unsafe source',
      href: 'data:text/html,<script>alert(1)</script>',
    }),
  );

  assert.ok(body.includes('Unsafe source'));
  assert.equal(body.includes('<a'), false);
  assert.equal(body.includes('data:text/html'), false);
});

test('vue stitch-admin: OperatorEmptyState renders explicit no-mock intent', async () => {
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

test('vue stitch-admin: GuardedOperatorShell renders authorized default slot', async () => {
  const body = await renderSSR(
    h(
      GuardedOperatorShell,
      { guard: { state: 'authorized', principalLabel: 'Release Ops' } },
      {
        default: () =>
          h('div', { 'data-testid': 'release-dashboard' }, 'Release queue'),
      },
    ),
  );

  assert.ok(
    body.includes('facetheory-stitch-guarded-operator-shell-authorized'),
  );
  assert.ok(body.includes('data-operator-guard-state="authorized"'));
  assert.ok(body.includes('Release queue'));
  assert.ok(!body.includes('Operator access required'));
});

test('vue stitch-admin: GuardedOperatorShell renders default unauthorized, loading, and error states', async () => {
  const body = await renderSSR(
    h('div', null, [
      h(
        GuardedOperatorShell,
        {
          guard: {
            state: 'unauthorized',
            principalLabel: 'readonly@example.com',
            reason: 'Missing release:write permission.',
            requestId: 'req_guard_123',
          },
        },
        { default: () => h('div', null, 'Sensitive release controls') },
      ),
      h(
        GuardedOperatorShell,
        { guard: { state: 'loading', requestId: 'req_guard_loading' } },
        { default: () => h('div', null, 'Loaded dashboard') },
      ),
      h(
        GuardedOperatorShell,
        {
          guard: {
            state: 'error',
            reason: 'Autheory policy endpoint timed out.',
            requestId: 'req_guard_error',
          },
        },
        { default: () => h('div', null, 'Policy editor') },
      ),
    ]),
  );

  assert.ok(
    body.includes('facetheory-stitch-guarded-operator-shell-unauthorized'),
  );
  assert.ok(body.includes('data-empty-intent="not-authorized"'));
  assert.ok(body.includes('Operator access required'));
  assert.ok(body.includes('Missing release:write permission.'));
  assert.ok(body.includes('readonly@example.com'));
  assert.ok(body.includes('req_guard_123'));
  assert.ok(body.includes('facetheory-stitch-guarded-operator-shell-loading'));
  assert.ok(body.includes('data-empty-intent="loading"'));
  assert.ok(body.includes('Checking operator access'));
  assert.ok(body.includes('req_guard_loading'));
  assert.ok(body.includes('facetheory-stitch-guarded-operator-shell-error'));
  assert.ok(body.includes('data-empty-intent="error"'));
  assert.ok(body.includes('Operator access unavailable'));
  assert.ok(body.includes('Autheory policy endpoint timed out.'));
  assert.ok(body.includes('req_guard_error'));
  assert.ok(!body.includes('Sensitive release controls'));
  assert.ok(!body.includes('Loaded dashboard'));
  assert.ok(!body.includes('Policy editor'));
});

test('vue stitch-admin: GuardedOperatorShell accepts named fallback slots', async () => {
  const body = await renderSSR(
    h(
      GuardedOperatorShell,
      { guard: { state: 'unauthorized' } },
      {
        default: () => h('div', null, 'Operator body'),
        unauthorized: () => h('aside', null, 'Custom unauthorized slot'),
      },
    ),
  );

  assert.ok(
    body.includes('facetheory-stitch-guarded-operator-shell-unauthorized'),
  );
  assert.ok(body.includes('Custom unauthorized slot'));
  assert.ok(!body.includes('Operator body'));
  assert.ok(!body.includes('Operator access required'));
});

test('vue stitch-admin: HealthStatusPanel renders degraded/stale health states', async () => {
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
        { key: 'partner-sync', label: 'Partner sync', status: 'unknown' },
      ],
    }),
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

test('vue stitch-admin: HealthStatusPanel renders empty health observations', async () => {
  const body = await renderSSR(
    h(HealthStatusPanel, {
      rows: [],
      emptyLabel: 'No API health observations available yet.',
    }),
  );

  assert.ok(body.includes('facetheory-stitch-health-status-panel-empty'));
  assert.ok(body.includes('No API health observations available yet.'));
});

test('vue stitch-admin: VisibilityMatrix renders cell metadata and states', async () => {
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

test('vue stitch-admin: VisibilityMatrix renders explicit empty matrix cells', async () => {
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

test('vue stitch-admin: DataTable renders toolbar content, rows, and row actions', async () => {
  const body = await renderSSR(
    h(
      DataTable,
      {
        rowKey: 'key',
        dataSource: [
          { key: '1', name: 'Acme Corp', status: 'active' },
          { key: '2', name: 'Globex', status: 'pending' },
        ],
        columns: [
          { key: 'name', dataIndex: 'name', title: 'Name' },
          { key: 'status', dataIndex: 'status', title: 'Status' },
        ],
      },
      {
        'toolbar-left': () => h('span', null, '2 partners'),
        'toolbar-center': () => h('input', { placeholder: 'Search' }),
        'toolbar-right': () => h('button', null, 'New partner'),
        rowActions: ({ record }: { record: { key: string } }) =>
          h('button', { 'data-key': record.key }, 'Edit'),
      },
    ),
  );

  assert.ok(body.includes('facetheory-stitch-data-table'));
  assert.ok(body.includes('facetheory-stitch-data-table-toolbar'));
  assert.ok(body.includes('2 partners'));
  assert.ok(body.includes('Search'));
  assert.ok(body.includes('New partner'));
  assert.ok(body.includes('data-key="1"'));
  assert.ok(body.includes('data-key="2"'));
});

test('vue stitch-admin: detail, form, status, and destructive primitives render parity markers', async () => {
  const body = await renderSSR(
    h('div', null, [
      h(PropertyGrid, {
        items: [
          { key: 'id', label: 'Tenant ID', value: 'acme-prod' },
          {
            key: 'note',
            label: 'Notes',
            value: 'Full-width note',
            span: 'full',
          },
        ],
      }),
      h(DetailPanel, {
        title: 'Acme Corp',
        description: 'Tenant overview',
        actions: h('button', null, 'Edit'),
        properties: [
          { key: 'id', label: 'Tenant ID', value: 'acme-prod' },
          { key: 'plan', label: 'Plan', value: 'Enterprise' },
        ],
      }),
      h(SplitForm, null, {
        default: () => [
          h(
            FormRow,
            {
              label: 'Email',
              description: 'The admin contact for this tenant',
              required: true,
              error: 'Email is required',
            },
            { default: () => h('input', { type: 'email' }) },
          ),
          h(
            FormSection,
            {
              title: 'Authentication',
              description: 'Control how users sign in to this tenant',
            },
            {
              default: () =>
                h(
                  FormRow,
                  { label: 'Allow passwords' },
                  { default: () => h('input', { type: 'checkbox' }) },
                ),
            },
          ),
        ],
      }),
      h(StatusTag, { variant: 'active', label: 'Active · 12 members' }),
      h(DestructiveConfirm, {
        title: 'Delete tenant?',
        requireText: 'acme-prod',
      }),
    ]),
  );

  assert.ok(body.includes('facetheory-stitch-property-grid'));
  assert.ok(body.includes('facetheory-stitch-detail-panel'));
  assert.ok(body.includes('facetheory-stitch-form-row'));
  assert.ok(body.includes('facetheory-stitch-form-section'));
  assert.ok(body.includes('role="alert"'));
  assert.ok(body.includes('facetheory-stitch-status-tag-active'));
  assert.ok(body.includes('Active · 12 members'));
  assert.ok(body.includes('Type &quot;acme-prod&quot; to confirm'));
});

test('vue stitch-admin: tabs, chips, key-value rows, copy code, logs, and policy variants render parity markers', async () => {
  const body = await renderSSR(
    h('div', null, [
      h(
        Tabs,
        {
          activeKey: 'policies',
          items: [
            { key: 'policies', label: 'Knowledge Policies', count: 8 },
            { key: 'catalog', label: 'Knowledge Catalog', count: 12 },
          ],
        },
        {
          default: () =>
            h('div', { 'data-testid': 'policies-body' }, 'policies body'),
        },
      ),
      h(
        FilterChipGroup,
        {
          chips: [
            { key: 'status', label: 'status: active' },
            { key: 'manifest', label: 'manifest: stale', count: 2 },
          ],
        },
        {
          trailing: () => h('a', { href: '#clear' }, 'Clear all'),
        },
      ),
      h(InlineKeyValueList, {
        entries: [
          { key: 'org', label: 'ORG', value: 'org_882910' },
          { key: 'wksp', label: 'WKSP', value: 'ws_prod_01' },
        ],
      }),
      h(CopyableCode, { code: 'lab.theorymcp.ai/theorycloud/mcp' }),
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
      h(StatusTag, { variant: 'allow' }),
      h(StatusTag, { variant: 'deny' }),
      h(StatusTag, { variant: 'warning' }),
    ]),
  );

  assert.ok(body.includes('facetheory-stitch-tabs'));
  assert.ok(body.includes('facetheory-stitch-tabs-count'));
  assert.ok(body.includes('policies body'));
  assert.ok(body.includes('facetheory-stitch-filter-chip-group'));
  assert.ok(body.includes('facetheory-stitch-filter-chip-remove'));
  assert.ok(body.includes('Clear all'));
  assert.ok(body.includes('facetheory-stitch-inline-key-value-list'));
  assert.ok(body.includes('org_882910'));
  assert.ok(body.includes('facetheory-stitch-copyable-code'));
  assert.ok(body.includes('aria-label="Copy"'));
  assert.ok(body.includes('facetheory-stitch-log-stream-terminal'));
  assert.ok(body.includes('repair_logs_tty1'));
  assert.ok(body.includes('Handshake SUCCESS'));
  assert.ok(body.includes('facetheory-stitch-status-tag-allow'));
  assert.ok(body.includes('facetheory-stitch-status-tag-deny'));
  assert.ok(body.includes('facetheory-stitch-status-tag-warning'));
  assert.ok(body.includes('Allow'));
  assert.ok(body.includes('Deny'));
  assert.ok(body.includes('Warning'));
});
