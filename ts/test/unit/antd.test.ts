import assert from 'node:assert/strict';
import test from 'node:test';

import { Button, Menu, theme as antdTheme, Typography } from 'antd';
import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdIntegration } from '../../src/react/antd.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('antd integration: extracts SSR styles (and applies CSP nonce)', async () => {
  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: () =>
          React.createElement(
            'div',
            null,
            React.createElement(Typography.Title, { level: 2 }, 'Hello'),
            React.createElement(Button, { type: 'primary' }, 'OK'),
          ),
        renderOptions: {
          integrations: [createAntdIntegration({ hashed: false })],
        },
      }),
    ],
  });

  const resp = await app.handle({
    method: 'GET',
    path: '/',
    cspNonce: 'nonce-123',
  });

  const body = new TextDecoder().decode(resp.body as Uint8Array);
  assert.ok(body.includes('<h2'));
  assert.ok(body.includes('OK'));

  assert.ok(body.includes('<style'));
  assert.ok(body.includes('nonce="nonce-123"'));
});

test('antd integration: merges base theme + overrides (PayTheory theme pattern)', async () => {
  function TokenEcho() {
    const { token } = antdTheme.useToken();
    return React.createElement('pre', null, token.colorPrimary);
  }

  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: () => React.createElement(TokenEcho),
        renderOptions: {
          integrations: [
            createAntdIntegration({
              hashed: false,
              baseTheme: { token: { colorPrimary: '#010203' } } as any,
              themeOverride: { token: { colorPrimary: '#090807' } } as any,
            }),
          ],
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  const body = new TextDecoder().decode(resp.body as Uint8Array);
  assert.ok(body.includes('#090807'));
});

test('antd integration: shared instances stay isolated across overlapping renders', async () => {
  const sharedAntd = createAntdIntegration({ hashed: false });

  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: (ctx) => {
          const kind = String(ctx.request.query.kind?.[0] ?? 'button');
          if (kind === 'menu') {
            return React.createElement(MenuFixture);
          }
          return React.createElement(Button, { type: 'primary' }, 'Primary request');
        },
        renderOptions: {
          integrations: [
            sharedAntd,
            {
              name: 'slow-contribute-gate',
              contribute: async (ctx) => {
                const delayMs = Number(ctx.request.query.delay?.[0] ?? '0');
                if (delayMs > 0) await delay(delayMs);
                return {};
              },
            },
          ],
        },
      }),
    ],
  });

  const [respA, respB] = await Promise.all([
    app.handle({ method: 'GET', path: '/?kind=button&delay=40' }),
    app.handle({ method: 'GET', path: '/?kind=menu&delay=0' }),
  ]);

  const bodyA = new TextDecoder().decode(respA.body as Uint8Array);
  const bodyB = new TextDecoder().decode(respB.body as Uint8Array);

  assert.ok(bodyA.includes('Primary request'));
  assert.ok(!bodyA.includes('ant-menu'));
  assert.ok(bodyB.includes('ant-menu'));
  assert.ok(bodyB.includes('ant-menu-item-selected'));
});

function MenuFixture() {
  return React.createElement(Menu, {
    mode: 'inline',
    selectedKeys: ['dashboard'],
    items: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'payments', label: 'Payments' },
    ],
  });
}
