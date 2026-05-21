import assert from 'node:assert/strict';
import test from 'node:test';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import {
  canonicalizeWizardReconciliationPlanKind,
  type WizardReconciliationPlan,
} from '../../src/stitch-admin/index.js';
import {
  WizardDiffListPanel,
  WizardReconciliationPlanPanel,
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

function countMatches(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/* -------------------------------------------------------------------------- */
/* Kind canonicalization                                                       */
/* -------------------------------------------------------------------------- */

test('canonicalizeWizardReconciliationPlanKind normalizes alias kinds to canonical kinds', () => {
  assert.equal(canonicalizeWizardReconciliationPlanKind('create'), 'create');
  assert.equal(canonicalizeWizardReconciliationPlanKind('update'), 'update');
  assert.equal(canonicalizeWizardReconciliationPlanKind('satisfied'), 'satisfied');
  assert.equal(canonicalizeWizardReconciliationPlanKind('already_satisfied'), 'satisfied');
  assert.equal(canonicalizeWizardReconciliationPlanKind('conflict'), 'conflict');
  assert.equal(canonicalizeWizardReconciliationPlanKind('blocked'), 'blocked');
  assert.equal(canonicalizeWizardReconciliationPlanKind('external'), 'external');
  assert.equal(canonicalizeWizardReconciliationPlanKind('external_step_required'), 'external');
  assert.equal(canonicalizeWizardReconciliationPlanKind('noop'), 'noop');
  assert.equal(canonicalizeWizardReconciliationPlanKind('not_requested'), 'noop');
});

/* -------------------------------------------------------------------------- */
/* Caller-supplied state passthrough                                           */
/* -------------------------------------------------------------------------- */

test('WizardReconciliationPlanPanel renders caller-supplied rows in order with canonical + alias data attributes', async () => {
  const plan: WizardReconciliationPlan = {
    rows: [
      {
        key: 'ns',
        label: 'Create namespace acme',
        kind: 'create',
        summary: 'Will create namespace acme in tenant theory-mcp',
      },
      {
        key: 'agent',
        label: 'Update agent acme',
        kind: 'update',
        summary: 'Bump declared capabilities',
      },
      {
        key: 'binding',
        label: 'Mailbox binding',
        kind: 'already_satisfied',
        summary: 'Mailbox allowlist already includes the agent',
      },
      {
        key: 'github',
        label: 'GitHub binding',
        kind: 'conflict',
        summary: 'Existing GitHub binding points at a different repo',
        reason: 'Existing binding targets theory-cloud/Other; resolve before continuing.',
      },
      {
        key: 'policy',
        label: 'Enforcement policy',
        kind: 'blocked',
        summary: 'Awaiting operator review',
        reason: 'Operator review record not present.',
      },
      {
        key: 'secret',
        label: 'Rotate signing secret',
        kind: 'external_step_required',
        summary: 'Use TheoryMCP rotation tool',
        reason: 'Cannot rotate from this wizard; complete in the rotation tool.',
      },
      {
        key: 'noop-deploy',
        label: 'Deployment',
        kind: 'not_requested',
        summary: 'Deployment intentionally not part of this run',
      },
    ],
    totals: {
      create: 1,
      update: 1,
      satisfied: 1,
      conflict: 1,
      blocked: 1,
      external: 1,
      noop: 1,
    },
    safetyPolicy: 'no-secret-or-production-like-data',
  };

  const body = await renderSSR(h(WizardReconciliationPlanPanel, { plan }));

  // Container exposes the safety policy and prominent counts.
  assert.ok(body.includes('facetheory-stitch-wizard-reconciliation-plan'));
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
  assert.ok(body.includes('data-row-count="7"'));
  assert.ok(body.includes('data-conflict-count="1"'));
  assert.ok(body.includes('data-blocked-count="1"'));
  assert.ok(body.includes('data-external-count="1"'));

  // Caller-supplied row order preserved.
  const order = ['ns', 'agent', 'binding', 'github', 'policy', 'secret', 'noop-deploy'];
  let prev = -1;
  for (const key of order) {
    const idx = body.indexOf(`data-row-key="${key}"`);
    assert.ok(idx > prev, `row ${key} must appear after the previous row in SSR output`);
    prev = idx;
  }

  // Aliases canonicalized in data-row-kind, original recorded in data-row-kind-input.
  assert.ok(body.includes('data-row-kind="satisfied"'));
  assert.ok(body.includes('data-row-kind-input="already_satisfied"'));
  assert.ok(body.includes('data-row-kind="external"'));
  assert.ok(body.includes('data-row-kind-input="external_step_required"'));
  assert.ok(body.includes('data-row-kind="noop"'));
  assert.ok(body.includes('data-row-kind-input="not_requested"'));

  // Default status labels render when caller does not supply statusLabel.
  assert.ok(body.includes('Will create'));
  assert.ok(body.includes('Will update'));
  assert.ok(body.includes('Already satisfied'));
  assert.ok(body.includes('Conflict'));
  assert.ok(body.includes('Blocked'));
  assert.ok(body.includes('External step required'));
  assert.ok(body.includes('No-op'));

  // Caller-supplied reason copy renders for conflict/blocked/external.
  assert.ok(body.includes('Existing binding targets theory-cloud/Other; resolve before continuing.'));
  assert.ok(body.includes('Operator review record not present.'));
  assert.ok(body.includes('Cannot rotate from this wizard; complete in the rotation tool.'));
});

/* -------------------------------------------------------------------------- */
/* Prominent rendering for conflict/blocked/external                           */
/* -------------------------------------------------------------------------- */

test('WizardReconciliationPlanPanel marks conflict/blocked/external rows as prominent and uses role="alert"', async () => {
  const plan: WizardReconciliationPlan = {
    rows: [
      { key: 'c', label: 'c', kind: 'conflict', reason: 'reason' },
      { key: 'b', label: 'b', kind: 'blocked', reason: 'reason' },
      { key: 'e', label: 'e', kind: 'external', reason: 'reason' },
      { key: 's', label: 's', kind: 'satisfied' },
      { key: 'n', label: 'n', kind: 'noop' },
    ],
    totals: { create: 0, update: 0, satisfied: 1, conflict: 1, blocked: 1, external: 1, noop: 1 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };

  const body = await renderSSR(h(WizardReconciliationPlanPanel, { plan }));

  // Three prominent rows → three role="alert" entries (one per prominent row).
  assert.equal(countMatches(body, 'role="alert"'), 3);
  // Non-prominent rows use role="listitem" inside the role="list" ul.
  assert.ok(body.includes('role="listitem"'));
  // Class marker exposed for prominent rendering.
  assert.equal(countMatches(body, 'facetheory-stitch-wizard-reconciliation-plan-row-prominent'), 3);
});

/* -------------------------------------------------------------------------- */
/* Accessible expand/collapse contract                                         */
/* -------------------------------------------------------------------------- */

test('WizardReconciliationPlanPanel expand/collapse uses real button + aria-expanded + aria-controls', async () => {
  const plan: WizardReconciliationPlan = {
    rows: [
      {
        key: 'expanded-row',
        label: 'Expanded row',
        kind: 'create',
        statusLabel: 'Will create resource',
        expanded: true,
        details: [
          { key: 'path', label: 'Path', value: '/agents/acme' },
          { key: 'sha', label: 'Manifest sha', value: 'abc12345' },
        ],
      },
      {
        key: 'collapsed-row',
        label: 'Collapsed row',
        kind: 'update',
        statusLabel: 'Will update resource',
        expanded: false,
        details: [{ key: 'note', label: 'Note', value: 'bump' }],
      },
      {
        key: 'no-details-row',
        label: 'No details',
        kind: 'satisfied',
      },
    ],
    totals: { create: 1, update: 1, satisfied: 1, conflict: 0, blocked: 0, external: 0, noop: 0 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };

  const body = await renderSSR(h(WizardReconciliationPlanPanel, { plan }));

  // Real <button type="button"> elements with aria-expanded reflecting state.
  assert.ok(body.includes('<button type="button"'));
  assert.ok(body.includes('aria-expanded="true"'));
  assert.ok(body.includes('aria-expanded="false"'));
  assert.ok(body.includes('aria-controls="facetheory-wizard-plan-row-expanded-row-details"'));
  assert.ok(body.includes('aria-controls="facetheory-wizard-plan-row-collapsed-row-details"'));

  // Color-independent accessible labels.
  assert.ok(body.includes('aria-label="Hide details for Will create resource"'));
  assert.ok(body.includes('aria-label="Show details for Will update resource"'));
  assert.ok(body.includes('aria-label="Status: Will create resource"'));

  // Expanded row renders its detail values.
  assert.ok(body.includes('/agents/acme'));
  assert.ok(body.includes('abc12345'));

  // Collapsed row hides the detail panel via the standard `hidden` attribute
  // and aria-hidden="true"; expanded row uses aria-hidden="false".
  const expandedPanelIdx = body.indexOf('id="facetheory-wizard-plan-row-expanded-row-details"');
  assert.ok(expandedPanelIdx > -1);
  // Slice and check the attributes on the expanded panel are not hidden.
  const expandedPanelSnippet = body.slice(expandedPanelIdx, expandedPanelIdx + 400);
  assert.ok(!expandedPanelSnippet.includes('hidden=""'));
  assert.ok(expandedPanelSnippet.includes('aria-hidden="false"'));

  const collapsedPanelIdx = body.indexOf('id="facetheory-wizard-plan-row-collapsed-row-details"');
  assert.ok(collapsedPanelIdx > -1);
  const collapsedPanelSnippet = body.slice(collapsedPanelIdx, collapsedPanelIdx + 400);
  assert.ok(collapsedPanelSnippet.includes('hidden=""'));
  assert.ok(collapsedPanelSnippet.includes('aria-hidden="true"'));

  // Collapsed row does not render its detail content into the SSR body.
  assert.ok(!body.includes('bump'));

  // Rows without details do not render a toggle button.
  const noDetailsRowIdx = body.indexOf('data-row-key="no-details-row"');
  const noDetailsRowSnippet = body.slice(noDetailsRowIdx, noDetailsRowIdx + 1200);
  assert.ok(!noDetailsRowSnippet.includes('data-row-toggle-key='));
});

/* -------------------------------------------------------------------------- */
/* Redaction levers                                                            */
/* -------------------------------------------------------------------------- */

test('WizardReconciliationPlanPanel replaces detail values with redaction marker when row or detail is redacted', async () => {
  const plan: WizardReconciliationPlan = {
    rows: [
      {
        key: 'public-row',
        label: 'Public values',
        kind: 'update',
        expanded: true,
        details: [
          { key: 'public', label: 'Public', value: 'visible-value' },
          { key: 'sensitive', label: 'Sensitive', value: 'should-not-appear', redacted: true },
        ],
      },
      {
        key: 'redacted-row',
        label: 'All-redacted row',
        kind: 'update',
        redacted: true,
        expanded: true,
        details: [
          { key: 'a', label: 'A', value: 'never-shown-a' },
          { key: 'b', label: 'B', value: 'never-shown-b' },
        ],
      },
    ],
    totals: { create: 0, update: 2, satisfied: 0, conflict: 0, blocked: 0, external: 0, noop: 0 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };

  const body = await renderSSR(h(WizardReconciliationPlanPanel, { plan }));

  // Public value renders verbatim; sensitive raw value never appears.
  assert.ok(body.includes('visible-value'));
  assert.ok(!body.includes('should-not-appear'));
  // Row-level redaction hides every detail value.
  assert.ok(!body.includes('never-shown-a'));
  assert.ok(!body.includes('never-shown-b'));
  // Three redactions: one detail-level (sensitive) + two row-level (a, b).
  assert.equal(countMatches(body, '[redacted]'), 3);
  // data-detail-redacted attribute reflects the lever.
  assert.ok(body.includes('data-detail-redacted="true"'));
  // Row-level redacted marker.
  assert.ok(body.includes('data-row-redacted="true"'));
});

/* -------------------------------------------------------------------------- */
/* Stable per-kind counts                                                      */
/* -------------------------------------------------------------------------- */

test('WizardReconciliationPlanPanel renders caller-supplied per-kind counts verbatim', async () => {
  const plan: WizardReconciliationPlan = {
    rows: [
      { key: 'c1', label: 'c1', kind: 'create' },
      { key: 'c2', label: 'c2', kind: 'create' },
      { key: 'u1', label: 'u1', kind: 'update' },
    ],
    totals: {
      create: 2,
      update: 1,
      satisfied: 5,
      conflict: 7,
      blocked: 9,
      external: 11,
      noop: 13,
    },
    safetyPolicy: 'no-secret-or-production-like-data',
  };

  const body = await renderSSR(h(WizardReconciliationPlanPanel, { plan }));

  assert.ok(body.includes('Will create: 2'));
  assert.ok(body.includes('Will update: 1'));
  assert.ok(body.includes('Already satisfied: 5'));
  assert.ok(body.includes('Conflict: 7'));
  assert.ok(body.includes('Blocked: 9'));
  assert.ok(body.includes('External step required: 11'));
  assert.ok(body.includes('No-op: 13'));
  // data-kind-count attributes also reflect caller totals exactly.
  assert.ok(body.includes('data-kind-summary="conflict"'));
  assert.ok(body.includes('data-kind-count="7"'));
});

/* -------------------------------------------------------------------------- */
/* Determinism: byte-identical SSR for the same input                          */
/* -------------------------------------------------------------------------- */

test('WizardReconciliationPlanPanel produces byte-identical SSR output for the same input', async () => {
  const plan: WizardReconciliationPlan = {
    rows: [
      {
        key: 'a',
        label: 'a',
        kind: 'create',
        details: [{ key: 'd', label: 'd', value: 'v' }],
        expanded: true,
      },
      { key: 'b', label: 'b', kind: 'conflict', reason: 'because' },
      { key: 'c', label: 'c', kind: 'noop' },
    ],
    totals: { create: 1, update: 0, satisfied: 0, conflict: 1, blocked: 0, external: 0, noop: 1 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };

  const first = await renderSSR(h(WizardReconciliationPlanPanel, { plan }));
  const second = await renderSSR(h(WizardReconciliationPlanPanel, { plan }));
  assert.equal(first, second, 'WizardReconciliationPlanPanel must produce byte-identical SSR output');
});

/* -------------------------------------------------------------------------- */
/* WizardDiffListPanel alias                                                   */
/* -------------------------------------------------------------------------- */

test('WizardDiffListPanel alias renders the same DOM as WizardReconciliationPlanPanel', async () => {
  const plan: WizardReconciliationPlan = {
    rows: [{ key: 'k', label: 'label', kind: 'update' }],
    totals: { create: 0, update: 1, satisfied: 0, conflict: 0, blocked: 0, external: 0, noop: 0 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const canonical = await renderSSR(h(WizardReconciliationPlanPanel, { plan }));
  const alias = await renderSSR(h(WizardDiffListPanel, { plan }));
  assert.equal(canonical, alias, 'WizardDiffListPanel must render identically to WizardReconciliationPlanPanel');
});

/* -------------------------------------------------------------------------- */
/* Empty plan                                                                  */
/* -------------------------------------------------------------------------- */

test('WizardReconciliationPlanPanel renders the empty state when no rows are supplied', async () => {
  const plan: WizardReconciliationPlan = {
    rows: [],
    totals: { create: 0, update: 0, satisfied: 0, conflict: 0, blocked: 0, external: 0, noop: 0 },
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(
    h(WizardReconciliationPlanPanel, { plan, emptyLabel: 'No reconciliation needed' }),
  );
  assert.ok(body.includes('facetheory-stitch-wizard-reconciliation-plan-empty'));
  assert.ok(body.includes('No reconciliation needed'));
  assert.ok(!body.includes('facetheory-stitch-wizard-reconciliation-plan-row '));
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
});
