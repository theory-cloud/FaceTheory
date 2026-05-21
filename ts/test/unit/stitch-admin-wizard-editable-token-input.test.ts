import assert from 'node:assert/strict';
import test from 'node:test';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import type { WizardEditableTokenInput } from '../../src/stitch-admin/index.js';
import {
  WizardChipListPanel,
  WizardEditableTokenInputPanel,
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

const BASE_INPUT: WizardEditableTokenInput = {
  inputId: 'allowed-senders',
  value: ['qa@example.com', 'ops@example.com'],
  label: 'Allowed senders',
  description: 'Server validation remains authoritative.',
  placeholder: 'Add another address…',
  removeLabelKind: 'sender',
  safetyPolicy: 'no-secret-or-production-like-data',
};

/* -------------------------------------------------------------------------- */
/* Caller-supplied state passthrough                                          */
/* -------------------------------------------------------------------------- */

test('WizardEditableTokenInputPanel renders caller-supplied tokens in order with stable data attributes', async () => {
  const body = await renderSSR(
    h(WizardEditableTokenInputPanel, { input: BASE_INPUT, onChange: NOOP_CHANGE }),
  );

  assert.ok(body.includes('facetheory-stitch-wizard-editable-token-input'));
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
  assert.ok(body.includes('data-input-id="allowed-senders"'));
  assert.ok(body.includes('data-token-count="2"'));
  assert.ok(body.includes('data-disabled="false"'));
  assert.ok(body.includes('data-read-only="false"'));

  // Tokens render in order.
  const qaIdx = body.indexOf('data-token-value="qa@example.com"');
  const opsIdx = body.indexOf('data-token-value="ops@example.com"');
  assert.ok(qaIdx > -1 && opsIdx > qaIdx);

  // Label + description rendered.
  assert.ok(body.includes('Allowed senders'));
  assert.ok(body.includes('Server validation remains authoritative.'));

  // Label wired via htmlFor + matching input id.
  assert.ok(body.includes('for="allowed-senders"'));
  assert.ok(body.includes('id="allowed-senders"'));

  // Description carries a stable id used in aria-describedby.
  assert.ok(body.includes('id="allowed-senders-description"'));
  assert.ok(body.includes('aria-describedby="allowed-senders-description"'));

  // Placeholder rendered.
  assert.ok(body.includes('placeholder="Add another address…"'));

  // Section is the editable variant in the default state.
  assert.ok(body.includes('facetheory-stitch-wizard-editable-token-input-editable'));
});

/* -------------------------------------------------------------------------- */
/* Accessible Remove button                                                   */
/* -------------------------------------------------------------------------- */

test('WizardEditableTokenInputPanel renders accessible Remove button for each token', async () => {
  const body = await renderSSR(
    h(WizardEditableTokenInputPanel, { input: BASE_INPUT, onChange: NOOP_CHANGE }),
  );

  // Real <button type="button"> per token.
  assert.equal(countMatches(body, 'aria-label="Remove sender qa@example.com"'), 1);
  assert.equal(countMatches(body, 'aria-label="Remove sender ops@example.com"'), 1);
  assert.equal(countMatches(body, '<button type="button"'), 2);
  assert.ok(body.includes('data-remove-token-value="qa@example.com"'));
  assert.ok(body.includes('data-remove-token-index="0"'));
  assert.ok(body.includes('data-remove-token-value="ops@example.com"'));
  assert.ok(body.includes('data-remove-token-index="1"'));
});

/* -------------------------------------------------------------------------- */
/* Per-token metadata: tone, title, disabled, removable                       */
/* -------------------------------------------------------------------------- */

test('WizardEditableTokenInputPanel honours per-token metadata for tone, removability, and disabled', async () => {
  const body = await renderSSR(
    h(WizardEditableTokenInputPanel, {
      input: {
        ...BASE_INPUT,
        value: ['qa@example.com', 'system@example.com', 'frozen@example.com'],
        items: [
          { value: 'qa@example.com', tone: 'success' },
          { value: 'system@example.com', removable: false, title: 'System-managed' },
          { value: 'frozen@example.com', disabled: true },
        ],
      },
      onChange: NOOP_CHANGE,
    }),
  );

  // Tone applied to the first chip.
  assert.ok(body.includes('data-token-value="qa@example.com"'));
  assert.ok(body.includes('data-token-tone="success"'));

  // Non-removable token has no Remove button and is marked accordingly.
  assert.ok(body.includes('data-token-value="system@example.com"'));
  const systemIdx = body.indexOf('data-token-value="system@example.com"');
  const systemSnippet = body.slice(systemIdx, systemIdx + 1200);
  assert.ok(!systemSnippet.includes('data-remove-token-value="system@example.com"'));
  assert.ok(systemSnippet.includes('data-token-removable="false"'));
  // Title attribute carried over.
  assert.ok(systemSnippet.includes('title="System-managed"'));

  // Disabled token: chip class marker is rendered.
  assert.ok(body.includes('facetheory-stitch-wizard-editable-token-input-chip-disabled'));
});

/* -------------------------------------------------------------------------- */
/* tokenPrefix and draftValue                                                 */
/* -------------------------------------------------------------------------- */

test('WizardEditableTokenInputPanel renders tokenPrefix and draftValue', async () => {
  const body = await renderSSR(
    h(WizardEditableTokenInputPanel, {
      input: {
        ...BASE_INPUT,
        tokenPrefix: '@',
        draftValue: 'newuser',
      },
      onChange: NOOP_CHANGE,
    }),
  );

  // Prefix rendered with aria-hidden on every chip.
  assert.equal(countMatches(body, 'aria-hidden="true">@<'), 2);
  // Draft value flows through to the input element.
  assert.ok(body.includes('value="newuser"'));
});

/* -------------------------------------------------------------------------- */
/* Validator-driven feedback                                                  */
/* -------------------------------------------------------------------------- */

test('WizardEditableTokenInputPanel renders validateToken-driven feedback with role="alert"', async () => {
  const body = await renderSSR(
    h(WizardEditableTokenInputPanel, {
      input: {
        ...BASE_INPUT,
        draftValue: 'not-an-email',
        validateToken: (token: string) =>
          token.includes('@')
            ? { valid: true }
            : { valid: false, message: 'Address must contain @' },
      },
      onChange: NOOP_CHANGE,
    }),
  );

  assert.ok(body.includes('role="alert"'));
  assert.ok(body.includes('Address must contain @'));
  assert.ok(body.includes('data-feedback-source="validator"'));
  assert.ok(body.includes('data-feedback-tone="danger"'));
  // The input is wired via aria-describedby to the feedback element.
  assert.ok(body.includes('aria-describedby="allowed-senders-description allowed-senders-feedback"'));
});

/* -------------------------------------------------------------------------- */
/* Duplicate feedback                                                         */
/* -------------------------------------------------------------------------- */

test('WizardEditableTokenInputPanel surfaces duplicate feedback when allowDuplicates !== true', async () => {
  const body = await renderSSR(
    h(WizardEditableTokenInputPanel, {
      input: {
        ...BASE_INPUT,
        draftValue: 'qa@example.com',
      },
      onChange: NOOP_CHANGE,
    }),
  );

  assert.ok(body.includes('data-feedback-source="duplicate"'));
  assert.ok(body.includes('is already in the list'));
});

test('WizardEditableTokenInputPanel does not surface duplicate feedback when allowDuplicates is true', async () => {
  const body = await renderSSR(
    h(WizardEditableTokenInputPanel, {
      input: {
        ...BASE_INPUT,
        draftValue: 'qa@example.com',
        allowDuplicates: true,
      },
      onChange: NOOP_CHANGE,
    }),
  );
  assert.ok(!body.includes('data-feedback-source="duplicate"'));
  assert.ok(!body.includes('is already in the list'));
});

/* -------------------------------------------------------------------------- */
/* maxTokens feedback                                                         */
/* -------------------------------------------------------------------------- */

test('WizardEditableTokenInputPanel surfaces maxTokens feedback when at capacity', async () => {
  const body = await renderSSR(
    h(WizardEditableTokenInputPanel, {
      input: {
        ...BASE_INPUT,
        maxTokens: 2,
      },
      onChange: NOOP_CHANGE,
    }),
  );
  assert.ok(body.includes('data-feedback-source="max-tokens"'));
  assert.ok(body.includes('Maximum 2 tokens reached.'));
  assert.ok(body.includes('data-max-tokens="2"'));
});

/* -------------------------------------------------------------------------- */
/* Caller-supplied feedback wins                                              */
/* -------------------------------------------------------------------------- */

test('WizardEditableTokenInputPanel prefers caller-supplied feedbackMessage over computed feedback', async () => {
  const body = await renderSSR(
    h(WizardEditableTokenInputPanel, {
      input: {
        ...BASE_INPUT,
        draftValue: 'qa@example.com', // would normally trigger duplicate
        feedbackMessage: 'Server says: address pending review',
        feedbackTone: 'warning',
      },
      onChange: NOOP_CHANGE,
    }),
  );

  assert.ok(body.includes('Server says: address pending review'));
  assert.ok(body.includes('data-feedback-source="caller"'));
  assert.ok(body.includes('data-feedback-tone="warning"'));
  assert.ok(!body.includes('is already in the list'));
});

/* -------------------------------------------------------------------------- */
/* Disabled / read-only text labeling                                         */
/* -------------------------------------------------------------------------- */

test('WizardEditableTokenInputPanel labels disabled state as text and disables the input', async () => {
  const body = await renderSSR(
    h(WizardEditableTokenInputPanel, {
      input: { ...BASE_INPUT, disabled: true },
      onChange: NOOP_CHANGE,
    }),
  );
  assert.ok(body.includes('data-disabled="true"'));
  // Text label in the header.
  assert.ok(body.includes('aria-label="Disabled"'));
  assert.ok(body.includes('data-state="disabled"'));
  // No editable input element rendered in the read-only/disabled state.
  assert.ok(!body.includes('type="text"'));
  assert.ok(!body.includes('facetheory-stitch-wizard-editable-token-input-input"'));
  // Read-only / disabled state announced as status.
  assert.ok(body.includes('Token entry is disabled.'));
  // Remove buttons not rendered in disabled state.
  assert.ok(!body.includes('data-remove-token-value="qa@example.com"'));
});

test('WizardEditableTokenInputPanel labels read-only state as text and disables Remove buttons', async () => {
  const body = await renderSSR(
    h(WizardEditableTokenInputPanel, {
      input: { ...BASE_INPUT, readOnly: true },
      onChange: NOOP_CHANGE,
    }),
  );
  assert.ok(body.includes('data-read-only="true"'));
  assert.ok(body.includes('aria-label="Read-only"'));
  assert.ok(body.includes('Token entry is read-only.'));
  // No editable input element rendered.
  assert.ok(!body.includes('type="text"'));
  assert.ok(!body.includes('facetheory-stitch-wizard-editable-token-input-input"'));
  // Remove buttons are not present (chips render but without remove control).
  assert.ok(!body.includes('data-remove-token-value="qa@example.com"'));
  assert.ok(body.includes('data-token-removable="false"'));
});

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

test('WizardEditableTokenInputPanel renders empty-tokens placeholder when value is empty', async () => {
  const body = await renderSSR(
    h(WizardEditableTokenInputPanel, {
      input: { ...BASE_INPUT, value: [] },
      onChange: NOOP_CHANGE,
    }),
  );
  assert.ok(body.includes('facetheory-stitch-wizard-editable-token-input-empty'));
  assert.ok(body.includes('No tokens yet.'));
  assert.ok(body.includes('data-token-count="0"'));
});

/* -------------------------------------------------------------------------- */
/* Determinism                                                                */
/* -------------------------------------------------------------------------- */

test('WizardEditableTokenInputPanel produces byte-identical SSR output for the same props', async () => {
  const first = await renderSSR(
    h(WizardEditableTokenInputPanel, { input: BASE_INPUT, onChange: NOOP_CHANGE }),
  );
  const second = await renderSSR(
    h(WizardEditableTokenInputPanel, { input: BASE_INPUT, onChange: NOOP_CHANGE }),
  );
  assert.equal(first, second, 'editable token input must be deterministic');
});

/* -------------------------------------------------------------------------- */
/* ChipList alias                                                             */
/* -------------------------------------------------------------------------- */

test('WizardChipListPanel alias renders the same DOM as WizardEditableTokenInputPanel', async () => {
  const canonical = await renderSSR(
    h(WizardEditableTokenInputPanel, { input: BASE_INPUT, onChange: NOOP_CHANGE }),
  );
  const alias = await renderSSR(
    h(WizardChipListPanel, { input: BASE_INPUT, onChange: NOOP_CHANGE }),
  );
  assert.equal(canonical, alias, 'ChipList alias must render identically');
});

/* -------------------------------------------------------------------------- */
/* Safety policy footnote + fixture guard                                     */
/* -------------------------------------------------------------------------- */

test('WizardEditableTokenInputPanel renders the safety-policy footnote into the DOM', async () => {
  const body = await renderSSR(
    h(WizardEditableTokenInputPanel, { input: BASE_INPUT, onChange: NOOP_CHANGE }),
  );
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
  assert.ok(body.includes('facetheory-stitch-wizard-safety-footnote'));
});

test('WizardEditableTokenInputPanel fixture contains no obvious production-like or secret values', () => {
  const serialized = JSON.stringify(BASE_INPUT);
  const forbidden = [
    'AKIA',
    'aws_secret',
    'BEGIN PRIVATE KEY',
    'Authorization:',
    'api_key=',
  ];
  for (const needle of forbidden) {
    assert.equal(serialized.includes(needle), false, `fixture must not include "${needle}"`);
  }
});
