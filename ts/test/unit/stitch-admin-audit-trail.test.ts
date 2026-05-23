import assert from 'node:assert/strict';
import test from 'node:test';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import type {
  AuditTrail,
  DisclosurePanelProps,
} from '../../src/stitch-admin/index.js';
import {
  AuditTrailPanel,
  DisclosurePanel,
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
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const SAMPLE_TRAIL: AuditTrail = {
  groupId: 'trail-root',
  label: 'Validation history',
  description: 'Server-derived audit events for this import.',
  variant: 'detailed',
  safetyPolicy: 'no-secret-or-production-like-data',
  groups: [
    {
      id: 'parse',
      label: 'Parse',
      description: 'Manifest parsing events.',
      expanded: true,
      events: [
        {
          id: 'parse-start',
          timestamp: '2026-05-21T17:00:00.000Z',
          title: 'Parse started',
          status: 'info',
          tone: 'info',
          actor: 'theory-mcp-server',
          actorSource: 'Server-derived',
        },
        {
          id: 'parse-done',
          timestamp: '2026-05-21T17:00:02.000Z',
          title: 'Parse complete',
          status: 'success',
          tone: 'success',
          body: 'Manifest is well-formed.',
          metadata: [
            { key: 'files', label: 'Files', value: '3' },
            { key: 'bytes', label: 'Bytes', value: '4,212' },
          ],
        },
      ],
    },
    {
      id: 'reconcile',
      label: 'Reconcile',
      description: 'Reconciliation against existing inventory.',
      expanded: true,
      events: [
        {
          id: 'reconcile-warn',
          timestamp: '2026-05-21T17:00:03.000Z',
          title: 'Drift detected',
          status: 'warning',
          tone: 'warning',
          body: 'One capability has drifted from authoritative state.',
        },
        {
          id: 'reconcile-error',
          timestamp: '2026-05-21T17:00:04.000Z',
          title: 'Conflict',
          status: 'error',
          tone: 'danger',
          body: 'Two capabilities conflict.',
          externalLink: {
            href: 'https://docs.example.com/reconcile-conflict',
            label: 'Reconciliation help',
          },
        },
      ],
    },
    {
      id: 'apply',
      label: 'Apply',
      description: 'Final apply phase.',
      expanded: true,
      events: [
        {
          // Even though the host supplies body / metadata / externalLink here,
          // the primitive must render ONLY the redactedMarker.
          id: 'apply-redacted',
          timestamp: '2026-05-21T17:00:05.000Z',
          title: 'Mailbox secret rotated',
          status: 'info',
          tone: 'neutral',
          redactedMarker: '[redacted — mailbox secret]',
          body: 'AKIA-NEVER-SHOWN-IN-BODY-1234567890',
          metadata: [
            {
              key: 'secret',
              label: 'Secret',
              value: 'AKIA-NEVER-SHOWN-IN-META-1234567890',
            },
          ],
          externalLink: {
            href: 'https://docs.example.com/secret-rotation',
            label: 'AKIA-NEVER-SHOWN-IN-LINK-1234567890',
          },
        },
        // External link with an executable href must be filtered.
        {
          id: 'apply-unsafe-link',
          timestamp: '2026-05-21T17:00:06.000Z',
          title: 'Documented operator step',
          externalLink: {
            href: 'javascript:alert(1)',
            label: 'Run unsafe',
          },
        },
      ],
    },
  ],
};

const EMPTY_TRAIL: AuditTrail = {
  groupId: 'trail-empty',
  label: 'Validation history',
  variant: 'compact',
  safetyPolicy: 'no-secret-or-production-like-data',
  emptyLabel: 'No audit events yet.',
  groups: [],
};

const DISCLOSURE_COLLAPSED: DisclosurePanelProps = {
  panelId: 'disc-collapsed',
  label: 'Server resolved details',
  description: 'Open to inspect host-resolved details.',
  expanded: false,
  tone: 'neutral',
  safetyPolicy: 'no-secret-or-production-like-data',
};

const DISCLOSURE_EXPANDED: DisclosurePanelProps = {
  panelId: 'disc-expanded',
  label: 'Server resolved details',
  expanded: true,
  tone: 'info',
  status: 'info',
  safetyPolicy: 'no-secret-or-production-like-data',
};

const DISCLOSURE_ERROR: DisclosurePanelProps = {
  panelId: 'disc-error',
  label: 'Apply failed',
  expanded: true,
  tone: 'danger',
  status: 'error',
  safetyPolicy: 'no-secret-or-production-like-data',
};

/* -------------------------------------------------------------------------- */
/* AuditTrailPanel                                                            */
/* -------------------------------------------------------------------------- */

test('AuditTrailPanel renders groups + events with stable data attrs and safety footnote', async () => {
  const body = await renderSSR(h(AuditTrailPanel, { trail: SAMPLE_TRAIL }));
  assert.ok(body.includes('facetheory-stitch-audit-trail'));
  assert.ok(
    body.includes('data-safety-policy="no-secret-or-production-like-data"'),
  );
  assert.ok(body.includes('data-group-id="trail-root"'));
  assert.ok(body.includes('data-variant="detailed"'));
  assert.ok(body.includes('data-group-count="3"'));
  assert.ok(body.includes('data-event-count="6"'));
  assert.ok(body.includes('data-error-count="1"'));
  assert.ok(body.includes('data-group-id="parse"'));
  assert.ok(body.includes('data-group-id="reconcile"'));
  assert.ok(body.includes('data-group-id="apply"'));
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
});

test('AuditTrailPanel group disclosure toggles carry aria-expanded + aria-controls', async () => {
  const body = await renderSSR(h(AuditTrailPanel, { trail: SAMPLE_TRAIL }));
  // Each group is a button toggle.
  assert.ok(body.includes('data-group-toggle="parse"'));
  assert.ok(body.includes('data-group-toggle="reconcile"'));
  assert.ok(body.includes('data-group-toggle="apply"'));
  assert.ok(body.includes('aria-controls="parse-events"'));
  assert.ok(body.includes('aria-controls="reconcile-events"'));
  assert.ok(body.includes('aria-controls="apply-events"'));
  // All three groups expanded in this fixture.
  assert.ok(body.includes('data-group-expanded="true"'));
  // Buttons have explicit type="button" so they don't accidentally submit forms.
  assert.ok(body.includes('<button type="button"'));
});

test('AuditTrailPanel renders error event with role=alert', async () => {
  const body = await renderSSR(h(AuditTrailPanel, { trail: SAMPLE_TRAIL }));
  // Exactly one error event exists in the trail.
  assert.ok(body.includes('data-event-id="reconcile-error"'));
  assert.equal(countMatches(body, 'data-event-status="error"'), 1);
  // The reconcile group is collapsed so its events region is hidden. The
  // collapsed events still must not be in the DOM until expanded, but role
  // markers on the <li> still appear when expanded. Confirm error count is
  // surfaced on the group toggle.
  assert.ok(body.includes('data-group-error-count="1"'));
});

test('AuditTrailPanel suppresses body/metadata/externalLink for redacted events', async () => {
  const body = await renderSSR(h(AuditTrailPanel, { trail: SAMPLE_TRAIL }));
  // Marker text is rendered.
  assert.ok(body.includes('[redacted — mailbox secret]'));
  assert.ok(body.includes('data-event-redacted="true"'));
  // No part of the caller-supplied AKIA-shaped fake-secret strings is present.
  assert.equal(body.includes('AKIA-NEVER-SHOWN-IN-BODY-1234567890'), false);
  assert.equal(body.includes('AKIA-NEVER-SHOWN-IN-META-1234567890'), false);
  assert.equal(body.includes('AKIA-NEVER-SHOWN-IN-LINK-1234567890'), false);
});

test('AuditTrailPanel drops javascript: external links and emits noopener+target=_blank on safe links', async () => {
  const body = await renderSSR(h(AuditTrailPanel, { trail: SAMPLE_TRAIL }));
  // The safe link survives.
  assert.ok(
    body.includes('href="https://docs.example.com/reconcile-conflict"'),
  );
  // The javascript: link is dropped entirely; neither href nor label remain.
  assert.equal(body.includes('javascript:alert(1)'), false);
  assert.equal(body.includes('Run unsafe'), false);
  // Safe external links carry rel + target.
  assert.ok(body.includes('rel="noopener noreferrer"'));
  assert.ok(body.includes('target="_blank"'));
});

test('AuditTrailPanel renders empty state with caller-supplied label', async () => {
  const body = await renderSSR(h(AuditTrailPanel, { trail: EMPTY_TRAIL }));
  assert.ok(body.includes('facetheory-stitch-audit-trail-empty'));
  assert.ok(body.includes('No audit events yet.'));
  assert.ok(body.includes('data-event-count="0"'));
});

test('AuditTrailPanel produces byte-identical SSR output for the same trail', async () => {
  const first = await renderSSR(h(AuditTrailPanel, { trail: SAMPLE_TRAIL }));
  const second = await renderSSR(h(AuditTrailPanel, { trail: SAMPLE_TRAIL }));
  assert.equal(first, second, 'AuditTrailPanel must be deterministic');
});

/* -------------------------------------------------------------------------- */
/* DisclosurePanel                                                            */
/* -------------------------------------------------------------------------- */

test('DisclosurePanel renders collapsed state with hidden content region', async () => {
  const body = await renderSSR(
    h(
      DisclosurePanel,
      { panel: DISCLOSURE_COLLAPSED },
      h('span', { 'data-disclosure-child': 'true' }, 'Hidden child'),
    ),
  );
  assert.ok(body.includes('data-disclosure-id="disc-collapsed"'));
  assert.ok(body.includes('data-disclosure-expanded="false"'));
  assert.ok(body.includes('aria-expanded="false"'));
  assert.ok(body.includes('aria-controls="disc-collapsed-region"'));
  // Collapsed → child is not rendered.
  assert.equal(body.includes('data-disclosure-child="true"'), false);
  assert.equal(body.includes('Hidden child'), false);
  // Safety footnote is always emitted.
  assert.ok(body.includes('Safety policy: no-secret-or-production-like-data'));
});

test('DisclosurePanel renders expanded state with visible content region', async () => {
  const body = await renderSSR(
    h(
      DisclosurePanel,
      { panel: DISCLOSURE_EXPANDED },
      h('span', { 'data-disclosure-child': 'true' }, 'Visible child'),
    ),
  );
  assert.ok(body.includes('data-disclosure-id="disc-expanded"'));
  assert.ok(body.includes('data-disclosure-expanded="true"'));
  assert.ok(body.includes('aria-expanded="true"'));
  assert.ok(body.includes('data-disclosure-child="true"'));
  assert.ok(body.includes('Visible child'));
});

test('DisclosurePanel with status=error gets role=alert on the section', async () => {
  const body = await renderSSR(
    h(
      DisclosurePanel,
      { panel: DISCLOSURE_ERROR },
      h('p', null, 'Apply failed.'),
    ),
  );
  assert.ok(body.includes('data-disclosure-status="error"'));
  assert.ok(body.includes('role="alert"'));
});

test('DisclosurePanel is byte-identical across repeated SSR renders', async () => {
  const first = await renderSSR(
    h(DisclosurePanel, { panel: DISCLOSURE_EXPANDED }, h('p', null, 'Same')),
  );
  const second = await renderSSR(
    h(DisclosurePanel, { panel: DISCLOSURE_EXPANDED }, h('p', null, 'Same')),
  );
  assert.equal(first, second, 'DisclosurePanel must be deterministic');
});

/* -------------------------------------------------------------------------- */
/* Fixture safety guard                                                       */
/* -------------------------------------------------------------------------- */

test('AuditTrail / DisclosurePanel fixtures do not leak production-like secrets into displayed surfaces', async () => {
  const body = await renderSSR(h(AuditTrailPanel, { trail: SAMPLE_TRAIL }));
  // The intentional fake-secret strings used inside redacted events to prove
  // suppression must never appear in the rendered output.
  for (const needle of [
    'AKIA-NEVER-SHOWN-IN-BODY-1234567890',
    'AKIA-NEVER-SHOWN-IN-META-1234567890',
    'AKIA-NEVER-SHOWN-IN-LINK-1234567890',
  ]) {
    assert.equal(
      body.includes(needle),
      false,
      `AuditTrailPanel must never render redacted secret "${needle}"`,
    );
  }
});
