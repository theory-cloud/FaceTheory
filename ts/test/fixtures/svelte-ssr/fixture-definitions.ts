import type { SvelteSsrFixtureDefinition } from '../../helpers/svelte-ssr-fixtures.js';

const safetyPolicy = 'no-secret-or-production-like-data';

const sampleCorrelation = {
  correlationId: 'corr_fixture_20260704_001',
  correlationSource: 'fixture.envelope',
  trigger: 'unit-test',
  requestId: 'req_fixture_001',
};

const sampleMetadata = {
  authority: 'non-authoritative',
  provenance: {
    source: 'Fixture manifest',
    sourceId: 'fixture-source-001',
    observedAt: '2026-04-24T18:30:00.000Z',
    href: '/fixtures/source-manifest',
  },
  correlation: sampleCorrelation,
  confidence: {
    level: 'medium',
    label: 'Medium confidence',
    reason: 'Fixture confidence is caller-supplied.',
  },
  staleness: {
    state: 'stale',
    ageLabel: 'fixture refreshed 10 minutes ago',
    reason: 'Fixture freshness window elapsed.',
  },
};

const navItems = [
  { key: '/dashboard', label: 'Dashboard', path: '/dashboard', icon: 'D' },
  {
    key: 'settings-group',
    label: 'Settings',
    children: [
      { key: '/settings/profile', label: 'Profile', path: '/settings/profile' },
      { key: '/settings/billing', label: 'Billing', path: '/settings/billing' },
    ],
  },
  { key: '/hidden', label: 'Hidden', path: '/hidden', hidden: true },
];

const breadcrumbs = [
  { key: 'home', label: 'Home', path: '/' },
  { key: 'settings', label: 'Settings', path: '/settings' },
  { key: 'profile', label: 'Profile' },
];

const auditTrail = {
  groupId: 'fixture-audit',
  label: 'Fixture audit trail',
  description: 'Server-provided events captured for Svelte SSR parity.',
  variant: 'detailed',
  safetyPolicy,
  metadata: sampleMetadata,
  groups: [
    {
      id: 'fixture-audit-group-parse',
      label: 'Parse',
      description: 'Package parsing completed.',
      expanded: true,
      events: [
        {
          id: 'fixture-audit-event-1',
          timestamp: '2026-04-24T18:30:00.000Z',
          actor: 'Fixture agent',
          actorSource: 'Server-derived',
          title: 'Manifest parsed',
          body: 'Parsed deterministic fixture manifest.',
          icon: '✓',
          tone: 'success',
          status: 'success',
          externalLink: { href: '/fixtures/audit/manifest', label: 'Manifest' },
          metadata: [
            { key: 'route', label: 'Route', value: '/fixtures/svelte' },
            { key: 'mode', label: 'Mode', value: 'SSR' },
          ],
        },
        {
          id: 'fixture-audit-event-2',
          timestamp: '2026-04-24T18:31:00.000Z',
          actor: 'Fixture guard',
          title: 'Policy warning',
          body: 'Review required before publish.',
          tone: 'warning',
          status: 'warning',
        },
      ],
    },
    {
      id: 'fixture-audit-group-redacted',
      label: 'Redaction',
      expanded: true,
      events: [
        {
          id: 'fixture-audit-event-redacted',
          timestamp: '2026-04-24T18:32:00.000Z',
          actor: 'Fixture redactor',
          title: 'Suppressed value',
          body: 'DO_NOT_RENDER_FIXTURE_SECRET',
          tone: 'danger',
          status: 'error',
          redactedMarker: '[redacted by fixture policy]',
        },
      ],
    },
  ],
};

const disclosurePanel = {
  panelId: 'fixture-disclosure',
  label: 'Fixture disclosure',
  description: 'Expanded content is server supplied.',
  expanded: true,
  tone: 'info',
  status: 'info',
  safetyPolicy,
};

