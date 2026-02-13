import assert from 'node:assert/strict';
import test from 'node:test';

import { css, jsx, useTheme } from '@emotion/react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createEmotionIntegration } from '../../src/react/emotion.js';

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

