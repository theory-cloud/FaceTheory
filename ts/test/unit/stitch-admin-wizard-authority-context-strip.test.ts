import assert from 'node:assert/strict';
import test from 'node:test';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import type { WizardAuthorityContextStrip } from '../../src/stitch-admin/index.js';
import {
  WizardAuthorityContextStripPanel,
  WizardServerResolvedContextBarPanel,
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

const SAMPLE_STRIP: WizardAuthorityContextStrip = {
  items: [
    { key: 'tenant', label: 'Tenant', value: 'theory-mcp' },
    { key: 'namespace', label: 'Namespace', value: 'acme', tone: 'info' },
    {
      key: 'route',
      label: 'MCP route',
      value: '/agents/acme',
      copyable: true,
    },
    {
      key: 'operator',
      label: 'Operator',
      value: 'aron@equal-to.ai',
      tone: 'success',
      badge: 'session',
    },
  ],
  authorityLabel: 'Server-derived',
  readOnlyLabel: 'Read-only',
  layout: 'auto',
  safetyPolicy: 'no-secret-or-production-like-data',
};

/* -------------------------------------------------------------------------- */
/* Caller-supplied state passthrough                                          */
/* -------------------------------------------------------------------------- */

test('WizardAuthorityContextStripPanel renders caller-supplied items in order with stable data attributes', async () => {
  const body = await renderSSR(h(WizardAuthorityContextStripPanel, { strip: SAMPLE_STRIP }));

  assert.ok(body.includes('facetheory-stitch-wizard-authority-context-strip'));
  assert.ok(body.includes('data-safety-policy="no-secret-or-production-like-data"'));
  assert.ok(body.includes('data-item-count="4"'));
  assert.ok(body.includes('data-layout="auto"'));
  assert.ok(body.includes('data-size="md"'));
  assert.ok(body.includes('data-read-only="true"'));
  assert.ok(body.includes('data-has-authority-label="true"'));

  // Caller-supplied order preserved.
  const order = ['tenant', 'namespace', 'route', 'operator'];
  let prev = -1;
  for (const key of order) {
    const idx = body.indexOf(`data-item-key="${key}"`);
    assert.ok(idx > prev, `item ${key} must appear after previous item in SSR output`);
    prev = idx;
  }

  // Label + value pairs render as <dt>/<dd>.
  assert.ok(body.includes('<dt'));
  assert.ok(body.includes('Tenant'));
  assert.ok(body.includes('theory-mcp'));
  assert.ok(body.includes('Namespace'));
  assert.ok(body.includes('acme'));
  assert.ok(body.includes('Operator'));
  assert.ok(body.includes('aron@equal-to.ai'));

  // Tone hints rendered.
  assert.ok(body.includes('data-item-tone="info"'));
  assert.ok(body.includes('data-item-tone="success"'));
  assert.ok(body.includes('data-item-tone="neutral"'));

  // Authority + read-only labels rendered as text (not just color).
  assert.ok(body.includes('Server-derived'));
  assert.ok(body.includes('Read-only'));
  assert.ok(body.includes('data-authority-label="true"'));
  assert.ok(body.includes('data-read-only-label="true"'));
  // The read-only span carries an explicit aria-label for accessibility.
  assert.ok(body.includes('aria-label="Read-only"'));

  // Section is announced as a region with a stable name.
  assert.ok(body.includes('role="region"'));
});

/* -------------------------------------------------------------------------- */
/* Layout variants                                                            */
/* -------------------------------------------------------------------------- */

test('WizardAuthorityContextStripPanel exposes data-layout for each of the four layout values', async () => {
  const layouts = ['strip', 'grid', 'stack', 'auto'] as const;
  for (const layout of layouts) {
    const body = await renderSSR(
      h(WizardAuthorityContextStripPanel, {
        strip: { ...SAMPLE_STRIP, layout },
      }),
    );
    assert.ok(
      body.includes(`data-layout="${layout}"`),
      `data-layout should reflect layout="${layout}"`,
    );
    assert.ok(
      body.includes(
        `facetheory-stitch-wizard-authority-context-strip-layout-${layout}`,
      ),
      `class marker for layout="${layout}" should be present`,
    );
  }
});

test('WizardAuthorityContextStripPanel honours `wrap=false` on strip layout', async () => {
  const body = await renderSSR(
    h(WizardAuthorityContextStripPanel, {
      strip: { ...SAMPLE_STRIP, layout: 'strip', wrap: false },
    }),
  );
  assert.ok(body.includes('data-wrap="false"'));
});

test('WizardAuthorityContextStripPanel honours each size token', async () => {
  for (const size of ['sm', 'md', 'lg'] as const) {
    const body = await renderSSR(
      h(WizardAuthorityContextStripPanel, {
        strip: { ...SAMPLE_STRIP, size },
      }),
    );
    assert.ok(body.includes(`data-size="${size}"`), `data-size should reflect size="${size}"`);
    assert.ok(
      body.includes(`facetheory-stitch-wizard-authority-context-strip-size-${size}`),
      `class marker for size="${size}" should be present`,
    );
  }
});

/* -------------------------------------------------------------------------- */
/* Copyable cells                                                             */
/* -------------------------------------------------------------------------- */

test('WizardAuthorityContextStripPanel renders accessible copy button with deterministic payload', async () => {
  const body = await renderSSR(h(WizardAuthorityContextStripPanel, { strip: SAMPLE_STRIP }));

  // Real <button type="button"> for the copyable cell.
  assert.ok(body.includes('<button type="button"'));
  assert.ok(body.includes('aria-label="Copy MCP route"'));
  assert.ok(body.includes('data-copy-item-key="route"'));
  assert.ok(body.includes('data-copy-value="/agents/acme"'));
  // Non-copyable cells do not render a copy button.
  const tenantIdx = body.indexOf('data-item-key="tenant"');
  const tenantSnippet = body.slice(tenantIdx, tenantIdx + 2000);
  assert.ok(!tenantSnippet.includes('data-copy-item-key="tenant"'));
});

test('WizardAuthorityContextStripPanel uses item.copyValue when supplied instead of item.value', async () => {
  const body = await renderSSR(
    h(WizardAuthorityContextStripPanel, {
      strip: {
        items: [
          {
            key: 'route',
            label: 'MCP route',
            value: '/agents/acme',
            copyable: true,
            copyValue: 'mcp+route://acme/agents/import',
          },
        ],
        safetyPolicy: 'no-secret-or-production-like-data',
      },
    }),
  );
  assert.ok(body.includes('data-copy-value="mcp+route://acme/agents/import"'));
  // The visible value still renders verbatim.
  assert.ok(body.includes('/agents/acme'));
});

/* -------------------------------------------------------------------------- */
/* Safe href                                                                  */
/* -------------------------------------------------------------------------- */

test('WizardAuthorityContextStripPanel drops unsafe href schemes', async () => {
  const body = await renderSSR(
    h(WizardAuthorityContextStripPanel, {
      strip: {
        items: [
          { key: 'a', label: 'OK link', value: 'docs', href: '/docs/agents' },
          { key: 'b', label: 'Hostile', value: 'click', href: 'javascript:alert(1)' },
        ],
        safetyPolicy: 'no-secret-or-production-like-data',
      },
    }),
  );
  assert.ok(body.includes('href="/docs/agents"'));
  assert.ok(!body.includes('javascript:alert(1)'));
});

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

test('WizardAuthorityContextStripPanel renders empty state when no items are supplied', async () => {
  const body = await renderSSR(
    h(WizardAuthorityContextStripPanel, {
      strip: {
        items: [],
        emptyLabel: 'No server-resolved context yet',
        safetyPolicy: 'no-secret-or-production-like-data',
      },
    }),
  );
  assert.ok(body.includes('facetheory-stitch-wizard-authority-context-strip-empty'));
  assert.ok(body.includes('No server-resolved context yet'));
  assert.ok(body.includes('data-item-count="0"'));
});

/* -------------------------------------------------------------------------- */
/* Read-only / authority cues are text-labeled, not color-only                */
/* -------------------------------------------------------------------------- */

test('WizardAuthorityContextStripPanel renders read-only and authority cues as text without relying on color', async () => {
  const body = await renderSSR(h(WizardAuthorityContextStripPanel, { strip: SAMPLE_STRIP }));

  // The cues live in actual DOM text nodes (not just data attributes / inline color).
  const authorityIdx = body.indexOf('Server-derived');
  const readOnlyIdx = body.indexOf('Read-only');
  assert.ok(authorityIdx > -1);
  assert.ok(readOnlyIdx > -1);

  // The read-only span carries an explicit aria-label so screen-readers also see it.
  assert.ok(body.includes('aria-label="Read-only"'));
  // The authority label has its own data attribute for non-color identification.
  assert.ok(body.includes('data-authority-label="true"'));
});

/* -------------------------------------------------------------------------- */
/* Determinism                                                                */
/* -------------------------------------------------------------------------- */

test('WizardAuthorityContextStripPanel produces byte-identical SSR output for the same input', async () => {
  const first = await renderSSR(h(WizardAuthorityContextStripPanel, { strip: SAMPLE_STRIP }));
  const second = await renderSSR(h(WizardAuthorityContextStripPanel, { strip: SAMPLE_STRIP }));
  assert.equal(first, second, 'WizardAuthorityContextStripPanel must be deterministic');
});

/* -------------------------------------------------------------------------- */
/* ServerResolvedContextBar alias                                             */
/* -------------------------------------------------------------------------- */

test('WizardServerResolvedContextBarPanel alias renders the same DOM as WizardAuthorityContextStripPanel', async () => {
  const canonical = await renderSSR(
    h(WizardAuthorityContextStripPanel, { strip: SAMPLE_STRIP }),
  );
  const alias = await renderSSR(
    h(WizardServerResolvedContextBarPanel, { strip: SAMPLE_STRIP }),
  );
  assert.equal(canonical, alias, 'alias must render identically to the canonical component');
});

/* -------------------------------------------------------------------------- */
/* No secrets / no production-like fixtures contract                          */
/* -------------------------------------------------------------------------- */

test('WizardAuthorityContextStripPanel renders the safety-policy footnote into the DOM', async () => {
  const body = await renderSSR(h(WizardAuthorityContextStripPanel, { strip: SAMPLE_STRIP }));
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
  assert.ok(body.includes('facetheory-stitch-wizard-safety-footnote'));
});

test('WizardAuthorityContextStripPanel fixture contains no obvious production-like or secret values', () => {
  // The strip fixture above is the same one used by the rest of this suite.
  // Sanity-check that nothing in it could plausibly be mistaken for a real
  // secret or a production tenant/customer/release identifier.
  const serialized = JSON.stringify(SAMPLE_STRIP);
  const forbiddenSubstrings = [
    'AKIA', // AWS access key id prefix
    'aws_secret',
    'BEGIN PRIVATE KEY',
    'rotation-token',
    'api_key=',
    'Authorization:',
  ];
  for (const needle of forbiddenSubstrings) {
    assert.equal(
      serialized.includes(needle),
      false,
      `fixture must not include "${needle}"`,
    );
  }
});
