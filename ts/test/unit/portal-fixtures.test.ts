import assert from 'node:assert/strict';
import test from 'node:test';

import { css, jsx, ThemeProvider as EmotionThemeProvider, useTheme } from '@emotion/react';
import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs';
import { Button, ConfigProvider, Flex, Layout, Menu, Typography, theme as antdTheme } from 'antd';
import { JSDOM } from 'jsdom';
import * as React from 'react';
import { hydrateRoot } from 'react-dom/client';
import * as ReactDOMServer from 'react-dom/server';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdEmotionTokenIntegration } from '../../src/react/antd-emotion.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import { createEmotionIntegration } from '../../src/react/emotion.js';

function AntdTokenBridge({ children }: { children: React.ReactNode }) {
  const { token } = antdTheme.useToken();
  return React.createElement(EmotionThemeProvider, { theme: token as any, children });
}

function Title({ children }: { children: React.ReactNode }) {
  return React.createElement(Typography.Title, { level: 2 }, children);
}

function AccentBadge({ text }: { text: string }) {
  const theme = useTheme() as { colorPrimary: string };
  return jsx(
    'span',
    {
      css: css`
        color: ${theme.colorPrimary};
        font-weight: 600;
      `,
    },
    text,
  );
}

function ScreenHeaderFixture() {
  return React.createElement(
    Flex,
    { justify: 'space-between', align: 'center' },
    React.createElement(
      'div',
      null,
      React.createElement(Title, null, 'Dashboard'),
      React.createElement(Typography.Text, { type: 'secondary' }, 'Welcome back'),
      React.createElement(AccentBadge, { text: 'PayTheory' }),
    ),
    React.createElement(Button, { type: 'primary' }, 'Action'),
  );
}

function NavigationMenuFixture() {
  return React.createElement(Menu, {
    mode: 'inline',
    selectedKeys: ['dashboard'],
    items: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'payments', label: 'Payments' },
      { key: 'settings', label: 'Settings' },
    ],
  });
}

function PortalContent() {
  return React.createElement(
    Layout,
    { hasSider: true },
    React.createElement(
      Layout.Sider,
      { width: 220 },
      React.createElement(NavigationMenuFixture),
    ),
    React.createElement(
      Layout.Content,
      { style: { padding: 16 } },
      React.createElement(ScreenHeaderFixture),
    ),
  );
}

function HydrationContent() {
  return React.createElement(
    'div',
    null,
    React.createElement(Button, { type: 'primary' }, 'Hydrate'),
    React.createElement(AccentBadge, { text: 'PayTheory' }),
  );
}

function ClientProviders({ children }: { children: React.ReactNode }) {
  const cache = React.useMemo(() => createCache(), []);
  return React.createElement(
    StyleProvider,
    { cache },
    React.createElement(
      ConfigProvider,
      { theme: { hashed: false } },
      React.createElement(AntdTokenBridge, null, children),
    ),
  );
}

test('portal fixture harness: SSR renders portal-like components with AntD + Emotion styles', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error('unexpected fetch during SSR fixture');
  }) as any;

  try {
    const app = createFaceApp({
      faces: [
        createReactFace({
          route: '/',
          mode: 'ssr',
          render: () =>
            React.createElement(
              'div',
              { id: 'root' },
              React.createElement(PortalContent),
            ),
          renderOptions: {
            integrations: [
              createAntdEmotionTokenIntegration(),
              createAntdIntegration({ hashed: false }),
              createEmotionIntegration(),
            ],
          },
        }),
      ],
    });

    const resp = await app.handle({
      method: 'GET',
      path: '/',
      cspNonce: 'nonce-portal',
    });

    const body = new TextDecoder().decode(resp.body as Uint8Array);
    assert.ok(body.includes('Dashboard'));
    assert.ok(body.includes('PayTheory'));

    // Emotion style tag marker.
    assert.ok(body.includes('data-emotion='));
    // Ant Design cssinjs markers.
    assert.ok(body.includes('data-rc-order=') || body.includes('data-rc-priority='));
    // CSP nonce applied to style tags.
    assert.ok(body.includes('nonce="nonce-portal"'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('portal fixture harness: hydrates without React mismatch warnings', async () => {
  const cache = createCache();

  const ssrTree = React.createElement(
    StyleProvider,
    { cache },
    React.createElement(
      ConfigProvider,
      { theme: { hashed: false } },
      React.createElement(
        'div',
        { id: 'root' },
        React.createElement(AntdTokenBridge, null, React.createElement(HydrationContent)),
      ),
    ),
  );

  const bodyHtml = ReactDOMServer.renderToString(ssrTree);
  const styles = String(extractStyle(cache));
  const doc = `<!doctype html><html><head>${styles}</head><body>${bodyHtml}</body></html>`;

  const dom = new JSDOM(doc, { url: 'http://localhost/' });

  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevResizeObserver = (globalThis as any).ResizeObserver;

  // Minimal DOM shims for Ant Design/React in jsdom.
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

  // Attach jsdom globals.
  (globalThis as any).window = dom.window as any;
  (globalThis as any).document = dom.window.document as any;

  const errors: unknown[] = [];
  const originalConsoleError = console.error;
  const originalWindowConsoleError = dom.window.console.error;
  const originalWindowConsoleWarn = dom.window.console.warn;

  console.error = (...args: unknown[]) => errors.push(args);
  dom.window.console.error = (...args: unknown[]) => errors.push(args);
  dom.window.console.warn = (...args: unknown[]) => errors.push(args);

  try {
    const container = dom.window.document.getElementById('root');
    assert.ok(container);

    const root = hydrateRoot(
      container!,
      React.createElement(
        ClientProviders,
        null,
        React.createElement(HydrationContent),
      ),
    );

    // Allow effects/microtasks to run.
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(errors.length, 0);
    root.unmount();
    await new Promise((r) => setTimeout(r, 0));
  } finally {
    console.error = originalConsoleError;
    dom.window.console.error = originalWindowConsoleError;
    dom.window.console.warn = originalWindowConsoleWarn;
    dom.window.close();
    (globalThis as any).window = prevWindow;
    (globalThis as any).document = prevDocument;
    (globalThis as any).ResizeObserver = prevResizeObserver;
  }
});
