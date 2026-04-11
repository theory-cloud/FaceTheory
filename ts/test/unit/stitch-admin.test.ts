import assert from 'node:assert/strict';
import test from 'node:test';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import {
  DataTable,
  DestructiveConfirm,
  DetailPanel,
  FormRow,
  FormSection,
  PropertyGrid,
  SplitForm,
  StatusTag,
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

interface Partner {
  key: string;
  name: string;
  status: string;
}

const samplePartners: Partner[] = [
  { key: '1', name: 'Acme Corp', status: 'active' },
  { key: '2', name: 'Globex', status: 'pending' },
];

test('DataTable renders toolbar slots, rows, and the row-actions column', async () => {
  const body = await renderSSR(
    h(DataTable<Partner>, {
      rowKey: 'key',
      dataSource: samplePartners,
      columns: [
        { key: 'name', dataIndex: 'name', title: 'Name' },
        { key: 'status', dataIndex: 'status', title: 'Status' },
      ],
      toolbar: {
        left: h('span', null, '2 partners'),
        center: h('input', { placeholder: 'Search' }),
        right: h('button', null, 'New partner'),
      },
      rowActions: (record) =>
        h('button', { 'data-key': record.key }, 'Edit'),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-data-table'));
  assert.ok(body.includes('facetheory-stitch-data-table-toolbar'));
  assert.ok(body.includes('2 partners'));
  assert.ok(body.includes('Search'));
  assert.ok(body.includes('New partner'));
  assert.ok(body.includes('Acme Corp'));
  assert.ok(body.includes('Globex'));
  assert.ok(body.includes('data-key="1"'));
  assert.ok(body.includes('data-key="2"'));
});

test('DataTable renders the empty state when dataSource is empty', async () => {
  const body = await renderSSR(
    h(DataTable<Partner>, {
      rowKey: 'key',
      dataSource: [],
      columns: [{ key: 'name', dataIndex: 'name', title: 'Name' }],
      emptyLabel: 'No partners yet',
    }),
  );
  assert.ok(body.includes('No partners yet'));
});

test('PropertyGrid renders key/value pairs and respects span="full"', async () => {
  const body = await renderSSR(
    h(PropertyGrid, {
      items: [
        { key: 'id', label: 'Tenant ID', value: 'acme-prod' },
        { key: 'created', label: 'Created', value: '2025-12-01' },
        {
          key: 'note',
          label: 'Notes',
          value: 'Full-width note that spans both columns',
          span: 'full',
        },
      ],
    }),
  );
  assert.ok(body.includes('facetheory-stitch-property-grid'));
  assert.ok(body.includes('Tenant ID'));
  assert.ok(body.includes('acme-prod'));
  assert.ok(body.includes('Full-width note'));
});

test('DetailPanel renders title, description, actions, and a PropertyGrid', async () => {
  const body = await renderSSR(
    h(DetailPanel, {
      title: 'Acme Corp',
      description: 'Tenant overview',
      actions: h('button', null, 'Edit'),
      properties: [
        { key: 'id', label: 'Tenant ID', value: 'acme-prod' },
        { key: 'plan', label: 'Plan', value: 'Enterprise' },
      ],
    }),
  );
  assert.ok(body.includes('facetheory-stitch-detail-panel'));
  assert.ok(body.includes('Acme Corp'));
  assert.ok(body.includes('Tenant overview'));
  assert.ok(body.includes('Enterprise'));
});

test('SplitForm + FormRow render label/description/control + error region', async () => {
  const body = await renderSSR(
    h(SplitForm, {
      children: [
        h(FormRow, {
          key: 'email',
          label: 'Email',
          description: 'The admin contact for this tenant',
          required: true,
          children: h('input', { type: 'email', name: 'email' }),
        }),
        h(FormRow, {
          key: 'slug',
          label: 'Slug',
          error: 'Slug is already taken',
          children: h('input', { type: 'text', name: 'slug' }),
        }),
      ],
    }),
  );
  assert.ok(body.includes('facetheory-stitch-split-form'));
  assert.ok(body.includes('facetheory-stitch-form-row'));
  assert.ok(body.includes('Email'));
  assert.ok(body.includes('The admin contact for this tenant'));
  assert.ok(body.includes('Slug is already taken'));
  assert.ok(body.includes('role="alert"'));
  assert.ok(body.includes('*'));
});

test('FormSection wraps FormRows with a heading and description', async () => {
  const body = await renderSSR(
    h(FormSection, {
      title: 'Authentication',
      description: 'Control how users sign in to this tenant',
      children: h(FormRow, {
        label: 'Allow passwords',
        children: h('input', { type: 'checkbox' }),
      }),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-form-section'));
  assert.ok(body.includes('Authentication'));
  assert.ok(body.includes('Allow passwords'));
});

test('StatusTag renders each variant with the correct class and default label', async () => {
  const variants = ['active', 'pending', 'suspended', 'archived', 'error'] as const;
  for (const variant of variants) {
    const body = await renderSSR(h(StatusTag, { variant }));
    assert.ok(body.includes(`facetheory-stitch-status-tag-${variant}`));
  }
});

test('StatusTag supports a custom label override', async () => {
  const body = await renderSSR(
    h(StatusTag, { variant: 'active', label: 'Active · 12 members' }),
  );
  assert.ok(body.includes('Active · 12 members'));
});

test('DestructiveConfirm renders title, description, and default button labels', async () => {
  const body = await renderSSR(
    h(DestructiveConfirm, {
      title: 'Delete partner?',
      description: 'This permanently removes Acme Corp and its members.',
    }),
  );
  assert.ok(body.includes('facetheory-stitch-destructive-confirm'));
  assert.ok(body.includes('Delete partner?'));
  assert.ok(body.includes('permanently removes Acme Corp'));
  assert.ok(body.includes('Cancel'));
  assert.ok(body.includes('Delete'));
});

test('DestructiveConfirm with requireText renders a guarded text input', async () => {
  const body = await renderSSR(
    h(DestructiveConfirm, {
      title: 'Delete tenant?',
      requireText: 'acme-prod',
    }),
  );
  // JSX escapes quotes to &quot; in HTML output.
  assert.ok(body.includes('Type &quot;acme-prod&quot; to confirm'));
});
