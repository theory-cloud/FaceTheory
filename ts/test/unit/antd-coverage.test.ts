import assert from 'node:assert/strict';
import test from 'node:test';

import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs';
import { Button, ConfigProvider, DatePicker, Drawer, Flex, Form, Input, Layout, Menu, Modal, Select, Table, Tag, Typography, Upload } from 'antd';
import { JSDOM } from 'jsdom';
import * as React from 'react';
import { hydrateRoot } from 'react-dom/client';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdIntegration } from '../../src/react/antd.js';

function CoveragePage() {
  return React.createElement(
    Layout,
    { hasSider: true },
    React.createElement(
      Layout.Sider,
      { width: 220 },
      React.createElement(Menu, {
        mode: 'inline',
        selectedKeys: ['dashboard'],
        items: [
          { key: 'dashboard', label: 'Dashboard' },
          { key: 'payments', label: 'Payments' },
        ],
      }),
    ),
    React.createElement(
      Layout.Content,
      { style: { padding: 16 } },
      React.createElement(Typography.Title, { level: 2 }, 'AntD Coverage'),
      React.createElement(
        Flex,
        { gap: 8, wrap: true },
        React.createElement(Button, { type: 'primary' }, 'Primary'),
        React.createElement(Tag, { color: 'blue' }, 'Tag'),
      ),
      React.createElement(
        Form,
        { layout: 'vertical', initialValues: { name: 'Alice', type: 'a' } },
        React.createElement(
          Form.Item,
          { label: 'Name', name: 'name' },
          React.createElement(Input, { placeholder: 'Name' }),
        ),
        React.createElement(
          Form.Item,
          { label: 'Type', name: 'type' },
          React.createElement(Select, {
            options: [
              { label: 'A', value: 'a' },
              { label: 'B', value: 'b' },
            ],
          }),
        ),
        React.createElement(
          Form.Item,
          { label: 'Date', name: 'date' },
          React.createElement(DatePicker, { placeholder: 'Pick date' }),
        ),
      ),
      React.createElement(
        Upload,
        { showUploadList: false, beforeUpload: () => false as any },
        React.createElement(Button, null, 'Upload'),
      ),
      React.createElement(Table, {
        pagination: false,
        columns: [
          { title: 'Name', dataIndex: 'name' },
          { title: 'Amount', dataIndex: 'amount', align: 'right' },
        ],
        dataSource: [
          { key: '1', name: 'Alice', amount: 123 },
          { key: '2', name: 'Bob', amount: 456 },
        ],
      }),
      // Render these closed to avoid portals, but still cover component styles.
      React.createElement(Drawer, { open: false, title: 'Drawer' }, 'drawer'),
      React.createElement(Modal, { open: false, title: 'Modal' }, 'modal'),
    ),
  );
}

function HydrationPage() {
  return React.createElement(
    'div',
    null,
    React.createElement(Typography.Text, null, 'AntD Hydration'),
    React.createElement(Button, { type: 'primary' }, 'Primary'),
    React.createElement(Tag, { color: 'blue' }, 'Tag'),
    React.createElement(Input, { defaultValue: 'Alice' }),
  );
}

test('antd coverage: SSR renders representative components with styles in head', async () => {
  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: () =>
          React.createElement(
            'div',
            { id: 'root' },
            React.createElement(CoveragePage),
          ),
        renderOptions: {
          integrations: [createAntdIntegration({ hashed: false })],
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/', cspNonce: 'nonce-antd' });
  const body = new TextDecoder().decode(resp.body as Uint8Array);

  assert.ok(body.includes('AntD Coverage'));
  assert.ok(body.includes('<form'));
  assert.ok(body.includes('Primary'));

  // Ant Design cssinjs markers + CSP nonce.
  assert.ok(body.includes('data-rc-order=') || body.includes('data-rc-priority='));
  assert.ok(body.includes('nonce="nonce-antd"'));

  // Ensure styles are emitted in <head> before body content.
  const idxStyle = body.indexOf('<style');
  const idxRoot = body.indexOf('<div id="root"');
  assert.ok(idxStyle >= 0 && idxRoot >= 0 && idxStyle < idxRoot);
});

test('antd coverage: hydrates without className mismatch warnings', async () => {
  const cache = createCache();

  const ssrTree = React.createElement(
    StyleProvider,
    { cache },
    React.createElement(
      ConfigProvider,
      { theme: { hashed: false } },
      React.createElement('div', { id: 'root' }, React.createElement(HydrationPage)),
    ),
  );

  const bodyHtml = (await import('react-dom/server')).renderToString(ssrTree);
  const styles = String(extractStyle(cache));
  const doc = `<!doctype html><html><head>${styles}</head><body>${bodyHtml}</body></html>`;

  const dom = new JSDOM(doc, { url: 'http://localhost/' });

  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevResizeObserver = (globalThis as any).ResizeObserver;

  (dom.window as any).matchMedia =
    (dom.window as any).matchMedia ??
    (() => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  (globalThis as any).ResizeObserver =
    (globalThis as any).ResizeObserver ??
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  (dom.window as any).ResizeObserver = (globalThis as any).ResizeObserver;

  (dom.window as any).requestAnimationFrame =
    (dom.window as any).requestAnimationFrame ?? ((cb: () => void) => setTimeout(cb, 0));
  (dom.window as any).cancelAnimationFrame =
    (dom.window as any).cancelAnimationFrame ?? ((id: ReturnType<typeof setTimeout>) => clearTimeout(id));

  (globalThis as any).window = dom.window as any;
  (globalThis as any).document = dom.window.document as any;

  const errors: unknown[] = [];
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalWindowConsoleError = dom.window.console.error;
  const originalWindowConsoleWarn = dom.window.console.warn;

  console.error = (...args: unknown[]) => errors.push(args);
  console.warn = (...args: unknown[]) => errors.push(args);
  dom.window.console.error = (...args: unknown[]) => errors.push(args);
  dom.window.console.warn = (...args: unknown[]) => errors.push(args);

  try {
    const container = dom.window.document.getElementById('root');
    assert.ok(container);

    const clientTree = React.createElement(
      StyleProvider,
      { cache: createCache() },
      React.createElement(
        ConfigProvider,
        { theme: { hashed: false } },
        React.createElement(HydrationPage),
      ),
    );

    const root = hydrateRoot(container!, clientTree);
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(errors.length, 0);
    root.unmount();
    await new Promise((r) => setTimeout(r, 0));
  } finally {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    dom.window.console.error = originalWindowConsoleError;
    dom.window.console.warn = originalWindowConsoleWarn;
    dom.window.close();
    (globalThis as any).window = prevWindow;
    (globalThis as any).document = prevDocument;
    (globalThis as any).ResizeObserver = prevResizeObserver;
  }
});
