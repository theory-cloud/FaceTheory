import * as React from 'react';

import { ThemeProvider as EmotionThemeProvider } from '@emotion/react';
import { theme as antdTheme } from 'antd';

import type { UIIntegration } from '../types.js';

function AntdTokenEmotionBridge({ children }: { children: React.ReactNode }) {
  const { token } = antdTheme.useToken();
  return React.createElement(EmotionThemeProvider, { theme: token as any, children });
}

/**
 * Bridges Ant Design `theme.useToken()` tokens into Emotion's ThemeProvider.
 *
 * Note: this integration must be applied *before* `createAntdIntegration()` so
 * the bridge component renders inside AntD's ConfigProvider.
 */
export function createAntdEmotionTokenIntegration(): UIIntegration<React.ReactElement> {
  return {
    name: 'antd-emotion-token-bridge',
    wrapTree: (tree) => React.createElement(AntdTokenEmotionBridge, null, tree),
  };
}

