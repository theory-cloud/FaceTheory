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

import { WizardEditableTokenInputPanel as VueWizardEditableTokenInputPanel, WizardChipListPanel as VueWizardChipListPanel } from '../../src/vue/stitch-admin/index.js';
import type { WizardEditableTokenInput as VueWizardInput } from '../../src/stitch-admin/index.js';

const VUE_NOOP_CHANGE = (): void => {};

const VUE_BASE_INPUT: VueWizardInput = {
  inputId: 'vue-allowed-senders',
  value: ['qa@example.com', 'ops@example.com'],
  label: 'Allowed senders',
  description: 'Server validation remains authoritative.',
  placeholder: 'Add another address…',
  removeLabelKind: 'sender',
  safetyPolicy: 'no-secret-or-production-like-data',
};

test('vue stitch-admin: WizardEditableTokenInputPanel renders parity DOM with React adapter', async () => {
  const body = await renderSSR(
    h(VueWizardEditableTokenInputPanel, {
      input: VUE_BASE_INPUT,
      onChange: VUE_NOOP_CHANGE,
    }),
  );
  assert.ok(body.includes('facetheory-stitch-wizard-editable-token-input'));
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
  assert.ok(body.includes('data-input-id="vue-allowed-senders"'));
  assert.ok(body.includes('data-token-count="2"'));
  assert.ok(body.includes('data-token-value="qa@example.com"'));
  assert.ok(body.includes('data-token-value="ops@example.com"'));
  // Accessible remove buttons with kind-aware aria-label.
  assert.ok(body.includes('aria-label="Remove sender qa@example.com"'));
  assert.ok(body.includes('aria-label="Remove sender ops@example.com"'));
  // Label wired to input id and safety-policy footnote rendered.
  assert.ok(body.includes('for="vue-allowed-senders"'));
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
});

test('vue stitch-admin: WizardEditableTokenInputPanel surfaces invalid+duplicate feedback with role=alert', async () => {
  const invalidBody = await renderSSR(
    h(VueWizardEditableTokenInputPanel, {
      input: {
        ...VUE_BASE_INPUT,
        draftValue: 'not-an-email',
        validateToken: (token: string) =>
          token.includes('@')
            ? { valid: true }
            : { valid: false, message: 'Address must contain @' },
      },
      onChange: VUE_NOOP_CHANGE,
    }),
  );
  assert.ok(invalidBody.includes('role="alert"'));
  assert.ok(invalidBody.includes('data-feedback-source="validator"'));
  assert.ok(invalidBody.includes('Address must contain @'));

  const duplicateBody = await renderSSR(
    h(VueWizardEditableTokenInputPanel, {
      input: { ...VUE_BASE_INPUT, draftValue: 'qa@example.com' },
      onChange: VUE_NOOP_CHANGE,
    }),
  );
  assert.ok(duplicateBody.includes('data-feedback-source="duplicate"'));
  assert.ok(duplicateBody.includes('is already in the list'));
});

test('vue stitch-admin: WizardEditableTokenInputPanel is byte-identical across repeated SSR renders', async () => {
  const first = await renderSSR(
    h(VueWizardEditableTokenInputPanel, {
      input: VUE_BASE_INPUT,
      onChange: VUE_NOOP_CHANGE,
    }),
  );
  const second = await renderSSR(
    h(VueWizardEditableTokenInputPanel, {
      input: VUE_BASE_INPUT,
      onChange: VUE_NOOP_CHANGE,
    }),
  );
  assert.equal(first, second);
});

test('vue stitch-admin: WizardChipListPanel alias renders the same DOM as the canonical panel', async () => {
  const canonical = await renderSSR(
    h(VueWizardEditableTokenInputPanel, {
      input: VUE_BASE_INPUT,
      onChange: VUE_NOOP_CHANGE,
    }),
  );
  const alias = await renderSSR(
    h(VueWizardChipListPanel, {
      input: VUE_BASE_INPUT,
      onChange: VUE_NOOP_CHANGE,
    }),
  );
  assert.equal(canonical, alias);
});