const healthRows = [
  {
    key: 'fixture-api',
    label: 'Fixture API',
    status: 'healthy',
    description: 'Lambda URL responded successfully.',
    detail: 'p95 83ms',
    checkedAt: '2026-04-24T22:00:00.000Z',
    metadata: {
      provenance: { source: 'fixture-health-check', sourceId: 'health-001' },
      staleness: { state: 'fresh', ageLabel: 'checked 1 minute ago' },
    },
  },
  {
    key: 'fixture-worker',
    label: 'Fixture worker',
    status: 'degraded',
    description: 'Queue depth exceeded warning threshold.',
    detail: 'depth 42',
    checkedAt: '2026-04-24T21:58:00.000Z',
    metadata: {
      provenance: { source: 'fixture-cloudwatch' },
      staleness: {
        state: 'stale',
        ageLabel: 'checked 9 minutes ago',
        reason: 'Worker metrics are outside the freshness window.',
      },
    },
  },
  {
    key: 'fixture-audit',
    label: 'Fixture audit',
    status: 'down',
    detail: 'HTTP 503',
  },
  { key: 'fixture-sync', label: 'Fixture sync', status: 'unknown' },
];

const visibilityDimensions = [
  { key: 'checkout-prod', label: 'Checkout production' },
  { key: 'checkout-sandbox', label: 'Checkout sandbox' },
  { key: 'payouts-prod', label: 'Payouts production' },
];

const visibilityRows = [
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
          provenance: { source: 'visibility-import', sourceId: 'vis-001' },
          confidence: { level: 'high', label: 'High confidence' },
          staleness: { state: 'fresh', ageLabel: 'refreshed 3 minutes ago' },
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
            reason: 'Import passed its freshness window.',
          },
        },
      },
      {
        entityKey: 'partner-alpha',
        dimensionKey: 'payouts-prod',
        state: 'blocked',
        detail: 'Missing payout capability.',
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
];

const selectableGrid = {
  groupId: 'fixture-action',
  selection: 'single',
  selectedKeys: ['create'],
  options: [
    {
      key: 'create',
      title: 'Create',
      description: 'Create a fixture entry.',
      tone: 'success',
      recommended: true,
    },
    {
      key: 'reuse',
      title: 'Reuse',
      description: 'Reuse the existing entry.',
      tone: 'info',
    },
    {
      key: 'replace',
      title: 'Replace',
      tone: 'warning',
      riskLabel: 'High blast radius',
    },
    {
      key: 'archive',
      title: 'Archive',
      disabledReason: 'Requires operator review.',
    },
    {
      key: 'forbidden',
      title: 'Forbidden',
      blocked: true,
      blockedReason: 'Server policy blocks this.',
    },
  ],
  label: 'Fixture action',
  description: 'TheoryMCP resolves availability per route.',
  layout: 'grid',
  safetyPolicy,
};

const choiceCard = {
  cardId: 'choice-create',
  option: {
    key: 'create',
    title: 'Create',
    description: 'Create a fixture entry.',
    recommended: true,
  },
  selection: 'single',
  selected: true,
  safetyPolicy,
};

const packageInput = {
  groupId: 'pkg-src',
  value: 'name: fixture\n',
  state: 'invalid',
  errors: [
    {
      id: 'syntax-1',
      kind: 'invalid-syntax',
      message: 'Expected top-level mapping at line 1',
      evidence: 'line 1, col 1',
    },
    {
      id: 'redacted-1',
      kind: 'redacted',
      message: 'Manifest contains redacted content.',
      evidence: 'DO_NOT_RENDER_FIXTURE_SECRET',
    },
  ],
  modes: ['paste', 'dropzone', 'upload'],
  label: 'Package source',
  description: 'TheoryMCP validates server-side.',
  fileAccept: '.yaml,.yml,.json',
  safetyPolicy,
};

const codeDropzone = {
  dropzoneId: 'drop-svelte',
  label: 'Drop a package',
  description: 'Upload fixture package source.',
  state: 'ready',
  fileMeta: { name: 'fixture.yaml', sizeBytes: 412, mediaType: 'text/yaml' },
  safetyPolicy,
};

const wizardProgressState = {
  steps: [
    { key: 'parse', label: 'Parse', status: 'complete' },
    { key: 'review', label: 'Review', status: 'in-progress' },
    { key: 'apply', label: 'Apply', status: 'pending' },
  ],
  currentStepKey: 'review',
  progressLabel: '1 of 3 complete',
};

