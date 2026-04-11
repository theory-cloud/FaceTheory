import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import { createVueFace, h } from '../../src/vue/index.js';
import {
  DataTable,
  DestructiveConfirm,
  DetailPanel,
  FormRow,
  FormSection,
  PropertyGrid,
  SplitForm,
  StatusTag,
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
