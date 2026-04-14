import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import { createVueFace, h } from '../../src/vue/index.js';
import {
  Callout,
  PageFrame,
  Panel,
  Section,
  Shell,
  StatCard,
  SummaryStrip,
  resolveActiveNav,
  type NavItem,
} from '../../src/vue/stitch-shell/index.js';

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

test('vue stitch-shell: shared nav resolution still works', () => {
  const result = resolveActiveNav('/partners/new/foo', sampleNav);
  assert.equal(result.activeKey, '/partners/new');
  assert.deepEqual(
    result.breadcrumbs.map((node) => node.key),
    ['partners-group', '/partners/new'],
  );
});

test('vue stitch-shell: Shell renders nav, topbar, and content', async () => {
  const body = await renderSSR(
    h(
      Shell,
      {
        nav: sampleNav,
        activeKey: '/dashboard',
        brand: h('span', { 'data-testid': 'brand' }, 'Autheory'),
        topbarRight: h('span', { 'data-testid': 'user' }, 'Jane Doe'),
      },
      {
        default: () => h('div', { 'data-testid': 'content' }, 'hello world'),
      },
    ),
  );

  assert.ok(body.includes('facetheory-stitch-shell'));
  assert.ok(body.includes('facetheory-stitch-sidebar'));
  assert.ok(body.includes('facetheory-stitch-topbar'));
  assert.ok(body.includes('Dashboard'));
  assert.ok(body.includes('Autheory'));
  assert.ok(body.includes('Jane Doe'));
  assert.ok(body.includes('hello world'));
  assert.ok(!body.includes('Settings'));
});

test('vue stitch-shell: PageFrame and section primitives render tokenized content', async () => {
  const body = await renderSSR(
    h(
      PageFrame,
      {
        breadcrumbs: [
          { key: 'root', label: 'Home', path: '/' },
          { key: 'partners', label: 'Partners', path: '/partners' },
        ],
        title: 'Acme Corp',
        description: 'Partner details',
        actions: h('button', null, 'Edit'),
      },
      {
        default: () =>
          h('div', null, [
            h(
              Section,
              {
                title: 'Metrics',
                description: 'Last 30 days',
                actions: h('button', null, 'Refresh'),
              },
              {
                default: () =>
                  h(SummaryStrip, null, {
                    default: () => [
                      h(StatCard, {
                        label: 'Active users',
                        value: '1,204',
                        delta: { value: '+8%', trend: 'up' },
                      }),
                      h(Panel, null, {
                        default: () => h('span', null, 'inside panel'),
                      }),
                    ],
                  }),
              },
            ),
          ]),
      },
    ),
  );

  assert.ok(body.includes('facetheory-stitch-page-frame'));
  assert.ok(body.includes('facetheory-stitch-breadcrumb'));
  assert.ok(body.includes('href="/"'));
  assert.ok(body.includes('href="/partners"'));
  assert.ok(body.includes('facetheory-stitch-section'));
  assert.ok(body.includes('facetheory-stitch-summary-strip'));
  assert.ok(body.includes('facetheory-stitch-stat-card'));
  assert.ok(body.includes('inside panel'));
  assert.ok(body.includes('--stitch-color-tertiary'));
});

test('vue stitch-shell: Callout renders variant classes, note/alert roles, and actions', async () => {
  const body = await renderSSR(
    h('div', null, [
      h(
        Callout,
        {
          variant: 'info',
          title: 'L7 Slug Priority',
        },
        {
          default: () =>
            h(
              'p',
              null,
              'Incoming requests are first matched against the primary slug.',
            ),
        },
      ),
      h(Callout, {
        variant: 'warning',
        title: 'Stale manifest',
        actions: h('button', null, 'Refresh'),
      }),
    ]),
  );

  assert.ok(body.includes('facetheory-stitch-callout'));
  assert.ok(body.includes('facetheory-stitch-callout-info'));
  assert.ok(body.includes('facetheory-stitch-callout-warning'));
  assert.ok(body.includes('role="note"'));
  assert.ok(body.includes('role="alert"'));
  assert.ok(body.includes('facetheory-stitch-callout-actions'));
  assert.ok(body.includes('Refresh'));
});
