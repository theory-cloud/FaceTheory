import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import { createVueFace, h } from '../../src/vue/index.js';
import { Fragment as VueFragment } from 'vue';
import {
  BrandHeader,
  Callout,
  PageFrame,
  Panel,
  Section,
  Shell,
  StatCard,
  SummaryStrip,
  Topbar,
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

test('vue stitch-shell: Topbar renders logo and surfaceLabel on the left edge in order', async () => {
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

test('vue stitch-shell: Topbar omits logo/surfaceLabel wrappers when not provided', async () => {
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

test('vue stitch-shell: Topbar omits wrappers when logo/surfaceLabel/left are falsy (false, null, "")', async () => {
  // Vue parity regression guard for the React test of the same name.
  // Downstream apps compose chrome through the `cond && node` idiom; the
  // wrapper must not leave empty flex children when the guard is falsy.
  const falsyValues: Array<false | null | ''> = [false, null, ''];
  for (const falsy of falsyValues) {
    const body = await renderSSR(
      h(
        Topbar,
        {
          logo: falsy,
          surfaceLabel: falsy,
          left: falsy,
          right: h('span', null, 'user'),
        } as Record<string, unknown>,
      ),
    );
    assert.ok(
      !body.includes('facetheory-stitch-topbar-logo'),
      `falsy logo (${JSON.stringify(falsy)}) must not render the wrapper`,
    );
    assert.ok(
      !body.includes('facetheory-stitch-topbar-surface-label'),
      `falsy surfaceLabel (${JSON.stringify(falsy)}) must not render the wrapper`,
    );
  }
});

test('vue stitch-shell: Topbar omits wrappers for arrays-of-falsies and empty fragments', async () => {
  const emptyShapes: Array<{ label: string; value: unknown }> = [
    { label: 'array of falsy scalars', value: [false, null, undefined] },
    { label: 'empty fragment', value: h(VueFragment) },
    {
      label: 'fragment wrapping only falsies',
      value: h(VueFragment, null, [false, null]),
    },
  ];
  for (const shape of emptyShapes) {
    const body = await renderSSR(
      h(
        Topbar,
        {
          logo: shape.value,
          surfaceLabel: shape.value,
          right: h('span', null, 'user'),
        } as Record<string, unknown>,
      ),
    );
    assert.ok(
      !body.includes('facetheory-stitch-topbar-logo'),
      `${shape.label}: logo wrapper must not render`,
    );
    assert.ok(
      !body.includes('facetheory-stitch-topbar-surface-label'),
      `${shape.label}: surface-label wrapper must not render`,
    );
  }
});

test('vue stitch-shell: Topbar still renders wrappers when arrays / fragments contain renderable content', async () => {
  const body = await renderSSR(
    h(
      Topbar,
      {
        logo: [false, h('span', null, 'LOGO')],
        surfaceLabel: h(VueFragment, null, [null, '[Core]']),
        right: h('span', null, 'user'),
      } as Record<string, unknown>,
    ),
  );
  assert.ok(body.includes('facetheory-stitch-topbar-logo'));
  assert.ok(body.includes('LOGO'));
  assert.ok(body.includes('facetheory-stitch-topbar-surface-label'));
  assert.ok(body.includes('[Core]'));
});

test('vue stitch-shell: Shell forwards topbarLogo and topbarSurfaceLabel into Topbar', async () => {
  const body = await renderSSR(
    h(
      Shell,
      {
        nav: sampleNav,
        activeKey: '/dashboard',
        topbarLogo: h('span', { 'data-testid': 'shell-logo' }, 'TC'),
        topbarSurfaceLabel: h(
          'span',
          { 'data-testid': 'shell-surface' },
          '[MCP]',
        ),
      },
      {
        default: () => h('div', null, 'content'),
      },
    ),
  );
  assert.ok(body.includes('facetheory-stitch-topbar-logo'));
  assert.ok(body.includes('facetheory-stitch-topbar-surface-label'));
  assert.ok(body.includes('TC'));
  assert.ok(body.includes('[MCP]'));
});

test('vue stitch-shell: BrandHeader renders logo + wordmark without a surface chip by default', async () => {
  const body = await renderSSR(
    h(BrandHeader, {
      logo: h('span', null, '◆'),
      wordmark: 'Theory Cloud',
    }),
  );
  assert.ok(body.includes('facetheory-stitch-brand-header'));
  assert.ok(body.includes('facetheory-stitch-brand-header-logo'));
  assert.ok(body.includes('facetheory-stitch-brand-header-wordmark'));
  assert.ok(body.includes('Theory Cloud'));
  assert.ok(!body.includes('facetheory-stitch-brand-header-surface-label'));
});

test('vue stitch-shell: BrandHeader omits the surface chip when surfaceLabel is falsy (false, null, "")', async () => {
  const falsyValues: Array<false | null | ''> = [false, null, ''];
  for (const falsy of falsyValues) {
    const body = await renderSSR(
      h(
        BrandHeader,
        {
          logo: h('span', null, '◆'),
          wordmark: 'Theory Cloud',
          surfaceLabel: falsy,
        } as Record<string, unknown>,
      ),
    );
    assert.ok(
      !body.includes('facetheory-stitch-brand-header-surface-label'),
      `falsy surfaceLabel (${JSON.stringify(falsy)}) must not render the chip wrapper`,
    );
  }
});

test('vue stitch-shell: BrandHeader omits the surface chip for arrays-of-falsies and empty fragments', async () => {
  const emptyShapes: Array<{ label: string; value: unknown }> = [
    { label: 'array of falsy scalars', value: [false, null, undefined] },
    { label: 'empty fragment', value: h(VueFragment) },
    {
      label: 'fragment wrapping only falsies',
      value: h(VueFragment, null, [false, null]),
    },
  ];
  for (const shape of emptyShapes) {
    const body = await renderSSR(
      h(
        BrandHeader,
        {
          logo: h('span', null, '◆'),
          wordmark: 'Theory Cloud',
          surfaceLabel: shape.value,
        } as Record<string, unknown>,
      ),
    );
    assert.ok(
      !body.includes('facetheory-stitch-brand-header-surface-label'),
      `${shape.label}: chip wrapper must not render`,
    );
  }
});

test('vue stitch-shell: BrandHeader surfaceTone binds chip background via stitch CSS variables', async () => {
  const body = await renderSSR(
    h(BrandHeader, {
      logo: h('span', null, '◆'),
      wordmark: 'Theory Cloud',
      surfaceLabel: '[MCP]',
      surfaceTone: 'secondary',
    }),
  );
  assert.ok(body.includes('facetheory-stitch-brand-header-surface-label'));
  assert.ok(body.includes('[MCP]'));
  assert.ok(body.includes('--stitch-color-secondary-container'));
  assert.ok(body.includes('--stitch-color-on-secondary-container'));
  assert.ok(body.includes('data-surface-tone="secondary"'));
});

test('vue stitch-shell: BrandHeader without surfaceTone falls back to neutral surface-container tokens', async () => {
  const body = await renderSSR(
    h(BrandHeader, {
      logo: h('span', null, '◆'),
      wordmark: 'Theory Cloud',
      surfaceLabel: 'Ops',
    }),
  );
  assert.ok(body.includes('--stitch-color-surface-container-high'));
});

test('vue stitch-shell: BrandHeader composes with Topbar via the logo slot', async () => {
  const body = await renderSSR(
    h(Topbar, {
      logo: h(BrandHeader, {
        logo: h('span', null, '◆'),
        wordmark: 'Theory Cloud',
        surfaceLabel: '[Auth]',
        surfaceTone: 'tertiary',
      }),
      right: h('span', null, 'user'),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-topbar-logo'));
  assert.ok(body.includes('facetheory-stitch-brand-header'));
  assert.ok(body.includes('[Auth]'));
  assert.ok(body.includes('--stitch-color-tertiary-container'));
});