import {
  WizardProgress as VueWizardProgress,
  WizardPackageSummaryPanel as VueWizardPackageSummaryPanel,
  WizardFindingListPanel as VueWizardFindingListPanel,
  WizardReconcileSummaryPanel as VueWizardReconcileSummaryPanel,
  WizardCapabilityReviewPanel as VueWizardCapabilityReviewPanel,
  WizardEnablementChecklistPanel as VueWizardEnablementChecklistPanel,
  WizardRecoveryStatusPanel as VueWizardRecoveryStatusPanel,
  WizardEmptyState as VueWizardEmptyState,
  WizardReconciliationPlanPanel as VueWizardReconciliationPlanPanel,
  WizardDiffListPanel as VueWizardDiffListPanel,
  WizardAuthorityContextStripPanel as VueWizardAuthorityContextStripPanel,
  WizardServerResolvedContextBarPanel as VueWizardServerResolvedContextBarPanel,
} from '../../src/vue/stitch-admin/index.js';
import type {
  WizardCapabilityReview as VueCapabilityReview,
  WizardEmptyStateConfig as VueEmptyStateConfig,
  WizardEnablementChecklist as VueEnablementChecklist,
  WizardFindingList as VueFindingList,
  WizardPackageSummary as VuePackageSummary,
  WizardProgressState as VueProgressState,
  WizardReconcileSummary as VueReconcileSummary,
  WizardRecoveryStatus as VueRecoveryStatus,
  WizardReconciliationPlan as VueReconciliationPlan,
  WizardAuthorityContextStrip as VueAuthorityContextStrip,
} from '../../src/stitch-admin/index.js';

test('vue wizard parity: WizardProgress renders caller-supplied steps with stable data attrs', async () => {
  const state: VueProgressState = {
    steps: [
      { key: 'connect', label: 'Connect', status: 'complete' },
      { key: 'validate', label: 'Validate', status: 'in-progress' },
      { key: 'review', label: 'Review', status: 'pending' },
    ],
    currentStepKey: 'validate',
  };
  const body = await renderSSR(h(VueWizardProgress, { state }));
  assert.ok(body.includes('facetheory-stitch-wizard-progress'));
  assert.ok(body.includes('data-step-count="3"'));
  assert.ok(body.includes('data-completed-count="1"'));
  assert.ok(body.includes('data-step-key="validate"'));
  assert.ok(body.includes('data-step-status="in-progress"'));
  assert.ok(body.includes('facetheory-stitch-wizard-step-active'));
});

