import assert from 'node:assert/strict';
import test from 'node:test';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import {
  Callout,
  PageFrame,
  Panel,
  Section,
  Shell,
  StatCard,
  SummaryStrip,
  Topbar,
  resolveActiveNav as reactResolveActiveNav,
  type NavItem,
} from '../../src/react/stitch-shell/index.js';
import { resolveActiveNav } from '../../src/stitch-shell/index.js';

const h = React.createElement;

const sampleNav: NavItem[] = [
  { key: '/dashboard', label: 'Dashboard', path: '/dashboard' },
  {
    key: 'partners-group',
    label: 'Partners',
    children: [
      { key: '/partners', label: 'All partners', path: '/partners' },
      { key: '/partners/new', label: 'New partner', path: '/partners/new' },
    ],
  },
  { key: '/staff', label: 'Staff', path: '/staff' },
  { key: '/settings', label: 'Settings', path: '/settings', hidden: true },
];

test('resolveActiveNav: exact path match selects the correct leaf', () => {
  const result = resolveActiveNav('/dashboard', sampleNav);
  assert.equal(result.activeKey, '/dashboard');
  assert.equal(result.pageTitle, 'Dashboard');
  assert.deepEqual(
    result.breadcrumbs.map((b) => b.key),
    ['/dashboard'],
  );
});

test('resolveActiveNav: nested child is matched and breadcrumb walks up the group', () => {
  const result = resolveActiveNav('/partners/new', sampleNav);
  assert.equal(result.activeKey, '/partners/new');
  assert.deepEqual(
    result.breadcrumbs.map((b) => b.key),
    ['partners-group', '/partners/new'],
  );
  assert.equal(result.pageTitle, 'New partner');
});

test('resolveActiveNav: longest-prefix wins when a sub-route is active', () => {
  // /partners/123 matches /partners (length 9), the leaf wins over the group.
  const result = resolveActiveNav('/partners/123', sampleNav);
  assert.equal(result.activeKey, '/partners');
  assert.deepEqual(
    result.breadcrumbs.map((b) => b.key),
    ['partners-group', '/partners'],
  );
});

test('resolveActiveNav: /partners/new beats /partners when path is /partners/new/foo', () => {
  const result = resolveActiveNav('/partners/new/foo', sampleNav);
  assert.equal(result.activeKey, '/partners/new');
});

test('resolveActiveNav: hidden items still participate in breadcrumb resolution', () => {
  const result = resolveActiveNav('/settings', sampleNav);
  assert.equal(result.activeKey, '/settings');
});

test('resolveActiveNav: unmatched pathname returns empty result', () => {
  const result = resolveActiveNav('/nowhere', sampleNav);
  assert.equal(result.activeKey, undefined);
  assert.deepEqual(result.breadcrumbs, []);
  assert.equal(result.pageTitle, undefined);
});

test('resolveActiveNav: React subpath re-exports the shared resolver', () => {
  assert.deepEqual(
    reactResolveActiveNav('/partners/new', sampleNav),
    resolveActiveNav('/partners/new', sampleNav),
  );
});

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

