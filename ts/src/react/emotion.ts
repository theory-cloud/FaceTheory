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

  const stylesFromCache = (): FaceStyleTag[] => {
    if (!cache) return [];

    const ids: string[] = [];
    let cssText = '';
    for (const [id, css] of Object.entries(cache.inserted)) {
      if (!css || css === true) continue;
      ids.push(id);
      cssText += css;
    }

    if (!ids.length || !cssText) return [];

    return [
      {
        cssText,
        attrs: { 'data-emotion': `${cache.key} ${ids.join(' ')}` },
      },
    ];
  };

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

      // Buffered SSR: extract only what was used in the HTML.
      if (typeof out.html === 'string') {
        const chunks = server.extractCriticalToChunks(out.html);
        const styles: FaceStyleTag[] = chunks.styles.map((s) => ({
          cssText: s.css,
          attrs: { 'data-emotion': `${s.key} ${s.ids.join(' ')}` },
        }));

        if (!styles.length) return out;
        return { ...out, styleTags: [...(out.styleTags ?? []), ...styles] };
      }

      // Streaming SSR: extract from the cache after the shell is ready.
      const styles = stylesFromCache();
      if (!styles.length) return out;
      return { ...out, styleTags: [...(out.styleTags ?? []), ...styles] };
    },
  };
}
