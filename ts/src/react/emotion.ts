import * as React from 'react';

import createCache from '@emotion/cache';
import { CacheProvider, ThemeProvider as EmotionThemeProvider, type Theme } from '@emotion/react';
import createEmotionServer from '@emotion/server/create-instance';

import type { FaceStyleTag, UIIntegration } from '../types.js';

export interface EmotionIntegrationOptions {
  cacheKey?: string;
  theme?: unknown;
}

interface EmotionIntegrationState {
  cache: ReturnType<typeof createCache>;
  server: ReturnType<typeof createEmotionServer>;
}

function stylesFromCache(state: EmotionIntegrationState): FaceStyleTag[] {
  const ids: string[] = [];
  let cssText = '';
  for (const [id, css] of Object.entries(state.cache.inserted)) {
    if (!css || css === true) continue;
    ids.push(id);
    cssText += css;
  }

  if (!ids.length || !cssText) return [];

  return [
    {
      cssText,
      attrs: { 'data-emotion': `${state.cache.key} ${ids.join(' ')}` },
    },
  ];
}

export function createEmotionIntegration(
  options: EmotionIntegrationOptions = {},
): UIIntegration<React.ReactElement> {
  const cacheKey = options.cacheKey ?? 'css';

  return {
    name: 'emotion',
    createState: () => {
      const cache = createCache({ key: cacheKey });
      return {
        cache,
        server: createEmotionServer(cache),
      };
    },
    wrapTree: (tree, _ctx, state) => {
      const emotionState = state as EmotionIntegrationState;
      const withCache = React.createElement(
        CacheProvider,
        { value: emotionState.cache },
        tree,
      );
      return options.theme === undefined
        ? withCache
        : React.createElement(
            EmotionThemeProvider,
            { theme: options.theme as unknown as Theme, children: withCache },
          );
    },
    finalize: (out, _ctx, state) => {
      const emotionState = state as EmotionIntegrationState;
      // Buffered SSR: extract only what was used in the HTML.
      if (typeof out.html === 'string') {
        const chunks = emotionState.server.extractCriticalToChunks(out.html);
        const styles: FaceStyleTag[] = chunks.styles.map((s) => ({
          cssText: s.css,
          attrs: { 'data-emotion': `${s.key} ${s.ids.join(' ')}` },
        }));

        if (!styles.length) return out;
        return { ...out, styleTags: [...(out.styleTags ?? []), ...styles] };
      }

      // Streaming SSR: extract from the cache after the shell is ready.
      const styles = stylesFromCache(emotionState);
      if (!styles.length) return out;
      return { ...out, styleTags: [...(out.styleTags ?? []), ...styles] };
    },
  };
}
