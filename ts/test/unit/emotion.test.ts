import assert from 'node:assert/strict';
import test from 'node:test';

import { css, jsx, useTheme } from '@emotion/react';
import { Typography } from 'antd';
import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdEmotionTokenIntegration } from '../../src/react/antd-emotion.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import { createEmotionIntegration } from '../../src/react/emotion.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ThemedBox() {
  const theme = useTheme() as { color: string };
  return jsx('div', { css: css`color: ${theme.color};` }, 'Hello');
}

test('emotion integration: extracts SSR styles and preserves theme values', async () => {
  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: () => jsx(ThemedBox, {}),
        renderOptions: {
          integrations: [createEmotionIntegration({ theme: { color: 'rgb(1, 2, 3)' } })],
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/', cspNonce: 'nonce-xyz' });
  const body = new TextDecoder().decode(resp.body as Uint8Array);

  assert.ok(body.includes('Hello'));
  assert.ok(body.includes('data-emotion='));
  assert.ok(body.includes('nonce="nonce-xyz"'));
  assert.ok(body.includes('rgb(1, 2, 3)'));
});

test('emotion integration: can consume Ant Design tokens (portal pattern)', async () => {
  function PrimaryBox() {
    const theme = useTheme() as { colorPrimary: string };
    return jsx(
      'div',
      { css: css`color: ${theme.colorPrimary};` },
      theme.colorPrimary,
    );
  }

  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: () =>
          React.createElement(
            'div',
            null,
            React.createElement(Typography.Text, null, 'AntD'),
            jsx(PrimaryBox, {}),
          ),
        renderOptions: {
          integrations: [
            createAntdEmotionTokenIntegration(),
            createAntdIntegration({
              hashed: false,
              baseTheme: { token: { colorPrimary: '#010203' } } as any,
            }),
            createEmotionIntegration(),
          ],
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/', cspNonce: 'nonce-bridge' });
  const body = new TextDecoder().decode(resp.body as Uint8Array);

  assert.ok(body.includes('AntD'));
  assert.ok(body.includes('#010203'));
  assert.ok(body.includes('data-emotion='));
  assert.ok(body.includes('nonce="nonce-bridge"'));
  assert.ok(body.includes('#010203'));
});

test('emotion integration: shared instances stay isolated across overlapping renders', async () => {
  const sharedEmotion = createEmotionIntegration();

  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: (ctx) => {
          const color = String(ctx.request.query.color?.[0] ?? 'rgb(0, 0, 0)');
          return jsx(
            'div',
            { css: css`color: ${color};` },
            color,
          );
        },
        renderOptions: {
          integrations: [
            sharedEmotion,
            {
              name: 'slow-contribute-gate',
              contribute: async () => {
                await delay(20);
                return {};
              },
            },
          ],
        },
      }),
    ],
  });

  const colorA = 'rgb(1, 2, 3)';
  const colorB = 'rgb(9, 8, 7)';

  const [respA, respB] = await Promise.all([
    app.handle({ method: 'GET', path: '/?color=rgb(1,%202,%203)' }),
    app.handle({ method: 'GET', path: '/?color=rgb(9,%208,%207)' }),
  ]);

  const bodyA = new TextDecoder().decode(respA.body as Uint8Array);
  const bodyB = new TextDecoder().decode(respB.body as Uint8Array);

  assert.ok(bodyA.includes(colorA));
  assert.ok(!bodyA.includes(colorB));
  assert.ok(bodyB.includes(colorB));
  assert.ok(!bodyB.includes(colorA));
});
