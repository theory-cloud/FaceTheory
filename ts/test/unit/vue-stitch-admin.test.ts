import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import { createVueFace, h } from '../../src/vue/index.js';
import {
  CopyableCode,
  DataTable,
  DestructiveConfirm,
  DetailPanel,
  FilterChipGroup,
  FormRow,
  FormSection,
  InlineKeyValueList,
  LogStream,
  PropertyGrid,
  SplitForm,
  StatusTag,
  Tabs,
} from '../../src/vue/stitch-admin/index.js';

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

test('vue stitch-admin: DataTable renders toolbar content, rows, and row actions', async () => {
  const body = await renderSSR(
    h(
      DataTable,
      {
        rowKey: 'key',
        dataSource: [
          { key: '1', name: 'Acme Corp', status: 'active' },
          { key: '2', name: 'Globex', status: 'pending' },
        ],
        columns: [
          { key: 'name', dataIndex: 'name', title: 'Name' },
          { key: 'status', dataIndex: 'status', title: 'Status' },
        ],
      },
      {
        'toolbar-left': () => h('span', null, '2 partners'),
        'toolbar-center': () => h('input', { placeholder: 'Search' }),
        'toolbar-right': () => h('button', null, 'New partner'),
        rowActions: ({ record }: { record: { key: string } }) =>
          h('button', { 'data-key': record.key }, 'Edit'),
      },
    ),
  );

  assert.ok(body.includes('facetheory-stitch-data-table'));
  assert.ok(body.includes('facetheory-stitch-data-table-toolbar'));
  assert.ok(body.includes('2 partners'));
  assert.ok(body.includes('Search'));
  assert.ok(body.includes('New partner'));
  assert.ok(body.includes('data-key="1"'));
  assert.ok(body.includes('data-key="2"'));
});

test('vue stitch-admin: detail, form, status, and destructive primitives render parity markers', async () => {
  const body = await renderSSR(
    h('div', null, [
      h(PropertyGrid, {
        items: [
          { key: 'id', label: 'Tenant ID', value: 'acme-prod' },
          {
            key: 'note',
            label: 'Notes',
            value: 'Full-width note',
            span: 'full',
          },
        ],
      }),
      h(DetailPanel, {
        title: 'Acme Corp',
        description: 'Tenant overview',
        actions: h('button', null, 'Edit'),
        properties: [
          { key: 'id', label: 'Tenant ID', value: 'acme-prod' },
          { key: 'plan', label: 'Plan', value: 'Enterprise' },
        ],
      }),
      h(SplitForm, null, {
        default: () => [
          h(
            FormRow,
            {
              label: 'Email',
              description: 'The admin contact for this tenant',
              required: true,
              error: 'Email is required',
            },
            { default: () => h('input', { type: 'email' }) },
          ),
          h(
            FormSection,
            {
              title: 'Authentication',
              description: 'Control how users sign in to this tenant',
            },
            {
              default: () =>
                h(
                  FormRow,
                  { label: 'Allow passwords' },
                  { default: () => h('input', { type: 'checkbox' }) },
                ),
            },
          ),
        ],
      }),
      h(StatusTag, { variant: 'active', label: 'Active · 12 members' }),
      h(DestructiveConfirm, {
        title: 'Delete tenant?',
        requireText: 'acme-prod',
      }),
    ]),
  );

  assert.ok(body.includes('facetheory-stitch-property-grid'));
  assert.ok(body.includes('facetheory-stitch-detail-panel'));
  assert.ok(body.includes('facetheory-stitch-form-row'));
  assert.ok(body.includes('facetheory-stitch-form-section'));
  assert.ok(body.includes('role="alert"'));
  assert.ok(body.includes('facetheory-stitch-status-tag-active'));
  assert.ok(body.includes('Active · 12 members'));
  assert.ok(body.includes('Type &quot;acme-prod&quot; to confirm'));
});

test('vue stitch-admin: tabs, chips, key-value rows, copy code, logs, and policy variants render parity markers', async () => {
  const body = await renderSSR(
    h('div', null, [
      h(
        Tabs,
        {
          activeKey: 'policies',
          items: [
            { key: 'policies', label: 'Knowledge Policies', count: 8 },
            { key: 'catalog', label: 'Knowledge Catalog', count: 12 },
          ],
        },
        {
          default: () =>
            h('div', { 'data-testid': 'policies-body' }, 'policies body'),
        },
      ),
      h(
        FilterChipGroup,
        {
          chips: [
            { key: 'status', label: 'status: active' },
            { key: 'manifest', label: 'manifest: stale', count: 2 },
          ],
        },
        {
          trailing: () => h('a', { href: '#clear' }, 'Clear all'),
        },
      ),
      h(InlineKeyValueList, {
        entries: [
          { key: 'org', label: 'ORG', value: 'org_882910' },
          { key: 'wksp', label: 'WKSP', value: 'ws_prod_01' },
        ],
      }),
      h(CopyableCode, { code: 'lab.theorymcp.ai/theorycloud/mcp' }),
      h(LogStream, {
        variant: 'terminal',
        title: 'repair_logs_tty1',
        entries: [
          {
            id: '1',
            timestamp: '14:02:11',
            level: 'debug',
            message: 'Initiating global state handshake...',
          },
          {
            id: '2',
            timestamp: '14:02:12',
            level: 'success',
            message: 'Handshake SUCCESS',
          },
        ],
      }),
      h(StatusTag, { variant: 'allow' }),
      h(StatusTag, { variant: 'deny' }),
      h(StatusTag, { variant: 'warning' }),
    ]),
  );

  assert.ok(body.includes('facetheory-stitch-tabs'));
  assert.ok(body.includes('facetheory-stitch-tabs-count'));
  assert.ok(body.includes('policies body'));
  assert.ok(body.includes('facetheory-stitch-filter-chip-group'));
  assert.ok(body.includes('facetheory-stitch-filter-chip-remove'));
  assert.ok(body.includes('Clear all'));
  assert.ok(body.includes('facetheory-stitch-inline-key-value-list'));
  assert.ok(body.includes('org_882910'));
  assert.ok(body.includes('facetheory-stitch-copyable-code'));
  assert.ok(body.includes('aria-label="Copy"'));
  assert.ok(body.includes('facetheory-stitch-log-stream-terminal'));
  assert.ok(body.includes('repair_logs_tty1'));
  assert.ok(body.includes('Handshake SUCCESS'));
  assert.ok(body.includes('facetheory-stitch-status-tag-allow'));
  assert.ok(body.includes('facetheory-stitch-status-tag-deny'));
  assert.ok(body.includes('facetheory-stitch-status-tag-warning'));
  assert.ok(body.includes('Allow'));
  assert.ok(body.includes('Deny'));
  assert.ok(body.includes('Warning'));
});
