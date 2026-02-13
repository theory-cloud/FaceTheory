import assert from 'node:assert/strict';
import test from 'node:test';

import { Button, theme as antdTheme, Typography } from 'antd';
import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdIntegration } from '../../src/react/antd.js';

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
