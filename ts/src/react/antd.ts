import * as React from 'react';
import { ConfigProvider } from 'antd';
import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs';

import type { FaceAttributes, FaceStyleTag, UIIntegration } from '../types.js';

export interface AntdIntegrationOptions {
  /**
   * Ant Design ConfigProvider `theme.hashed`. Default: `false` for deterministic SSR.
   */
  hashed?: boolean;

  /**
   * Props passed to Ant Design ConfigProvider.
   *
   * Note: `theme.hashed` will be overridden by `hashed` if provided.
   */
  configProviderProps?: React.ComponentProps<typeof ConfigProvider>;

  /**
   * Props passed to Ant Design StyleProvider.
   *
   * Note: `cache` is managed internally per request.
   */
  styleProviderProps?: Omit<React.ComponentProps<typeof StyleProvider>, 'cache'>;
}

function parseAttributes(input: string): FaceAttributes {
  const out: FaceAttributes = {};
  const re = /([^\s=]+)(?:="([^"]*)")?/g;
  for (;;) {
    const m = re.exec(input);
    if (!m) break;
    const name = m[1];
    if (!name) continue;
    if (m[2] === undefined) out[name] = true;
    else out[name] = m[2];
  }
  return out;
}

function stylesFromExtractedHTML(extracted: string): FaceStyleTag[] {
  if (!extracted.includes('<style')) {
    return extracted.trim() ? [{ cssText: extracted }] : [];
  }

  const tags: FaceStyleTag[] = [];
  const re = /<style([^>]*)>([\s\S]*?)<\/style>/g;
  for (;;) {
    const m = re.exec(extracted);
    if (!m) break;
    const attrsRaw = m[1] ?? '';
    const cssText = m[2] ?? '';
    const attrs = parseAttributes(attrsRaw);
    tags.push(Object.keys(attrs).length ? { cssText, attrs } : { cssText });
  }
  return tags;
}

export function createAntdIntegration(
  options: AntdIntegrationOptions = {},
): UIIntegration<React.ReactElement> {
  const hashed = options.hashed ?? false;
  let cache: ReturnType<typeof createCache> | null = null;

  return {
    name: 'antd',
    wrapTree: (tree) => {
      cache = createCache();

      const theme = options.configProviderProps?.theme ?? {};
      const mergedTheme = { ...theme, hashed };

      return React.createElement(
        StyleProvider,
        { cache, ...(options.styleProviderProps ?? {}) },
        React.createElement(
          ConfigProvider,
          { ...(options.configProviderProps ?? {}), theme: mergedTheme },
          tree,
        ),
      );
    },
    finalize: (out) => {
      if (!cache) return out;
      const extracted = extractStyle(cache);
      const styleTags = stylesFromExtractedHTML(String(extracted));
      if (!styleTags.length) return out;
      return { ...out, styleTags: [...(out.styleTags ?? []), ...styleTags] };
    },
  };
}

