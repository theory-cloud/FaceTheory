import assert from 'node:assert/strict';
import test from 'node:test';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import type {
  WizardCapabilityReview,
  WizardEmptyStateConfig,
  WizardEnablementChecklist,
  WizardFindingList,
  WizardPackageSummary,
  WizardProgressState,
  WizardReconcileSummary,
  WizardRecoveryStatus,
} from '../../src/stitch-admin/index.js';
import {
  WizardCapabilityReviewPanel,
  WizardEmptyState,
  WizardEnablementChecklistPanel,
  WizardFindingListPanel,
  WizardPackageSummaryPanel,
  WizardProgress,
  WizardReconcileSummaryPanel,
  WizardRecoveryStatusPanel,
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

/* -------------------------------------------------------------------------- */
/* WizardProgress                                                              */
/* -------------------------------------------------------------------------- */

test('WizardProgress renders caller-supplied steps in order with stable status data attributes', async () => {
  const state: WizardProgressState = {
    steps: [
      { key: 'connect', label: 'Connect repository', status: 'complete' },
      { key: 'validate', label: 'Validate manifest', status: 'in-progress', hint: 'Manifest scan running' },
      { key: 'review', label: 'Review capabilities', status: 'pending' },
      { key: 'enable', label: 'Enable agent', status: 'blocked', hint: 'Waiting on operator review' },
    ],
    currentStepKey: 'validate',
  };

  const body = await renderSSR(h(WizardProgress, { state }));

  assert.ok(body.includes('facetheory-stitch-wizard-progress'));
  assert.ok(body.includes('data-step-count="4"'));
  assert.ok(body.includes('data-completed-count="1"'));
  assert.ok(body.includes('1 of 4 complete'));

  // Steps are rendered in caller order with stable data-step-key.
  const connectIdx = body.indexOf('data-step-key="connect"');
  const validateIdx = body.indexOf('data-step-key="validate"');
  const reviewIdx = body.indexOf('data-step-key="review"');
  const enableIdx = body.indexOf('data-step-key="enable"');
  assert.ok(connectIdx > -1 && validateIdx > connectIdx && reviewIdx > validateIdx && enableIdx > reviewIdx);

  // Status chips reflect caller status.
  assert.ok(body.includes('data-step-status="complete"'));
  assert.ok(body.includes('data-step-status="in-progress"'));
  assert.ok(body.includes('data-step-status="pending"'));
  assert.ok(body.includes('data-step-status="blocked"'));

  // currentStepKey marks active.
  assert.ok(body.includes('data-step-key="validate"'));
  assert.ok(body.includes('facetheory-stitch-wizard-step-active'));

  // Hints render.
  assert.ok(body.includes('Manifest scan running'));
  assert.ok(body.includes('Waiting on operator review'));
});

test('WizardProgress prefers caller-supplied progressLabel and renders the same SSR output twice', async () => {
  const state: WizardProgressState = {
    steps: [
      { key: 'a', label: 'A', status: 'complete' },
      { key: 'b', label: 'B', status: 'complete' },
    ],
    progressLabel: 'Almost there',
  };
  const first = await renderSSR(h(WizardProgress, { state }));
  const second = await renderSSR(h(WizardProgress, { state }));

  assert.ok(first.includes('Almost there'));
  assert.equal(first, second, 'WizardProgress must be deterministic across renders');
});

/* -------------------------------------------------------------------------- */
/* WizardPackageSummaryPanel                                                   */
/* -------------------------------------------------------------------------- */

test('WizardPackageSummaryPanel renders package totals and per-file metadata without computing values', async () => {
  const summary: WizardPackageSummary = {
    name: 'theorymcp-agent-acme',
    version: '0.1.0',
    description: 'Imported agent definition for review',
    files: [
      {
        key: 'manifest',
        path: 'agent.json',
        sizeBytes: 412,
        sha256: 'a0b1c2d3e4f5',
        role: 'manifest',
        mediaType: 'application/json',
      },
      {
        key: 'policy',
        path: 'policy/allowlist.yaml',
        sizeBytes: 78,
        role: 'policy',
        note: 'Optional allowlist',
      },
    ],
    totals: { fileCount: 2, byteCount: 490 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };

  const body = await renderSSR(h(WizardPackageSummaryPanel, { summary }));

  assert.ok(body.includes('facetheory-stitch-wizard-package-summary'));
  assert.ok(body.includes('data-package-name="theorymcp-agent-acme"'));
  assert.ok(body.includes('data-package-version="0.1.0"'));
  assert.ok(body.includes('data-file-count="2"'));
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
  assert.ok(body.includes('Version 0.1.0'));
  assert.ok(body.includes('agent.json'));
  assert.ok(body.includes('policy/allowlist.yaml'));
  assert.ok(body.includes('a0b1c2d3e4f5'));
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
});

test('WizardPackageSummaryPanel renders empty-files state without inventing rows', async () => {
  const summary: WizardPackageSummary = {
    name: 'empty',
    files: [],
    totals: { fileCount: 0 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(h(WizardPackageSummaryPanel, { summary, emptyLabel: 'No files yet' }));
  assert.ok(body.includes('facetheory-stitch-wizard-package-summary-empty'));
  assert.ok(body.includes('No files yet'));
  assert.ok(!body.includes('facetheory-stitch-wizard-package-summary-file'));
});

/* -------------------------------------------------------------------------- */
/* WizardFindingListPanel                                                      */
/* -------------------------------------------------------------------------- */

test('WizardFindingListPanel renders severity chips and per-finding evidence', async () => {
  const list: WizardFindingList = {
    findings: [
      { id: 'f1', severity: 'info', title: 'Manifest parsed', source: 'manifest-validator' },
      { id: 'f2', severity: 'warning', title: 'Optional field missing', description: 'agent.documentation is absent.' },
      { id: 'f3', severity: 'error', title: 'Unknown capability', evidence: 'capabilities[2].name' },
      { id: 'f4', severity: 'blocker', title: 'Conflicting binding', description: 'GitHub binding mismatch' },
    ],
    safetyPolicy: 'no-secret-or-production-like-data',
  };

  const body = await renderSSR(h(WizardFindingListPanel, { list }));

  assert.ok(body.includes('facetheory-stitch-wizard-finding-list'));
  assert.ok(body.includes('data-finding-count="4"'));
  assert.ok(body.includes('Info: 1'));
  assert.ok(body.includes('Warning: 1'));
  assert.ok(body.includes('Error: 1'));
  assert.ok(body.includes('Blocker: 1'));
  assert.ok(body.includes('data-finding-severity="info"'));
  assert.ok(body.includes('data-finding-severity="warning"'));
  assert.ok(body.includes('data-finding-severity="error"'));
  assert.ok(body.includes('data-finding-severity="blocker"'));
  assert.ok(body.includes('capabilities[2].name'));
  assert.ok(body.includes('manifest-validator'));
});

/* -------------------------------------------------------------------------- */
/* WizardReconcileSummaryPanel                                                 */
/* -------------------------------------------------------------------------- */

test('WizardReconcileSummaryPanel replaces sensitive details with a redaction marker', async () => {
  const summary: WizardReconcileSummary = {
    entries: [
      { key: 'name', label: 'name', kind: 'unchanged', detail: 'acme-agent' },
      { key: 'desc', label: 'description', kind: 'changed', detail: 'new description' },
      { key: 'capability.write', label: 'capability.write', kind: 'added' },
      { key: 'capability.delete', label: 'capability.delete', kind: 'removed' },
      { key: 'secret', label: 'shared-secret', kind: 'changed', detail: 'super-secret-value', redacted: true },
      { key: 'explicit-redacted', label: 'rotation-token', kind: 'redacted' },
    ],
    totals: { added: 1, removed: 1, changed: 2, unchanged: 1, redacted: 1 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };

  const body = await renderSSR(h(WizardReconcileSummaryPanel, { summary }));

  assert.ok(body.includes('facetheory-stitch-wizard-reconcile-summary'));
  assert.ok(body.includes('data-entry-count="6"'));

  // Totals chip values from caller, not derived.
  assert.ok(body.includes('Added: 1'));
  assert.ok(body.includes('Removed: 1'));
  assert.ok(body.includes('Changed: 2'));
  assert.ok(body.includes('Unchanged: 1'));
  assert.ok(body.includes('Redacted: 1'));

  // Non-redacted details render.
  assert.ok(body.includes('acme-agent'));
  assert.ok(body.includes('new description'));

  // Redacted entries omit the raw value and render the redaction marker.
  assert.ok(!body.includes('super-secret-value'));
  assert.ok(body.includes('data-entry-redacted="true"'));
  // Both the explicit-kind-redacted entry and the redacted-flagged entry should render the marker.
  const markerOccurrences = body.split('[redacted]').length - 1;
  assert.ok(markerOccurrences >= 2, `expected at least two redaction markers, saw ${markerOccurrences}`);
});

/* -------------------------------------------------------------------------- */
/* WizardCapabilityReviewPanel                                                 */
/* -------------------------------------------------------------------------- */

test('WizardCapabilityReviewPanel suppresses sensitive details and hides redacted descriptions', async () => {
  const review: WizardCapabilityReview = {
    capabilities: [
      {
        key: 'read-public',
        label: 'Read public knowledge',
        description: 'Read-only access to public knowledge bases',
        intent: 'granted',
        sensitivity: 'public',
        detail: 'kb:public/*',
      },
      {
        key: 'send-email',
        label: 'Send agent email',
        description: 'Send mail from the routed mailbox',
        intent: 'requested',
        sensitivity: 'sensitive',
        detail: 'mailbox:agents/acme',
      },
      {
        key: 'rotate-secret',
        label: 'Rotate signing secret',
        description: 'Rotation token (caller marks redacted)',
        intent: 'denied',
        sensitivity: 'redacted',
        detail: 'should-not-render-secret-value',
      },
    ],
    safetyPolicy: 'no-secret-or-production-like-data',
  };

  const body = await renderSSR(h(WizardCapabilityReviewPanel, { review }));

  assert.ok(body.includes('facetheory-stitch-wizard-capability-review'));
  assert.ok(body.includes('data-capability-count="3"'));
  assert.ok(body.includes('data-capability-intent="granted"'));
  assert.ok(body.includes('data-capability-intent="requested"'));
  assert.ok(body.includes('data-capability-intent="denied"'));
  assert.ok(body.includes('data-capability-sensitivity="public"'));
  assert.ok(body.includes('data-capability-sensitivity="sensitive"'));
  assert.ok(body.includes('data-capability-sensitivity="redacted"'));

  // Public detail visible.
  assert.ok(body.includes('kb:public/*'));
  // Sensitive: description visible, raw detail suppressed.
  assert.ok(body.includes('Send mail from the routed mailbox'));
  assert.ok(!body.includes('mailbox:agents/acme'));
  assert.ok(body.includes('Detail suppressed (sensitive).'));
  // Redacted: description hidden, raw detail hidden, marker present.
  assert.ok(!body.includes('Rotation token (caller marks redacted)'));
  assert.ok(!body.includes('should-not-render-secret-value'));
  assert.ok(body.includes('facetheory-stitch-wizard-capability-redaction'));
  assert.ok(body.includes('[redacted]'));
});

/* -------------------------------------------------------------------------- */
/* WizardEnablementChecklistPanel                                              */
/* -------------------------------------------------------------------------- */

test('WizardEnablementChecklistPanel renders caller-supplied summary and all-ready assertion', async () => {
  const checklist: WizardEnablementChecklist = {
    items: [
      { key: 'binding', label: 'GitHub binding present', status: 'ready' },
      { key: 'mailbox', label: 'Mailbox allowlist confirmed', status: 'attention' },
      { key: 'policy', label: 'Policy enforcement enabled', status: 'blocked', detail: 'awaiting operator' },
      { key: 'deploy', label: 'Deployment skipped (dev)', status: 'not-applicable' },
    ],
    summaryLabel: '1 of 4 ready',
    allReady: false,
  };

  const body = await renderSSR(h(WizardEnablementChecklistPanel, { checklist }));

  assert.ok(body.includes('facetheory-stitch-wizard-enablement-checklist'));
  assert.ok(body.includes('data-item-count="4"'));
  assert.ok(body.includes('data-all-ready="false"'));
  assert.ok(body.includes('1 of 4 ready'));
  assert.ok(body.includes('data-item-status="ready"'));
  assert.ok(body.includes('data-item-status="attention"'));
  assert.ok(body.includes('data-item-status="blocked"'));
  assert.ok(body.includes('data-item-status="not-applicable"'));
  assert.ok(body.includes('awaiting operator'));
});

/* -------------------------------------------------------------------------- */
/* WizardRecoveryStatusPanel                                                   */
/* -------------------------------------------------------------------------- */

test('WizardRecoveryStatusPanel renders caller-supplied resume token label without emitting raw secrets', async () => {
  const status: WizardRecoveryStatus = {
    state: 'resumable',
    label: 'Resume previous wizard?',
    description: 'A session from earlier today is available.',
    lastSavedAt: '2026-05-21T03:15:00.000Z',
    ageLabel: 'saved 6 minutes ago',
    resumeTokenReference: {
      label: 'session abc12…',
      redacted: true,
    },
  };

  const body = await renderSSR(h(WizardRecoveryStatusPanel, { status }));

  assert.ok(body.includes('facetheory-stitch-wizard-recovery'));
  assert.ok(body.includes('data-recovery-state="resumable"'));
  assert.ok(body.includes('Resume previous wizard?'));
  assert.ok(body.includes('A session from earlier today is available.'));
  assert.ok(body.includes('2026-05-21T03:15:00.000Z'));
  assert.ok(body.includes('saved 6 minutes ago'));
  assert.ok(body.includes('session abc12'));
  assert.ok(body.includes('data-resume-token-redacted="true"'));
});

test('WizardRecoveryStatusPanel marks failed state as an alert and renders the failed chip', async () => {
  const status: WizardRecoveryStatus = {
    state: 'failed',
    description: 'Could not load saved session.',
  };
  const body = await renderSSR(h(WizardRecoveryStatusPanel, { status }));
  assert.ok(body.includes('data-recovery-state="failed"'));
  assert.ok(body.includes('role="alert"'));
  assert.ok(body.includes('Failed'));
});

/* -------------------------------------------------------------------------- */
/* WizardEmptyState                                                            */
/* -------------------------------------------------------------------------- */

test('WizardEmptyState renders the wizard safety policy and the empty-state intent', async () => {
  const config: WizardEmptyStateConfig = {
    intent: 'not-configured',
    title: 'Configure a TheoryMCP binding to begin',
    description: 'Connect a GitHub binding and a mailbox before importing an agent.',
    actionLabel: 'Open binding settings',
    safetyPolicy: 'no-secret-or-production-like-data',
  };

  const body = await renderSSR(h(WizardEmptyState, { config }));

  assert.ok(body.includes('facetheory-stitch-wizard-empty-state'));
  assert.ok(body.includes('data-empty-intent="not-configured"'));
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
  assert.ok(body.includes('Configure a TheoryMCP binding to begin'));
  assert.ok(body.includes('Open binding settings'));
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
});

/* -------------------------------------------------------------------------- */
/* Determinism: identical input must produce identical SSR output              */
/* -------------------------------------------------------------------------- */

test('wizard primitives render identical SSR output across repeated invocations', async () => {
  const progressState: WizardProgressState = {
    steps: [
      { key: 'a', label: 'A', status: 'complete' },
      { key: 'b', label: 'B', status: 'in-progress' },
      { key: 'c', label: 'C', status: 'pending' },
    ],
    currentStepKey: 'b',
  };
  const packageSummary: WizardPackageSummary = {
    name: 'pkg',
    files: [{ key: 'm', path: 'manifest.json', role: 'manifest' }],
    totals: { fileCount: 1 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const findingList: WizardFindingList = {
    findings: [{ id: 'f1', severity: 'info', title: 'Manifest parsed' }],
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const reconcile: WizardReconcileSummary = {
    entries: [{ key: 'k', label: 'k', kind: 'added' }],
    totals: { added: 1, removed: 0, changed: 0, unchanged: 0, redacted: 0 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const review: WizardCapabilityReview = {
    capabilities: [{ key: 'c', label: 'c', intent: 'granted', sensitivity: 'public' }],
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const checklist: WizardEnablementChecklist = {
    items: [{ key: 'r', label: 'ready item', status: 'ready' }],
    allReady: true,
  };
  const recovery: WizardRecoveryStatus = { state: 'fresh' };
  const emptyConfig: WizardEmptyStateConfig = {
    intent: 'no-data',
    title: 'No data',
    safetyPolicy: 'no-secret-or-production-like-data',
  };

  const elements: React.ReactElement[] = [
    h(WizardProgress, { state: progressState }),
    h(WizardPackageSummaryPanel, { summary: packageSummary }),
    h(WizardFindingListPanel, { list: findingList }),
    h(WizardReconcileSummaryPanel, { summary: reconcile }),
    h(WizardCapabilityReviewPanel, { review }),
    h(WizardEnablementChecklistPanel, { checklist }),
    h(WizardRecoveryStatusPanel, { status: recovery }),
    h(WizardEmptyState, { config: emptyConfig }),
  ];

  for (const element of elements) {
    const first = await renderSSR(element);
    const second = await renderSSR(element);
    assert.equal(first, second, 'wizard primitive must produce identical SSR output for identical input');
  }
});
