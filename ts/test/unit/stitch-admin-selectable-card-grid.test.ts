import assert from 'node:assert/strict';
import test from 'node:test';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import type {
  ChoiceCardProps,
  SelectableCardGrid,
} from '../../src/stitch-admin/index.js';
import {
  ChoiceCard,
  SelectableCardGridPanel,
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

const NOOP_CHANGE = (): void => {};

const SAMPLE_GRID_SINGLE: SelectableCardGrid = {
  groupId: 'allowed-action',
  selection: 'single',
  selectedKeys: ['create'],
  options: [
    {
      key: 'create',
      title: 'Create new namespace',
      description: 'Adds a fresh namespace under the current tenant.',
      tone: 'success',
      recommended: true,
    },
    {
      key: 'reuse',
      title: 'Reuse existing namespace',
      description: 'Bind the agent to a namespace TheoryMCP already manages.',
      tone: 'info',
    },
    {
      key: 'replace',
      title: 'Replace existing namespace',
      description: 'Destructive: overwrites the existing binding.',
      tone: 'warning',
      riskLabel: 'High blast radius',
    },
    {
      key: 'archive',
      title: 'Archive without binding',
      description: 'Cannot be re-enabled without operator review.',
      disabledReason: 'Requires operator review before archival.',
    },
    {
      key: 'forbidden',
      title: 'Forbidden namespace',
      description: 'Policy disallows this option for the current operator.',
      blocked: true,
      blockedReason: 'Server policy blocks this option for non-admin operators.',
    },
  ],
  label: 'Allowed action',
  description: 'TheoryMCP resolves which of these are available per route.',
  layout: 'grid',
  safetyPolicy: 'no-secret-or-production-like-data',
};

const SAMPLE_GRID_MULTI: SelectableCardGrid = {
  groupId: 'allowed-targets',
  selection: 'multi',
  selectedKeys: ['github', 'mailbox'],
  options: [
    { key: 'github', title: 'GitHub binding' },
    { key: 'mailbox', title: 'Mailbox binding' },
    { key: 'policy', title: 'Policy binding' },
  ],
  layout: 'stack',
  safetyPolicy: 'no-secret-or-production-like-data',
};

/* -------------------------------------------------------------------------- */
/* Single-select / radiogroup semantics                                       */
/* -------------------------------------------------------------------------- */

test('SelectableCardGridPanel renders single-select as a radiogroup with stable data attrs', async () => {
  const body = await renderSSR(
    h(SelectableCardGridPanel, { grid: SAMPLE_GRID_SINGLE, onChange: NOOP_CHANGE }),
  );

  assert.ok(body.includes('facetheory-stitch-selectable-card-grid'));
  assert.ok(body.includes('facetheory-stitch-selectable-card-grid-single'));
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
  assert.ok(body.includes('data-selection="single"'));
  assert.ok(body.includes('data-layout="grid"'));
  assert.ok(body.includes('data-option-count="5"'));
  assert.ok(body.includes('data-selected-count="1"'));

  // Group container uses role="radiogroup" and is wired to the label/description.
  assert.ok(body.includes('role="radiogroup"'));
  assert.ok(body.includes('aria-labelledby="allowed-action-label"'));
  assert.ok(body.includes('aria-describedby="allowed-action-description"'));

  // Each card carries role="radio" + aria-checked.
  assert.equal(countMatches(body, 'role="radio"'), 5);
  assert.ok(body.includes('data-option-key="create"'));
  assert.ok(body.includes('data-option-selected="true"'));

  // Caller-supplied order preserved.
  const order = ['create', 'reuse', 'replace', 'archive', 'forbidden'];
  let prev = -1;
  for (const key of order) {
    const idx = body.indexOf(`data-option-key="${key}"`);
    assert.ok(idx > prev, `option ${key} must appear after previous in SSR output`);
    prev = idx;
  }

  // Safety policy footnote present.
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
});

test('SelectableCardGridPanel renders recommended, risk, and blocked TEXT pills (not color-only)', async () => {
  const body = await renderSSR(
    h(SelectableCardGridPanel, { grid: SAMPLE_GRID_SINGLE, onChange: NOOP_CHANGE }),
  );

  // Recommended pill on the recommended option only.
  const createIdx = body.indexOf('data-option-key="create"');
  const createSnippet = body.slice(createIdx, createIdx + 2000);
  assert.ok(createSnippet.includes('data-pill="recommended"'));
  assert.ok(createSnippet.includes('Recommended'));
  assert.ok(body.includes('data-option-recommended="true"'));

  // Risk label rendered as text on the risky option.
  const replaceIdx = body.indexOf('data-option-key="replace"');
  const replaceSnippet = body.slice(replaceIdx, replaceIdx + 2000);
  assert.ok(replaceSnippet.includes('data-pill="risk"'));
  assert.ok(replaceSnippet.includes('High blast radius'));

  // Blocked pill + blocked reason on the forbidden option.
  const forbiddenIdx = body.indexOf('data-option-key="forbidden"');
  const forbiddenSnippet = body.slice(forbiddenIdx, forbiddenIdx + 2000);
  assert.ok(forbiddenSnippet.includes('data-pill="blocked"'));
  assert.ok(forbiddenSnippet.includes('Blocked'));
  assert.ok(forbiddenSnippet.includes('Server policy blocks this option for non-admin operators.'));
  assert.ok(forbiddenSnippet.includes('data-option-blocked="true"'));

  // Confirm the forbidden option's opening tag carries aria-disabled too.
  const forbiddenTagStart = body.lastIndexOf('<div', forbiddenIdx);
  const forbiddenTagEnd = body.indexOf('>', forbiddenTagStart);
  const forbiddenTag = body.slice(forbiddenTagStart, forbiddenTagEnd + 1);
  assert.ok(forbiddenTag.includes('aria-disabled="true"'));
});

test('SelectableCardGridPanel renders disabled-with-reason wired via aria-describedby', async () => {
  const body = await renderSSR(
    h(SelectableCardGridPanel, { grid: SAMPLE_GRID_SINGLE, onChange: NOOP_CHANGE }),
  );

  // Archive option is disabled via disabledReason. Confirm the same opening
  // tag carries aria-disabled and aria-describedby pointing at the reason id.
  const archiveIdx = body.indexOf('data-option-key="archive"');
  assert.ok(archiveIdx > -1);
  const archiveTagStart = body.lastIndexOf('<div', archiveIdx);
  const archiveTagEnd = body.indexOf('>', archiveTagStart);
  const archiveTag = body.slice(archiveTagStart, archiveTagEnd + 1);
  assert.ok(archiveTag.includes('aria-disabled="true"'));
  assert.ok(archiveTag.includes('aria-describedby="allowed-action-archive-reason"'));

  // The reason node carries the expected id, copy, and data marker.
  assert.ok(body.includes('id="allowed-action-archive-reason"'));
  assert.ok(body.includes('Requires operator review before archival.'));
  assert.ok(body.includes('data-disabled-reason="true"'));
});

/* -------------------------------------------------------------------------- */
/* Multi-select / checkbox group semantics                                    */
/* -------------------------------------------------------------------------- */

test('SelectableCardGridPanel renders multi-select as a group of checkboxes', async () => {
  const body = await renderSSR(
    h(SelectableCardGridPanel, { grid: SAMPLE_GRID_MULTI, onChange: NOOP_CHANGE }),
  );

  assert.ok(body.includes('facetheory-stitch-selectable-card-grid-multi'));
  assert.ok(body.includes('data-selection="multi"'));
  assert.ok(body.includes('data-layout="stack"'));
  assert.ok(body.includes('data-selected-count="2"'));
  assert.ok(body.includes('role="group"'));
  assert.equal(countMatches(body, 'role="checkbox"'), 3);

  // 2 of 3 cards selected → 2 cards with aria-checked="true" and data-option-selected="true",
  // 1 card with aria-checked="false" and data-option-selected="false".
  assert.equal(countMatches(body, 'aria-checked="true"'), 2);
  assert.equal(countMatches(body, 'aria-checked="false"'), 1);
  assert.equal(countMatches(body, 'data-option-selected="true"'), 2);
  assert.equal(countMatches(body, 'data-option-selected="false"'), 1);

  // The unselected option is `policy`.
  const policyIdx = body.indexOf('data-option-key="policy"');
  assert.ok(policyIdx > -1);
  // Search backwards from the policy data attribute to confirm the same card
  // also carries `aria-checked="false"` and `data-option-selected="false"`.
  const policyOpeningTag = body.lastIndexOf('<div', policyIdx);
  const policyTagEnd = body.indexOf('>', policyOpeningTag);
  const policyTag = body.slice(policyOpeningTag, policyTagEnd + 1);
  assert.ok(policyTag.includes('aria-checked="false"'));
  assert.ok(policyTag.includes('data-option-selected="false"'));
});

/* -------------------------------------------------------------------------- */
/* Layout variants                                                            */
/* -------------------------------------------------------------------------- */

test('SelectableCardGridPanel exposes each layout via data-layout', async () => {
  for (const layout of ['grid', 'stack', 'two-column'] as const) {
    const body = await renderSSR(
      h(SelectableCardGridPanel, {
        grid: { ...SAMPLE_GRID_SINGLE, layout },
        onChange: NOOP_CHANGE,
      }),
    );
    assert.ok(body.includes(`data-layout="${layout}"`));
    assert.ok(
      body.includes(`facetheory-stitch-selectable-card-grid-layout-${layout}`),
    );
  }
});

/* -------------------------------------------------------------------------- */
/* Determinism                                                                */
/* -------------------------------------------------------------------------- */

test('SelectableCardGridPanel produces byte-identical SSR output for the same input', async () => {
  const first = await renderSSR(
    h(SelectableCardGridPanel, { grid: SAMPLE_GRID_SINGLE, onChange: NOOP_CHANGE }),
  );
  const second = await renderSSR(
    h(SelectableCardGridPanel, { grid: SAMPLE_GRID_SINGLE, onChange: NOOP_CHANGE }),
  );
  assert.equal(first, second, 'SelectableCardGridPanel must be deterministic');
});

/* -------------------------------------------------------------------------- */
/* Standalone ChoiceCard                                                      */
/* -------------------------------------------------------------------------- */

test('ChoiceCard renders selected single-family card with role=radio + aria-checked', async () => {
  const card: ChoiceCardProps = {
    cardId: 'choice-create',
    option: {
      key: 'create',
      title: 'Create new namespace',
      description: 'Adds a fresh namespace.',
      tone: 'success',
      recommended: true,
    },
    selection: 'single',
    selected: true,
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(h(ChoiceCard, { card }));
  assert.ok(body.includes('facetheory-stitch-choice-card'));
  assert.ok(body.includes('role="radio"'));
  assert.ok(body.includes('aria-checked="true"'));
  assert.ok(body.includes('data-option-key="create"'));
  assert.ok(body.includes('data-option-selected="true"'));
  assert.ok(body.includes('data-option-recommended="true"'));
  assert.ok(body.includes('data-selection-family="single"'));
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
});

test('ChoiceCard renders disabled card with aria-disabled and aria-describedby wiring', async () => {
  const card: ChoiceCardProps = {
    cardId: 'choice-archive',
    option: {
      key: 'archive',
      title: 'Archive without binding',
      disabledReason: 'Requires operator review before archival.',
    },
    selection: 'single',
    selected: false,
    safetyPolicy: 'no-secret-or-production-like-data',
  };
  const body = await renderSSR(h(ChoiceCard, { card }));
  assert.ok(body.includes('aria-disabled="true"'));
  assert.ok(body.includes('aria-describedby="choice-archive-reason"'));
  assert.ok(body.includes('id="choice-archive-reason"'));
  assert.ok(body.includes('Requires operator review before archival.'));
});

/* -------------------------------------------------------------------------- */
/* Fixture safety guard                                                       */
/* -------------------------------------------------------------------------- */

test('SelectableCardGridPanel fixture contains no obvious production-like or secret values', () => {
  const serialized = JSON.stringify(SAMPLE_GRID_SINGLE) + JSON.stringify(SAMPLE_GRID_MULTI);
  const forbidden = ['AKIA', 'aws_secret', 'BEGIN PRIVATE KEY', 'Authorization:', 'api_key='];
  for (const needle of forbidden) {
    assert.equal(serialized.includes(needle), false, `fixture must not include "${needle}"`);
  }
});