test('vue wizard parity: WizardPackageSummaryPanel renders totals + per-file metadata', async () => {
  const summary: VuePackageSummary = {
    name: 'pkg',
    version: '0.1.0',
    files: [
      { key: 'a', path: 'agent.json', sizeBytes: 412, role: 'manifest' },
    ],
    totals: { fileCount: 1, byteCount: 412 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(h(VueWizardPackageSummaryPanel, { summary }));
  assert.ok(body.includes('facetheory-stitch-wizard-package-summary'));
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
  assert.ok(body.includes('data-file-count="1"'));
  assert.ok(body.includes('agent.json'));
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
});

test('vue wizard parity: WizardFindingListPanel renders severity counts and findings', async () => {
  const list: VueFindingList = {
    findings: [
      { id: 'f1', severity: 'info', title: 'Manifest parsed' },
      { id: 'f2', severity: 'error', title: 'Bad capability', evidence: 'cap[0]' },
    ],
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(h(VueWizardFindingListPanel, { list }));
  assert.ok(body.includes('facetheory-stitch-wizard-finding-list'));
  assert.ok(body.includes('data-finding-count="2"'));
  assert.ok(body.includes('data-finding-severity="info"'));
  assert.ok(body.includes('data-finding-severity="error"'));
  assert.ok(body.includes('Info: 1'));
  assert.ok(body.includes('Error: 1'));
  assert.ok(body.includes('cap[0]'));
});

test('vue wizard parity: WizardReconcileSummaryPanel redacts entries marked sensitive', async () => {
  const summary: VueReconcileSummary = {
    entries: [
      { key: 'a', label: 'a', kind: 'added' },
      { key: 'b', label: 'b', kind: 'changed', detail: 'super-secret', redacted: true },
      { key: 'c', label: 'c', kind: 'redacted' },
    ],
    totals: { added: 1, removed: 0, changed: 1, unchanged: 0, redacted: 1 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(h(VueWizardReconcileSummaryPanel, { summary }));
  assert.ok(body.includes('facetheory-stitch-wizard-reconcile-summary'));
  assert.ok(body.includes('Added: 1'));
  assert.ok(body.includes('Redacted: 1'));
  assert.ok(!body.includes('super-secret'));
  assert.ok(body.includes('[redacted]'));
});

test('vue wizard parity: WizardCapabilityReviewPanel suppresses sensitive/redacted details', async () => {
  const review: VueCapabilityReview = {
    capabilities: [
      { key: 'public', label: 'Public', intent: 'granted', sensitivity: 'public', detail: 'visible' },
      { key: 'sensitive', label: 'Sensitive', intent: 'requested', sensitivity: 'sensitive', detail: 'should-suppress' },
      { key: 'redacted', label: 'Redacted', intent: 'denied', sensitivity: 'redacted', detail: 'should-redact' },
    ],
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(h(VueWizardCapabilityReviewPanel, { review }));
  assert.ok(body.includes('visible'));
  assert.ok(!body.includes('should-suppress'));
  assert.ok(!body.includes('should-redact'));
  assert.ok(body.includes('Detail suppressed (sensitive).'));
  assert.ok(body.includes('[redacted]'));
});

test('vue wizard parity: WizardEnablementChecklistPanel renders caller summary + all-ready data attr', async () => {
  const checklist: VueEnablementChecklist = {
    items: [{ key: 'a', label: 'ready', status: 'ready' }],
    summaryLabel: '1 of 1 ready',
    allReady: true,
  };
  const body = await renderSSR(h(VueWizardEnablementChecklistPanel, { checklist }));
  assert.ok(body.includes('facetheory-stitch-wizard-enablement-checklist'));
  assert.ok(body.includes('data-all-ready="true"'));
  assert.ok(body.includes('1 of 1 ready'));
});

test('vue wizard parity: WizardRecoveryStatusPanel uses role=alert for failed state', async () => {
  const status: VueRecoveryStatus = { state: 'failed', description: 'Failed.' };
  const body = await renderSSR(h(VueWizardRecoveryStatusPanel, { status }));
  assert.ok(body.includes('data-recovery-state="failed"'));
  assert.ok(body.includes('role="alert"'));
  assert.ok(body.includes('Failed'));
});

test('vue wizard parity: WizardEmptyState renders safety-policy footnote', async () => {
  const config: VueEmptyStateConfig = {
    intent: 'no-data',
    title: 'No data',
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(h(VueWizardEmptyState, { config }));
  assert.ok(body.includes('data-empty-intent="no-data"'));
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
});

test('vue wizard parity: WizardReconciliationPlanPanel marks conflict/blocked/external prominent', async () => {
  const plan: VueReconciliationPlan = {
    rows: [
      { key: 'c', label: 'c', kind: 'conflict', reason: 'r' },
      { key: 'b', label: 'b', kind: 'blocked', reason: 'r' },
      { key: 'e', label: 'e', kind: 'external_step_required', reason: 'r' },
      { key: 's', label: 's', kind: 'satisfied' },
    ],
    totals: { create: 0, update: 0, satisfied: 1, conflict: 1, blocked: 1, external: 1, noop: 0 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(h(VueWizardReconciliationPlanPanel, { plan }));
  assert.ok(body.includes('data-row-kind="external"'));
  assert.ok(body.includes('data-row-kind-input="external_step_required"'));
  assert.ok(body.includes('data-row-prominent="true"'));
  // 3 prominent rows → 3 role=alert
  assert.equal(body.split('role="alert"').length - 1, 3);
});

test('vue wizard parity: WizardDiffListPanel alias renders identically to canonical', async () => {
  const plan: VueReconciliationPlan = {
    rows: [{ key: 'k', label: 'k', kind: 'create' }],
    totals: { create: 1, update: 0, satisfied: 0, conflict: 0, blocked: 0, external: 0, noop: 0 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const canonical = await renderSSR(h(VueWizardReconciliationPlanPanel, { plan }));
  const alias = await renderSSR(h(VueWizardDiffListPanel, { plan }));
  assert.equal(canonical, alias);
});

test('vue wizard parity: WizardAuthorityContextStripPanel renders text-labeled authority + read-only cues', async () => {
  const strip: VueAuthorityContextStrip = {
    items: [
      { key: 'tenant', label: 'Tenant', value: 'theory-mcp' },
      { key: 'route', label: 'MCP route', value: '/agents/acme', copyable: true },
    ],
    authorityLabel: 'Server-derived',
    readOnlyLabel: 'Read-only',
    layout: 'auto',
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(h(VueWizardAuthorityContextStripPanel, { strip }));
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
  assert.ok(body.includes('data-layout="auto"'));
  assert.ok(body.includes('Server-derived'));
  assert.ok(body.includes('aria-label="Read-only"'));
  assert.ok(body.includes('data-authority-label="true"'));
  assert.ok(body.includes('aria-label="Copy MCP route"'));
  assert.ok(body.includes('data-copy-value="/agents/acme"'));
});

test('vue wizard parity: WizardServerResolvedContextBarPanel alias renders identically', async () => {
  const strip: VueAuthorityContextStrip = {
    items: [{ key: 't', label: 'Tenant', value: 'theory-mcp' }],
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const canonical = await renderSSR(h(VueWizardAuthorityContextStripPanel, { strip }));
  const alias = await renderSSR(h(VueWizardServerResolvedContextBarPanel, { strip }));
  assert.equal(canonical, alias);
});

test('vue wizard parity: WizardPackageSummaryPanel renders summary.metadata via MetadataBadgeGroup', async () => {
  const summary: VuePackageSummary = {
    name: 'pkg',
    files: [],
    totals: { fileCount: 0 },
    safetyPolicy: 'no-secret-or-production-like-data',
    metadata: {
      authority: 'non-authoritative',
      provenance: { source: 'Factory import' },
    },
  };
  const body = await renderSSR(h(VueWizardPackageSummaryPanel, { summary }));
  assert.ok(body.includes('facetheory-stitch-metadata-badge-group'));
  assert.ok(body.includes('Non-authoritative'));
  assert.ok(body.includes('Factory import'));
});

test('vue wizard parity: WizardFindingListPanel renders per-finding.metadata via MetadataBadgeGroup', async () => {
  const list: VueFindingList = {
    findings: [
      {
        id: 'f1',
        severity: 'warning',
        title: 'Imported with provenance',
        metadata: { provenance: { source: 'Factory import' }, correlation: sampleCorrelation },
      },
    ],
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(h(VueWizardFindingListPanel, { list }));
  assert.ok(body.includes('facetheory-stitch-metadata-badge-group'));
  assert.ok(body.includes('Factory import'));
  assert.ok(body.includes('corr_release_20260424_001'));
});

test('vue wizard parity: WizardRecoveryStatusPanel renders status.metadata via MetadataBadgeGroup', async () => {
  const status: VueRecoveryStatus = {
    state: 'resumable',
    metadata: { provenance: { source: 'Session store' } },
  };
  const body = await renderSSR(h(VueWizardRecoveryStatusPanel, { status }));
  assert.ok(body.includes('data-recovery-state="resumable"'));
  assert.ok(body.includes('facetheory-stitch-metadata-badge-group'));
  assert.ok(body.includes('Session store'));
});

test('vue wizard parity: WizardReconciliationPlanPanel renders row.metadata via MetadataBadgeGroup', async () => {
  const plan: VueReconciliationPlan = {
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
  };
  const body = await renderSSR(h(VueWizardReconciliationPlanPanel, { plan }));
  assert.ok(body.includes('data-row-key="k"'));
  assert.ok(body.includes('facetheory-stitch-metadata-badge-group'));
  assert.ok(body.includes('Plan diff'));
});

import {
  SelectableCardGridPanel as VueSelectableCardGridPanel,
  ChoiceCard as VueChoiceCard,
} from '../../src/vue/stitch-admin/index.js';
import type {
  ChoiceCardProps as VueChoiceCardProps,
  SelectableCardGrid as VueSelectableCardGrid,
} from '../../src/stitch-admin/index.js';

const SELECTABLE_GRID_SINGLE: VueSelectableCardGrid = {
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
};

test('vue selectable-card-grid: single-select renders as radiogroup with role=radio cards', async () => {
  const body = await renderSSR(
    h(VueSelectableCardGridPanel, {
      grid: SELECTABLE_GRID_SINGLE,
      onChange: () => {},
    }),
  );
  assert.ok(body.includes('facetheory-stitch-selectable-card-grid'));
  assert.ok(body.includes('data-selection="single"'));
  assert.ok(body.includes('data-layout="grid"'));
  assert.ok(body.includes('role="radiogroup"'));
  assert.ok(body.includes('aria-labelledby="allowed-action-label"'));
  assert.ok(body.includes('aria-describedby="allowed-action-description"'));
  // 5 role=radio cards.
  assert.equal(body.split('role="radio"').length - 1, 5);
  assert.ok(body.includes('data-option-selected="true"'));
});

test('vue selectable-card-grid: renders recommended/risk/blocked TEXT pills + disabled reason wiring', async () => {
  const body = await renderSSR(
    h(VueSelectableCardGridPanel, {
      grid: SELECTABLE_GRID_SINGLE,
      onChange: () => {},
    }),
  );
  assert.ok(body.includes('data-pill="recommended"'));
  assert.ok(body.includes('Recommended'));
  assert.ok(body.includes('data-pill="risk"'));
  assert.ok(body.includes('High blast radius'));
  assert.ok(body.includes('data-pill="blocked"'));
  assert.ok(body.includes('Server policy blocks this.'));
  assert.ok(body.includes('id="allowed-action-archive-reason"'));
  assert.ok(body.includes('data-disabled-reason="true"'));
  assert.ok(body.includes('Requires operator review.'));
});

test('vue selectable-card-grid: multi-select renders as checkbox group', async () => {
  const grid: VueSelectableCardGrid = {
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
  };
  const body = await renderSSR(h(VueSelectableCardGridPanel, { grid, onChange: () => {} }));
  assert.ok(body.includes('data-selection="multi"'));
  assert.ok(body.includes('role="group"'));
  assert.equal(body.split('role="checkbox"').length - 1, 3);
  assert.equal(body.split('aria-checked="true"').length - 1, 2);
  assert.equal(body.split('aria-checked="false"').length - 1, 1);
});

test('vue selectable-card-grid: byte-identical SSR for the same input', async () => {
  const first = await renderSSR(
    h(VueSelectableCardGridPanel, { grid: SELECTABLE_GRID_SINGLE, onChange: () => {} }),
  );
  const second = await renderSSR(
    h(VueSelectableCardGridPanel, { grid: SELECTABLE_GRID_SINGLE, onChange: () => {} }),
  );
  assert.equal(first, second);
});

test('vue ChoiceCard renders standalone card with selection family + safety policy', async () => {
  const card: VueChoiceCardProps = {
    cardId: 'choice-create',
    option: { key: 'create', title: 'Create', recommended: true },
    selection: 'single',
    selected: true,
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(h(VueChoiceCard, { card }));
  assert.ok(body.includes('facetheory-stitch-choice-card'));
  assert.ok(body.includes('role="radio"'));
  assert.ok(body.includes('aria-checked="true"'));
  assert.ok(body.includes('data-selection-family="single"'));
  assert.ok(body.includes('data-option-recommended="true"'));
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
});

import {
  PackageSourceInputPanel as VuePackageSourceInputPanel,
  CodeDropzone as VueCodeDropzone,
} from '../../src/vue/stitch-admin/index.js';
import type {
  CodeDropzoneProps as VueCodeDropzoneProps,
  PackageSourceInput as VuePackageSourceInput,
} from '../../src/stitch-admin/index.js';

test('vue package-source-input: renders paste/dropzone/upload modes with stable data attrs', async () => {
  const input: VuePackageSourceInput = {
    groupId: 'pkg-src',
    value: 'name: acme\n',
    state: 'validating',
    errors: [],
    modes: ['paste', 'dropzone', 'upload'],
    label: 'Package source',
    description: 'TheoryMCP validates server-side.',
    fileAccept: '.yaml,.yml,.json',
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(
    h(VuePackageSourceInputPanel, { input, onValueChange: () => {}, onFiles: () => {} }),
  );
  assert.ok(body.includes('facetheory-stitch-package-source-input'));
  assert.ok(body.includes('data-state="validating"'));
  assert.ok(body.includes('data-modes="paste dropzone upload"'));
  assert.ok(body.includes('id="pkg-src-paste"'));
  assert.ok(body.includes('data-mode="paste"'));
  assert.ok(body.includes('data-mode="dropzone"'));
  assert.ok(body.includes('data-mode="upload"'));
  assert.ok(body.includes('accept=".yaml,.yml,.json"'));
  assert.ok(body.includes('Validating source'));
  assert.ok(body.includes('role="status"'));
});

test('vue package-source-input: renders forbidden + redacted error kinds, never raw secret evidence', async () => {
  const input: VuePackageSourceInput = {
    groupId: 'pkg-redacted',
    value: '',
    state: 'redacted',
    errors: [
      {
        id: 'red-1',
        kind: 'redacted',
        message: 'Manifest contains redacted content.',
        evidence: 'AKIA-NEVER-SHOWN-VUE-1234567890',
      },
    ],
    modes: ['paste'],
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(h(VuePackageSourceInputPanel, { input, onValueChange: () => {} }));
  assert.ok(body.includes('data-state="redacted"'));
  assert.ok(body.includes('data-error-kind="redacted"'));
  assert.ok(body.includes('Manifest contains redacted content.'));
  assert.equal(body.includes('AKIA-NEVER-SHOWN-VUE-1234567890'), false);
});

test('vue package-source-input: byte-identical SSR for same input', async () => {
  const input: VuePackageSourceInput = {
    groupId: 'pkg-det',
    value: 'x',
    state: 'idle',
    errors: [],
    modes: ['paste'],
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const first = await renderSSR(h(VuePackageSourceInputPanel, { input, onValueChange: () => {} }));
  const second = await renderSSR(h(VuePackageSourceInputPanel, { input, onValueChange: () => {} }));
  assert.equal(first, second);
});

test('vue code-dropzone: renders state-labeled dropzone with file metadata', async () => {
  const dropzone: VueCodeDropzoneProps = {
    dropzoneId: 'drop-vue',
    label: 'Drop a package',
    state: 'ready',
    fileMeta: { name: 'acme.yaml', sizeBytes: 412 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(h(VueCodeDropzone, { dropzone }));
  assert.ok(body.includes('facetheory-stitch-code-dropzone'));
  assert.ok(body.includes('data-dropzone-id="drop-vue"'));
  assert.ok(body.includes('data-state="ready"'));
  assert.ok(body.includes('Ready for server preview'));
  assert.ok(body.includes('data-file-name="acme.yaml"'));
});