const wizardPackageSummary = {
  name: 'fixture-package',
  version: '0.1.0',
  files: [
    { key: 'manifest', path: 'agent.json', sizeBytes: 512, status: 'changed' },
    { key: 'readme', path: 'README.md', sizeBytes: 128, status: 'unchanged' },
  ],
  totals: { fileCount: 2, changedCount: 1, unchangedCount: 1 },
  safetyPolicy,
  metadata: {
    authority: 'non-authoritative',
    provenance: { source: 'Fixture package' },
  },
};

const wizardFindingList = {
  findings: [
    {
      id: 'f1',
      severity: 'info',
      title: 'Manifest parsed',
      evidence: 'manifest.name',
    },
    {
      id: 'f2',
      severity: 'error',
      title: 'Bad capability',
      description: 'Capability is not allowed.',
      evidence: 'capabilities[0]',
      metadata: {
        provenance: { source: 'Fixture validator' },
        correlation: sampleCorrelation,
      },
    },
  ],
  safetyPolicy,
};

const wizardReconcileSummary = {
  entries: [
    { key: 'add', label: 'Add hosted auth', kind: 'added' },
    {
      key: 'change',
      label: 'Change callback',
      kind: 'changed',
      detail: 'suppressed detail',
      redacted: true,
    },
    { key: 'redacted', label: 'Redacted row', kind: 'redacted' },
  ],
  totals: { added: 1, removed: 0, changed: 1, unchanged: 0, redacted: 1 },
  safetyPolicy,
};

const wizardCapabilityReview = {
  capabilities: [
    {
      key: 'public',
      label: 'Public read',
      intent: 'granted',
      sensitivity: 'public',
      detail: 'Visible detail',
    },
    {
      key: 'sensitive',
      label: 'Sensitive write',
      intent: 'requested',
      sensitivity: 'sensitive',
      detail: 'DO_NOT_RENDER_SENSITIVE_DETAIL',
    },
    {
      key: 'redacted',
      label: 'Redacted secret',
      intent: 'denied',
      sensitivity: 'redacted',
      detail: 'DO_NOT_RENDER_REDACTED_DETAIL',
    },
  ],
  safetyPolicy,
};

const wizardChecklist = {
  items: [
    { key: 'signed', label: 'Signed commit', status: 'ready' },
    {
      key: 'ci',
      label: 'CI proof',
      status: 'attention',
      detail: 'Awaiting matrix.',
    },
  ],
  summaryLabel: '1 of 2 ready',
  allReady: false,
};

const wizardRecoveryStatus = {
  state: 'failed',
  label: 'Fixture recovery failed',
  description: 'Failed recovery remains visible.',
  metadata: { provenance: { source: 'Session store' } },
};

const wizardEmptyState = {
  intent: 'no-data',
  title: 'No fixture data',
  description: 'Fixture has not been imported.',
  actionLabel: 'Open import settings',
  safetyPolicy,
};

const wizardReconciliationPlan = {
  rows: [
    {
      key: 'create',
      label: 'Create hosted auth app',
      kind: 'create',
      reason: 'Missing app.',
      expanded: true,
      details: [{ key: 'route', label: 'Route', value: '/auth' }],
    },
    {
      key: 'conflict',
      label: 'Resolve callback',
      kind: 'conflict',
      reason: 'Callback differs.',
      metadata: { provenance: { source: 'Plan diff' } },
    },
    {
      key: 'external',
      label: 'Verify DNS',
      kind: 'external_step_required',
      reason: 'External confirmation required.',
    },
  ],
  totals: {
    create: 1,
    update: 0,
    satisfied: 0,
    conflict: 1,
    blocked: 0,
    external: 1,
    noop: 0,
  },
  safetyPolicy,
};

const wizardAuthorityStrip = {
  items: [
    { key: 'tenant', label: 'Tenant', value: 'theory-mcp', tone: 'success' },
    {
      key: 'route',
      label: 'MCP route',
      value: '/agents/fixture',
      copyable: true,
      copyValue: '/agents/fixture',
    },
  ],
  authorityLabel: 'Server-derived',
  readOnlyLabel: 'Read-only',
  layout: 'auto',
  safetyPolicy,
};

