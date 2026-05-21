import assert from 'node:assert/strict';
import test from 'node:test';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import type {
  CodeDropzoneProps,
  PackageSourceInput,
} from '../../src/stitch-admin/index.js';
import {
  CodeDropzone,
  PackageSourceInputPanel,
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

const NOOP_VALUE_CHANGE = (): void => {};
const NOOP_FILES = (): void => {};

const SAMPLE_INPUT_PASTE: PackageSourceInput = {
  groupId: 'pkg-src',
  value: 'name: acme-agent\nversion: 0.1.0\n',
  state: 'validating',
  errors: [],
  modes: ['paste', 'dropzone', 'upload'],
  label: 'Package source',
  description: 'TheoryMCP parses and validates server-side before preview.',
  placeholder: 'Paste your agent manifest…',
  fileAccept: '.yaml,.yml,.json',
  actions: { clear: true, replace: true, copy: true, copyValue: 'name: acme-agent\nversion: 0.1.0\n' },
  safetyPolicy: 'no-secret-or-production-like-data',
};

const SAMPLE_INPUT_INVALID: PackageSourceInput = {
  groupId: 'pkg-invalid',
  value: 'bad',
  state: 'invalid',
  errors: [
    { id: 'syntax-1', kind: 'invalid-syntax', message: 'Expected top-level mapping at line 1', evidence: 'line 1, col 1' },
    { id: 'unsafe-1', kind: 'unsafe', message: 'Manifest references an unsupported scheme' },
  ],
  modes: ['paste'],
  safetyPolicy: 'no-secret-or-production-like-data',
};

const SAMPLE_INPUT_FORBIDDEN: PackageSourceInput = {
  groupId: 'pkg-forbidden',
  value: '',
  state: 'forbidden',
  errors: [
    { id: 'fb-1', kind: 'forbidden', message: 'Operator policy blocks this manifest for the current route.' },
  ],
  modes: ['paste'],
  safetyPolicy: 'no-secret-or-production-like-data',
};

const SAMPLE_INPUT_REDACTED: PackageSourceInput = {
  groupId: 'pkg-redacted',
  value: '',
  state: 'redacted',
  errors: [
    {
      id: 'red-1',
      kind: 'redacted',
      message: 'Manifest contains redacted content that cannot be displayed.',
      // Intentionally include caller-supplied "evidence" pointing at a fake secret
      // so the test can prove the primitive never renders it for kind=redacted.
      evidence: 'AKIA-NEVER-SHOWN-1234567890',
    },
  ],
  modes: ['paste'],
  safetyPolicy: 'no-secret-or-production-like-data',
};

const SAMPLE_INPUT_READY: PackageSourceInput = {
  groupId: 'pkg-ready',
  value: 'name: acme-agent\nversion: 0.1.0\n',
  state: 'ready',
  errors: [],
  modes: ['paste'],
  fileMeta: { name: 'acme-agent.yaml', sizeBytes: 412, mediaType: 'application/yaml', sha256: 'abc123' },
  safetyPolicy: 'no-secret-or-production-like-data',
};

/* -------------------------------------------------------------------------- */
/* Paste / upload / dropzone mode rendering                                   */
/* -------------------------------------------------------------------------- */

test('PackageSourceInputPanel renders paste, dropzone, and upload modes with stable data attrs', async () => {
  const body = await renderSSR(
    h(PackageSourceInputPanel, {
      input: SAMPLE_INPUT_PASTE,
      onValueChange: NOOP_VALUE_CHANGE,
      onFiles: NOOP_FILES,
    }),
  );
  assert.ok(body.includes('facetheory-stitch-package-source-input'));
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
  assert.ok(body.includes('data-group-id="pkg-src"'));
  assert.ok(body.includes('data-state="validating"'));
  assert.ok(body.includes('data-modes="paste dropzone upload"'));
  // Paste textarea with the right id.
  assert.ok(body.includes('id="pkg-src-paste"'));
  assert.ok(body.includes('data-mode="paste"'));
  // Dropzone with role=group and labelled by the announce label.
  assert.ok(body.includes('data-mode="dropzone"'));
  assert.ok(body.includes('data-dropzone-state="validating"'));
  // File picker with the right id and accept.
  assert.ok(body.includes('id="pkg-src-file"'));
  assert.ok(body.includes('data-mode="upload"'));
  assert.ok(body.includes('accept=".yaml,.yml,.json"'));
  // State announced via role=status with aria-live=polite for validating.
  assert.ok(body.includes('Validating source'));
  assert.ok(body.includes('role="status"'));
  assert.ok(body.includes('aria-live="polite"'));
  // Safety policy footnote rendered.
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
});

/* -------------------------------------------------------------------------- */
/* Error kinds                                                                */
/* -------------------------------------------------------------------------- */

test('PackageSourceInputPanel renders invalid-syntax + unsafe errors with role=alert and evidence', async () => {
  const body = await renderSSR(
    h(PackageSourceInputPanel, {
      input: SAMPLE_INPUT_INVALID,
      onValueChange: NOOP_VALUE_CHANGE,
    }),
  );
  assert.ok(body.includes('data-state="invalid"'));
  assert.ok(body.includes('data-error-count="2"'));
  assert.ok(body.includes('data-error-kind="invalid-syntax"'));
  assert.ok(body.includes('data-error-kind="unsafe"'));
  assert.ok(body.includes('Invalid syntax'));
  assert.ok(body.includes('Expected top-level mapping at line 1'));
  // Caller-supplied non-redacted evidence is rendered for invalid-syntax.
  assert.ok(body.includes('line 1, col 1'));
  // Both error entries carry role=alert; the alert-state announcement also
  // does (because state=invalid is itself an alert), so total is 3.
  assert.equal(countMatches(body, 'role="alert"'), 3);
  // Errors specifically carry the role on `<li>` elements with data-error-kind.
  assert.equal(countMatches(body, 'data-error-kind="invalid-syntax"'), 1);
  assert.equal(countMatches(body, 'data-error-kind="unsafe"'), 1);
  // The textarea aria-invalid mirrors the alert state.
  assert.ok(body.includes('aria-invalid="true"'));
});

test('PackageSourceInputPanel renders forbidden error with role=alert + state label', async () => {
  const body = await renderSSR(
    h(PackageSourceInputPanel, {
      input: SAMPLE_INPUT_FORBIDDEN,
      onValueChange: NOOP_VALUE_CHANGE,
    }),
  );
  assert.ok(body.includes('data-state="forbidden"'));
  assert.ok(body.includes('data-error-kind="forbidden"'));
  assert.ok(body.includes('Forbidden'));
  assert.ok(body.includes('Operator policy blocks this manifest for the current route.'));
  assert.ok(body.includes('Source not allowed'));
});

test('PackageSourceInputPanel never renders caller-supplied evidence for kind=redacted', async () => {
  const body = await renderSSR(
    h(PackageSourceInputPanel, {
      input: SAMPLE_INPUT_REDACTED,
      onValueChange: NOOP_VALUE_CHANGE,
    }),
  );
  assert.ok(body.includes('data-state="redacted"'));
  assert.ok(body.includes('data-error-kind="redacted"'));
  assert.ok(body.includes('Manifest contains redacted content that cannot be displayed.'));
  // Even though the fixture deliberately includes a fake secret in `evidence`,
  // the primitive must NOT render it for kind=redacted.
  assert.equal(
    body.includes('AKIA-NEVER-SHOWN-1234567890'),
    false,
    'redacted errors must not render caller-supplied evidence',
  );
});

/* -------------------------------------------------------------------------- */
/* Ready state + file meta                                                    */
/* -------------------------------------------------------------------------- */

test('PackageSourceInputPanel renders ready state with file metadata', async () => {
  const body = await renderSSR(
    h(PackageSourceInputPanel, {
      input: SAMPLE_INPUT_READY,
      onValueChange: NOOP_VALUE_CHANGE,
    }),
  );
  assert.ok(body.includes('data-state="ready"'));
  assert.ok(body.includes('data-has-file="true"'));
  assert.ok(body.includes('Ready for server preview'));
  assert.ok(body.includes('data-file-name="acme-agent.yaml"'));
  assert.ok(body.includes('412 B'));
  assert.ok(body.includes('application/yaml'));
  assert.ok(body.includes('abc123'));
});

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

test('PackageSourceInputPanel renders Clear/Replace/Copy as real keyboard-accessible buttons', async () => {
  const body = await renderSSR(
    h(PackageSourceInputPanel, {
      input: SAMPLE_INPUT_PASTE,
      onValueChange: NOOP_VALUE_CHANGE,
    }),
  );
  assert.ok(body.includes('data-action="clear"'));
  assert.ok(body.includes('data-action="replace"'));
  assert.ok(body.includes('data-action="copy"'));
  assert.ok(body.includes('aria-label="Clear package source"'));
  assert.ok(body.includes('aria-label="Replace package source"'));
  assert.ok(body.includes('aria-label="Copy package source"'));
  assert.ok(body.includes('data-copy-value="name: acme-agent\nversion: 0.1.0\n"') || body.includes('data-copy-value="name: acme-agent') /* paranoid match */);
  assert.equal(countMatches(body, '<button type="button"'), 3);
});

/* -------------------------------------------------------------------------- */
/* Determinism                                                                */
/* -------------------------------------------------------------------------- */

test('PackageSourceInputPanel produces byte-identical SSR output for the same input', async () => {
  const first = await renderSSR(
    h(PackageSourceInputPanel, { input: SAMPLE_INPUT_PASTE, onValueChange: NOOP_VALUE_CHANGE }),
  );
  const second = await renderSSR(
    h(PackageSourceInputPanel, { input: SAMPLE_INPUT_PASTE, onValueChange: NOOP_VALUE_CHANGE }),
  );
  assert.equal(first, second, 'PackageSourceInputPanel must be deterministic');
});

/* -------------------------------------------------------------------------- */
/* Standalone CodeDropzone                                                    */
/* -------------------------------------------------------------------------- */

test('CodeDropzone renders state-labeled dropzone with file metadata and errors', async () => {
  const dropzone: CodeDropzoneProps = {
    dropzoneId: 'drop-1',
    label: 'Drop a package',
    description: 'TheoryMCP parses and validates server-side.',
    state: 'validating',
    fileMeta: { name: 'acme-agent.yaml', sizeBytes: 412 },
    safetyPolicy: 'no-secret-or-production-like-data',
    errors: [{ id: 'e1', kind: 'invalid-syntax', message: 'Manifest tail not closed' }],
  };
  const body = await renderSSR(h(CodeDropzone, { dropzone }));
  assert.ok(body.includes('facetheory-stitch-code-dropzone'));
  assert.ok(body.includes('data-dropzone-id="drop-1"'));
  assert.ok(body.includes('data-state="validating"'));
  assert.ok(body.includes('Validating source'));
  assert.ok(body.includes('data-file-name="acme-agent.yaml"'));
  assert.ok(body.includes('data-error-kind="invalid-syntax"'));
  assert.ok(body.includes('Manifest tail not closed'));
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
});

/* -------------------------------------------------------------------------- */
/* Fixture safety guard                                                       */
/* -------------------------------------------------------------------------- */

test('PackageSourceInputPanel fixtures contain no AWS keys or other production-like secrets in displayed surfaces', () => {
  // The intentional fake-secret in SAMPLE_INPUT_REDACTED.evidence is the test's
  // way of proving the primitive does NOT render redacted evidence. It must
  // never be rendered into the DOM (verified by the redacted-evidence test).
  // Confirm no OTHER fixture serialization contains AWS keys / api_key= /
  // BEGIN PRIVATE KEY / Authorization: in displayed surfaces.
  for (const input of [SAMPLE_INPUT_PASTE, SAMPLE_INPUT_INVALID, SAMPLE_INPUT_FORBIDDEN, SAMPLE_INPUT_READY]) {
    const serialized = JSON.stringify(input);
    const forbidden = ['AKIA', 'aws_secret', 'BEGIN PRIVATE KEY', 'Authorization:', 'api_key='];
    for (const needle of forbidden) {
      assert.equal(
        serialized.includes(needle),
        false,
        `fixture "${input.groupId}" must not include "${needle}"`,
      );
    }
  }
});
