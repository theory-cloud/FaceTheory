import * as React from 'react';

import createCache from '@emotion/cache';
import { CacheProvider, ThemeProvider as EmotionThemeProvider } from '@emotion/react';
import createEmotionServer from '@emotion/server/create-instance';

import type { FaceStyleTag, UIIntegration } from '../types.js';

export interface EmotionIntegrationOptions {
  cacheKey?: string;
  theme?: unknown;
}

export function createEmotionIntegration(
  options: EmotionIntegrationOptions = {},
): UIIntegration<React.ReactElement> {
  const cacheKey = options.cacheKey ?? 'css';

  let cache: ReturnType<typeof createCache> | null = null;
  let server: ReturnType<typeof createEmotionServer> | null = null;

  return {
    name: 'emotion',
    wrapTree: (tree) => {
      cache = createCache({ key: cacheKey });
      server = createEmotionServer(cache);

      const withCache = React.createElement(CacheProvider, { value: cache }, tree);
      return options.theme === undefined
        ? withCache
        : React.createElement(
            EmotionThemeProvider,
            { theme: options.theme as any, children: withCache },
          );
    },
    finalize: (out) => {
      if (!cache || !server) return out;
      if (typeof out.html !== 'string') return out;

      const chunks = server.extractCriticalToChunks(out.html);
      const styles: FaceStyleTag[] = chunks.styles.map((s) => ({
        cssText: s.css,
        attrs: { 'data-emotion': `${s.key} ${s.ids.join(' ')}` },
      }));

      if (!styles.length) return out;
      return { ...out, styleTags: [...(out.styleTags ?? []), ...styles] };
    },
  };
}