const wizardEditableInput = {
  inputId: 'svelte-allowed-senders',
  value: ['qa@example.com', 'ops@example.com'],
  items: [
    { value: 'qa@example.com', tone: 'info' },
    { value: 'ops@example.com', tone: 'success', removable: false },
  ],
  label: 'Allowed senders',
  description: 'Server validation remains authoritative.',
  placeholder: 'Add another address…',
  draftValue: 'qa@example.com',
  removeLabelKind: 'sender',
  safetyPolicy,
};

export const svelteSsrFixtureDefinitions: SvelteSsrFixtureDefinition[] = [
  {
    componentPath: 'src/svelte/responsive-primitives/AsyncStateBoundary.svelte',
    props: { state: 'loading', loadingMessage: 'Loading fixture records' },
  },
  {
    componentPath: 'src/svelte/responsive-primitives/Button.svelte',
    props: {
      loading: true,
      loadingPlacement: 'append',
      size: 'lg',
      variant: 'secondary',
    },
    wrapperMarkup: '<Target {...fixtureProps}>Save fixture</Target>',
  },
  {
    componentPath: 'src/svelte/responsive-primitives/Link.svelte',
    props: { href: 'https://example.com/docs', target: '_blank' },
    wrapperMarkup: '<Target {...fixtureProps}>Fixture docs</Target>',
  },
  {
    componentPath: 'src/svelte/responsive-primitives/LoadingState.svelte',
    props: {
      fullscreen: true,
      label: 'Loading accounts',
      message: 'Loading fixture fleet',
      size: 'lg',
    },
  },
  {
    componentPath: 'src/svelte/responsive-primitives/Skeleton.svelte',
    props: {
      width: 'half',
      height: 'lg',
      variant: 'block',
      animation: 'wave',
      decorative: false,
    },
  },
  {
    componentPath: 'src/svelte/responsive-primitives/Spinner.svelte',
    props: { label: 'Loading accounts', size: 'sm', tone: 'primary' },
  },
  {
    componentPath: 'src/svelte/stitch-admin/AuditTrailPanel.svelte',
    props: { trail: auditTrail },
  },
  {
    componentPath: 'src/svelte/stitch-admin/ChoiceCard.svelte',
    props: { card: choiceCard },
  },
  {
    componentPath: 'src/svelte/stitch-admin/CodeDropzone.svelte',
    props: { dropzone: codeDropzone },
  },
  {
    componentPath: 'src/svelte/stitch-admin/CopyableCode.svelte',
    props: {
      code: 'fixture-copy-token',
      copyLabel: 'Copy fixture',
      size: 'sm',
    },
    wrapperMarkup: '<Target {...fixtureProps}>visible-copy-token</Target>',
  },
  {
    componentPath: 'src/svelte/stitch-admin/DataTable.svelte',
    props: {
      rowKey: 'id',
      dataSource: [
        { id: 'partner-alpha', name: 'Partner Alpha', status: 'Ready' },
        { id: 'partner-beta', name: 'Partner Beta', status: 'Review' },
      ],
      columns: [
        { key: 'name', title: 'Partner', dataIndex: 'name' },
        { key: 'status', title: 'Status', dataIndex: 'status', align: 'right' },
      ],
    },
    wrapperMarkup: `<Target {...fixtureProps}>
  {#snippet toolbarLeft()}Fixture toolbar left{/snippet}
  {#snippet toolbarCenter()}Fixture toolbar center{/snippet}
  {#snippet toolbarRight()}Fixture toolbar right{/snippet}
  {#snippet rowActions(record, index)}{index}:{record.name}{/snippet}
</Target>`,
  },
  {
    componentPath: 'src/svelte/stitch-admin/DestructiveConfirm.svelte',
    props: {
      title: 'Delete fixture package?',
      description: 'This fixture checks destructive confirmation chrome.',
      requireText: 'DELETE',
      confirmLabel: 'Delete fixture',
      cancelLabel: 'Cancel',
      loading: false,
    },
  },
  {
    componentPath: 'src/svelte/stitch-admin/DetailPanel.svelte',
    props: {
      title: 'Fixture detail',
      description: 'Server-resolved detail rows.',
      columns: 2,
      properties: [
        { key: 'route', label: 'Route', value: '/fixtures/svelte' },
        { key: 'mode', label: 'Mode', value: 'SSR', span: 'full' },
      ],
    },
    wrapperMarkup:
      '<Target {...fixtureProps}>{#snippet actions()}Edit fixture{/snippet}</Target>',
  },
  {
    componentPath: 'src/svelte/stitch-admin/DisclosurePanel.svelte',
    props: { panel: disclosurePanel },
    wrapperMarkup:
      '<Target {...fixtureProps}><p>Expanded fixture disclosure body.</p></Target>',
  },
  {
    componentPath: 'src/svelte/stitch-admin/FilterChip.svelte',
    props: { label: 'Status: ready', count: 2, active: true, removable: true },
  },
  {
    componentPath: 'src/svelte/stitch-admin/FilterChipGroup.svelte',
    props: {
      chips: [
        { key: 'ready', label: 'Ready', count: 2, active: true },
        {
          key: 'blocked',
          label: 'Blocked',
          count: 1,
          active: false,
          removable: false,
        },
      ],
    },
    wrapperMarkup:
      '<Target {...fixtureProps}>{#snippet trailing()}Clear filters{/snippet}</Target>',
  },
  {
    componentPath: 'src/svelte/stitch-admin/FormRow.svelte',
    props: {
      label: 'Fixture URL',
      description: 'Server validated.',
      required: true,
      error: 'URL is required.',
    },
    wrapperMarkup:
      '<Target {...fixtureProps}><input value="https://example.com/fixture" /></Target>',
  },
  {
    componentPath: 'src/svelte/stitch-admin/FormSection.svelte',
    props: { title: 'Fixture form', description: 'Grouped form controls.' },
    wrapperMarkup:
      '<Target {...fixtureProps}><div>Fixture form row</div></Target>',
  },
  {
    componentPath: 'src/svelte/stitch-admin/GuardedOperatorShell.svelte',
    props: {
      guard: { state: 'authorized', principalLabel: 'Fixture Ops' },
      authorized: 'Authorized fixture content',
    },
  },
  {
    componentPath: 'src/svelte/stitch-admin/HealthStatusPanel.svelte',
    props: {
      title: 'Fixture health',
      description: 'Stable health observations.',
      rows: healthRows,
      actions: 'Refresh fixtures',
    },
  },
  {
    componentPath: 'src/svelte/stitch-admin/InlineKeyValueList.svelte',
    props: {
      entries: [
        { key: 'route', label: 'Route', value: '/fixtures/svelte' },
        { key: 'status', label: 'Status', value: 'Ready' },
      ],
      labelWidth: 72,
      valueMono: true,
    },
  },
  {
    componentPath: 'src/svelte/stitch-admin/LogStream.svelte',
    props: {
      variant: 'terminal',
      title: 'Fixture logs',
      entries: [
        {
          id: 'log-1',
          level: 'info',
          timestamp: '2026-04-24T18:30:00.000Z',
          actor: 'fixture',
          message: 'Started fixture render.',
        },
        {
          id: 'log-2',
          level: 'error',
          timestamp: 1_775_000_000_000,
          message: 'Fixture warning surfaced.',
        },
      ],
      maxHeight: 180,
    },
  },
  {
    componentPath: 'src/svelte/stitch-admin/MetadataBadge.svelte',
    props: {
      label: 'Source',
      detail: 'Fixture manifest',
      tone: 'info',
      href: '/fixtures/source',
      title: '2026-04-24T18:30:00.000Z',
    },
  },
  {
    componentPath: 'src/svelte/stitch-admin/MetadataBadgeGroup.svelte',
    props: { metadata: sampleMetadata, includeAuthority: true },
  },
  {
    componentPath: 'src/svelte/stitch-admin/NonAuthoritativeBanner.svelte',
    props: { metadata: sampleMetadata, actions: 'Review fixture' },
  },
  {
    componentPath: 'src/svelte/stitch-admin/OperatorEmptyState.svelte',
    props: {
      config: {
        intent: 'no-data',
        title: 'No imported visibility records',
        description: 'Connect a source system before operator data appears.',
        actionLabel: 'Open import settings',
        placeholderDataPolicy: 'no-production-like-data',
      },
    },
  },
  {
    componentPath: 'src/svelte/stitch-admin/PackageSourceInputPanel.svelte',
    props: { input: packageInput },
  },
  {
    componentPath: 'src/svelte/stitch-admin/PropertyGrid.svelte',
    props: {
      columns: 2,
      items: [
        { key: 'tenant', label: 'Tenant', value: 'theory-mcp' },
        {
          key: 'route',
          label: 'Route',
          value: '/agents/fixture',
          span: 'full',
        },
      ],
    },
  },
  {
    componentPath: 'src/svelte/stitch-admin/SelectableCardGridPanel.svelte',
    props: { grid: selectableGrid },
  },
  {
    componentPath: 'src/svelte/stitch-admin/SplitForm.svelte',
    wrapperMarkup:
      '<Target {...fixtureProps}><div>Fixture split form body</div></Target>',
  },
  {
    componentPath: 'src/svelte/stitch-admin/StatusTag.svelte',
    props: { variant: 'warning', label: 'Needs review' },
  },
  {
    componentPath: 'src/svelte/stitch-admin/Tabs.svelte',
    props: {
      items: [
        { key: 'overview', label: 'Overview', count: 2, icon: 'O' },
        { key: 'audit', label: 'Audit', count: 1 },
        { key: 'hidden', label: 'Hidden', hidden: true },
      ],
      defaultActiveKey: 'overview',
      variant: 'card',
    },
    wrapperMarkup:
      '<Target {...fixtureProps}><div>Fixture tab panel</div></Target>',
  },
  {
    componentPath: 'src/svelte/stitch-admin/VisibilityMatrix.svelte',
    props: {
      title: 'Partner service visibility',
      description: 'Caller-supplied visibility by service environment.',
      dimensions: visibilityDimensions,
      rows: visibilityRows,
      actions: 'Export visibility',
      emptyCellLabel: 'No imported visibility record',
    },
  },
  {
    componentPath:
      'src/svelte/stitch-admin/WizardAuthorityContextStripPanel.svelte',
    props: {
      title: 'Fixture authority',
      description: 'Server resolved context.',
      strip: wizardAuthorityStrip,
    },
  },
  {
    componentPath: 'src/svelte/stitch-admin/WizardCapabilityReviewPanel.svelte',
    props: {
      title: 'Capability review',
      description: 'Review fixture capabilities.',
      review: wizardCapabilityReview,
    },
  },
  {
    componentPath:
      'src/svelte/stitch-admin/WizardEditableTokenInputPanel.svelte',
    props: { input: wizardEditableInput },
  },
  {
    componentPath: 'src/svelte/stitch-admin/WizardEmptyState.svelte',
    props: { config: wizardEmptyState, action: 'Open wizard' },
  },
  {
    componentPath:
      'src/svelte/stitch-admin/WizardEnablementChecklistPanel.svelte',
    props: {
      title: 'Enablement checklist',
      description: 'Fixture readiness.',
      checklist: wizardChecklist,
    },
  },
  {
    componentPath: 'src/svelte/stitch-admin/WizardFindingListPanel.svelte',
    props: {
      title: 'Validation findings',
      description: 'Fixture findings.',
      list: wizardFindingList,
    },
  },
  {
    componentPath: 'src/svelte/stitch-admin/WizardPackageSummaryPanel.svelte',
    props: { title: 'Package summary', summary: wizardPackageSummary },
  },
  {
    componentPath: 'src/svelte/stitch-admin/WizardProgress.svelte',
    props: {
      title: 'Wizard progress',
      description: 'Fixture flow.',
      state: wizardProgressState,
    },
  },
  {
    componentPath: 'src/svelte/stitch-admin/WizardReconcileSummaryPanel.svelte',
    props: {
      title: 'Reconcile summary',
      description: 'Fixture reconciliation.',
      summary: wizardReconcileSummary,
    },
  },
  {
    componentPath:
      'src/svelte/stitch-admin/WizardReconciliationPlanPanel.svelte',
    props: {
      title: 'Reconciliation plan',
      description: 'Fixture plan rows.',
      plan: wizardReconciliationPlan,
    },
  },
  {
    componentPath: 'src/svelte/stitch-admin/WizardRecoveryStatusPanel.svelte',
    props: { title: 'Wizard recovery', status: wizardRecoveryStatus },
  },
  {
    componentPath: 'src/svelte/stitch-hosted-auth/AuthCard.svelte',
    props: {
      title: 'Sign in to Fixture',
      description: 'Use a passkey to continue.',
    },
    wrapperMarkup: `<Target {...fixtureProps}>
  <svelte:fragment slot="headerAction">Help</svelte:fragment>
  <p>Hosted auth fixture body</p>
  <svelte:fragment slot="footer">Privacy · Terms</svelte:fragment>
</Target>`,
  },
  {
    componentPath: 'src/svelte/stitch-hosted-auth/AuthFlowSection.svelte',
    props: {
      eyebrow: 'Step 1',
      title: 'Verify account',
      description: 'Confirm the fixture code.',
    },
    wrapperMarkup:
      '<Target {...fixtureProps}><p>Fixture flow content</p></Target>',
  },
  {
    componentPath: 'src/svelte/stitch-hosted-auth/AuthFlowStepper.svelte',
    props: {
      steps: [
        { key: 'identify', label: 'Identify' },
        { key: 'verify', label: 'Verify' },
        { key: 'done', label: 'Done' },
      ],
      currentIndex: 1,
    },
  },
  {
    componentPath: 'src/svelte/stitch-hosted-auth/AuthPageLayout.svelte',
    props: { background: 'gradient' },
    wrapperMarkup: `<Target {...fixtureProps}>
  <svelte:fragment slot="brand">Fixture Auth</svelte:fragment>
  <section>Hosted auth page body</section>
  <svelte:fragment slot="footer">Fixture footer</svelte:fragment>
</Target>`,
  },
  {
    componentPath: 'src/svelte/stitch-hosted-auth/AuthStateCard.svelte',
    props: {
      variant: 'error',
      title: 'Unable to sign in',
      description: 'Fixture auth state requires review.',
    },
    wrapperMarkup:
      '<Target {...fixtureProps}><svelte:fragment slot="icon">!</svelte:fragment><svelte:fragment slot="actions">Retry</svelte:fragment></Target>',
  },
  {
    componentPath: 'src/svelte/stitch-hosted-auth/ConsentItem.svelte',
    props: {
      label: 'Read profile',
      description: 'Fixture asks for profile access.',
      granted: true,
    },
    wrapperMarkup:
      '<Target {...fixtureProps}><svelte:fragment slot="icon">✓</svelte:fragment></Target>',
  },
  {
    componentPath: 'src/svelte/stitch-hosted-auth/ConsentList.svelte',
    wrapperMarkup:
      '<Target {...fixtureProps}><li>Read profile</li><li>Send email</li></Target>',
  },
  {
    componentPath: 'src/svelte/stitch-hosted-auth/OTPInput.svelte',
    props: {
      length: 6,
      value: '123',
      invalid: true,
      disabled: false,
      autoFocus: false,
    },
  },
  {
    componentPath: 'src/svelte/stitch-hosted-auth/PasskeyCTA.svelte',
    props: { loading: false, disabled: false, type: 'button' },
    wrapperMarkup:
      '<Target {...fixtureProps}><svelte:fragment slot="icon">🔐</svelte:fragment>Continue with passkey</Target>',
  },
  {
    componentPath: 'src/svelte/stitch-shell/BrandHeader.svelte',
    props: {
      logo: 'FT',
      wordmark: 'FaceTheory',
      surfaceLabel: 'Fixture',
      surfaceTone: 'primary-fixed',
    },
  },
  {
    componentPath: 'src/svelte/stitch-shell/Breadcrumb.svelte',
    props: { items: breadcrumbs },
  },
  {
    componentPath: 'src/svelte/stitch-shell/Callout.svelte',
    props: {
      variant: 'warning',
      title: 'Fixture warning',
      icon: '!',
      actions: 'Review',
    },
    wrapperMarkup:
      '<Target {...fixtureProps}>This fixture callout captures slot body output.</Target>',
  },
  {
    componentPath: 'src/svelte/stitch-shell/PageFrame.svelte',
    props: {
      title: 'Fixture page',
      description: 'SSR fixture page frame.',
      breadcrumbs,
    },
    wrapperMarkup:
      '<Target {...fixtureProps}>{#snippet actions()}Edit page{/snippet}<p>Fixture page content</p></Target>',
  },
  {
    componentPath: 'src/svelte/stitch-shell/PageTitle.svelte',
    props: { description: 'Fixture page title description.' },
    wrapperMarkup: '<Target {...fixtureProps}>Fixture page title</Target>',
  },
  {
    componentPath: 'src/svelte/stitch-shell/Panel.svelte',
    props: { padded: true, elevated: false },
    wrapperMarkup:
      '<Target {...fixtureProps}><span>Inside fixture panel</span></Target>',
  },
  {
    componentPath: 'src/svelte/stitch-shell/Section.svelte',
    props: { title: 'Fixture section', description: 'Section copy.' },
    wrapperMarkup:
      '<Target {...fixtureProps}>{#snippet actions()}Refresh{/snippet}<p>Fixture section body</p></Target>',
  },
  {
    componentPath: 'src/svelte/stitch-shell/Shell.svelte',
    props: {
      nav: navItems,
      activeKey: '/dashboard',
      openKeys: ['settings-group'],
      collapsed: false,
    },
    wrapperMarkup: `<Target {...fixtureProps}>
  {#snippet brand()}Fixture brand{/snippet}
  {#snippet sidebarFooter()}Fixture footer{/snippet}
  {#snippet topbarLogo()}FT{/snippet}
  {#snippet topbarSurfaceLabel()}Admin{/snippet}
  {#snippet topbarLeft()}Dashboard{/snippet}
  {#snippet topbarCenter()}Center tools{/snippet}
  {#snippet topbarRight()}Operator{/snippet}
  <section>Shell fixture content</section>
</Target>`,
  },
  {
    componentPath: 'src/svelte/stitch-shell/Sidebar.svelte',
    props: {
      nav: navItems,
      activeKey: '/dashboard',
      openKeys: ['settings-group'],
      collapsed: false,
    },
    wrapperMarkup:
      '<Target {...fixtureProps}>{#snippet brand()}Fixture brand{/snippet}{#snippet footer()}Fixture footer{/snippet}</Target>',
  },
  {
    componentPath: 'src/svelte/stitch-shell/SidebarItems.svelte',
    props: {
      items: navItems,
      activeKey: '/dashboard',
      openKeys: ['settings-group'],
    },
  },
  {
    componentPath: 'src/svelte/stitch-shell/StatCard.svelte',
    props: {
      label: 'Active fixtures',
      value: '1,204',
      delta: { value: '+8%', trend: 'up' },
    },
    wrapperMarkup:
      '<Target {...fixtureProps}>{#snippet icon()}↗{/snippet}</Target>',
  },
  {
    componentPath: 'src/svelte/stitch-shell/SummaryStrip.svelte',
    props: { columns: 2 },
    wrapperMarkup:
      '<Target {...fixtureProps}><div>Fixture summary A</div><div>Fixture summary B</div></Target>',
  },
  {
    componentPath: 'src/svelte/stitch-shell/Topbar.svelte',
    props: { showLogo: true, showSurfaceLabel: true },
    wrapperMarkup: `<Target {...fixtureProps}>
  {#snippet logo()}FT{/snippet}
  {#snippet surfaceLabel()}Fixture{/snippet}
  {#snippet left()}Left{/snippet}
  {#snippet center()}Center{/snippet}
  {#snippet right()}Right{/snippet}
</Target>`,
  },
];