test('Shell renders sidebar, topbar, and content region', async () => {
  const body = await renderSSR(
    h(Shell, {
      nav: sampleNav,
      activeKey: '/dashboard',
      brand: h('span', { 'data-testid': 'brand' }, 'Autheory'),
      topbarRight: h('span', { 'data-testid': 'user' }, 'Jane Doe'),
      children: h('div', { 'data-testid': 'content' }, 'hello world'),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-shell'));
  assert.ok(body.includes('ant-layout-has-sider'));
  assert.ok(body.includes('facetheory-stitch-sidebar'));
  assert.ok(body.includes('facetheory-stitch-topbar'));
  assert.ok(body.includes('hello world'));
  assert.ok(body.includes('Autheory'));
  assert.ok(body.includes('Jane Doe'));
  assert.ok(body.includes('Dashboard'));
});

test('Shell hides nav items marked hidden', async () => {
  const body = await renderSSR(
    h(Shell, {
      nav: sampleNav,
      activeKey: '/dashboard',
      children: h('div', null, 'content'),
    }),
  );
  // The hidden Settings item must not appear in the sidebar.
  const sidebarStart = body.indexOf('facetheory-stitch-sidebar-menu');
  const sidebarEnd = body.indexOf('facetheory-stitch-shell-content');
  const sidebarSlice = body.slice(sidebarStart, sidebarEnd);
  assert.ok(!sidebarSlice.includes('Settings'));
});

test('Shell renders anchor nav items when no client navigation handler is provided', async () => {
  const body = await renderSSR(
    h(Shell, {
      nav: sampleNav,
      activeKey: '/dashboard',
      openKeys: ['partners-group'],
      children: h('div', null, 'content'),
    }),
  );
  assert.ok(body.includes('href="/dashboard"'));
  assert.ok(body.includes('href="/partners"'));
  assert.ok(body.includes('href="/partners/new"'));
});

test('PageFrame renders breadcrumb anchors without a client navigation handler', async () => {
  const body = await renderSSR(
    h(PageFrame, {
      breadcrumbs: [
        { key: 'root', label: 'Home', path: '/' },
        { key: 'partners', label: 'Partners', path: '/partners' },
        { key: 'acme', label: 'Acme Corp' },
      ],
      title: 'Acme Corp',
      description: 'Partner details and security posture',
      actions: h('button', { 'data-testid': 'edit' }, 'Edit'),
      children: h('p', null, 'page body'),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-page-frame'));
  assert.ok(body.includes('facetheory-stitch-breadcrumb'));
  assert.ok(body.includes('href="/"'));
  assert.ok(body.includes('href="/partners"'));
  assert.ok(body.includes('Acme Corp'));
  assert.ok(body.includes('Partner details and security posture'));
  assert.ok(body.includes('Edit'));
  assert.ok(body.includes('page body'));
});

test('Section renders title, description, actions, and children', async () => {
  const body = await renderSSR(
    h(Section, {
      title: 'Active sessions',
      description: '12 total',
      actions: h('button', null, 'Revoke all'),
      children: h('ul', null, h('li', null, 'session-1')),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-section'));
  assert.ok(body.includes('Active sessions'));
  assert.ok(body.includes('12 total'));
  assert.ok(body.includes('Revoke all'));
  assert.ok(body.includes('session-1'));
});

test('Panel uses CSS variables for surface + radius', async () => {
  const body = await renderSSR(
    h(Panel, { children: h('span', null, 'inside panel') }),
  );
  assert.ok(body.includes('facetheory-stitch-panel'));
  assert.ok(body.includes('inside panel'));
  assert.ok(body.includes('--stitch-color-surface-container-lowest'));
  assert.ok(body.includes('--stitch-radius-xl'));
});

test('SummaryStrip wraps StatCards in a responsive grid', async () => {
  const body = await renderSSR(
    h(SummaryStrip, {
      children: [
        h(StatCard, {
          key: 'active',
          label: 'Active users',
          value: '1,204',
          delta: { value: '+8%', trend: 'up' },
        }),
        h(StatCard, { key: 'sessions', label: 'Sessions', value: '98' }),
      ],
    }),
  );
  assert.ok(body.includes('facetheory-stitch-summary-strip'));
  assert.ok(body.includes('facetheory-stitch-stat-card'));
  assert.ok(body.includes('Active users'));
  assert.ok(body.includes('1,204'));
  assert.ok(body.includes('+8%'));
  assert.ok(body.includes('Sessions'));
  assert.ok(body.includes('98'));
});

test('StatCard delta trend colors bind to Stitch tokens', async () => {
  const body = await renderSSR(
    h(
      'div',
      null,
      h(StatCard, {
        label: 'Up',
        value: '1',
        delta: { value: '+10%', trend: 'up' },
      }),
      h(StatCard, {
        label: 'Down',
        value: '2',
        delta: { value: '-5%', trend: 'down' },
      }),
    ),
  );
  assert.ok(body.includes('--stitch-color-tertiary'));
  assert.ok(body.includes('--stitch-color-error'));
});

test('Callout renders title, content, and an accent-bound variant class', async () => {
  const body = await renderSSR(
    h(Callout, {
      variant: 'info',
      title: 'L7 Slug Priority',
      children: h(
        'p',
        null,
        'Incoming requests are first matched against the primary slug.',
      ),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-callout'));
  assert.ok(body.includes('facetheory-stitch-callout-info'));
  assert.ok(body.includes('L7 Slug Priority'));
  assert.ok(body.includes('primary slug'));
});

test('Callout danger variant takes role="alert" for assistive tech', async () => {
  const body = await renderSSR(
    h(Callout, {
      variant: 'danger',
      title: 'Manifest snapshot corrupted',
    }),
  );
  assert.ok(body.includes('facetheory-stitch-callout-danger'));
  assert.ok(body.includes('role="alert"'));
});

test('Callout info variant uses role="note" instead of alert', async () => {
  const body = await renderSSR(
    h(Callout, { variant: 'info', title: 'Just a note' }),
  );
  assert.ok(body.includes('role="note"'));
  assert.ok(!/facetheory-stitch-callout-info[^>]*role="alert"/.test(body));
});

test('Callout renders an actions slot when provided', async () => {
  const body = await renderSSR(
    h(Callout, {
      variant: 'warning',
      title: 'Stale manifest',
      actions: h('button', { 'data-testid': 'refresh' }, 'Refresh'),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-callout-actions'));
  assert.ok(body.includes('Refresh'));
});

test('Topbar renders logo and surfaceLabel on the left edge in order', async () => {
  const body = await renderSSR(
    h(Topbar, {
      logo: h('span', { 'data-testid': 'logo' }, 'LOGO'),
      surfaceLabel: h('span', { 'data-testid': 'surface' }, '[Core]'),
      left: h('span', { 'data-testid': 'title' }, 'Dashboard'),
      right: h('span', null, 'user'),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-topbar-logo'));
  assert.ok(body.includes('facetheory-stitch-topbar-surface-label'));
  const logoIdx = body.indexOf('LOGO');
  const surfaceIdx = body.indexOf('[Core]');
  const titleIdx = body.indexOf('Dashboard');
  assert.ok(logoIdx !== -1 && surfaceIdx !== -1 && titleIdx !== -1);
  assert.ok(logoIdx < surfaceIdx, 'logo renders before surfaceLabel');
  assert.ok(surfaceIdx < titleIdx, 'surfaceLabel renders before left');
});

test('Topbar omits logo/surfaceLabel wrappers when not provided', async () => {
  const body = await renderSSR(
    h(Topbar, {
      left: h('span', null, 'Dashboard'),
      right: h('span', null, 'user'),
    }),
  );
  assert.ok(body.includes('Dashboard'));
  assert.ok(!body.includes('facetheory-stitch-topbar-logo'));
  assert.ok(!body.includes('facetheory-stitch-topbar-surface-label'));
});

test('Shell forwards topbarLogo and topbarSurfaceLabel into the Topbar', async () => {
  const body = await renderSSR(
    h(Shell, {
      nav: sampleNav,
      activeKey: '/dashboard',
      topbarLogo: h('span', { 'data-testid': 'shell-logo' }, 'TC'),
      topbarSurfaceLabel: h(
        'span',
        { 'data-testid': 'shell-surface' },
        '[MCP]',
      ),
      children: h('div', null, 'content'),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-topbar-logo'));
  assert.ok(body.includes('facetheory-stitch-topbar-surface-label'));
  assert.ok(body.includes('TC'));
  assert.ok(body.includes('[MCP]'));
});
