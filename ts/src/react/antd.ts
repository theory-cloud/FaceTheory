import * as React from 'react';
import { ConfigProvider } from 'antd';
import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs';

import type { FaceAttributes, FaceStyleTag, UIIntegration } from '../types.js';

type AntdConfigProviderProps = React.ComponentProps<typeof ConfigProvider>;
type AntdThemeConfig = NonNullable<AntdConfigProviderProps['theme']>;

interface AntdIntegrationState {
  cache: ReturnType<typeof createCache>;
}

export interface AntdIntegrationOptions {
  /**
   * Ant Design ConfigProvider `theme.hashed`. Default: `false` for deterministic SSR.
   */
  hashed?: boolean;

  /**
   * Base theme (commonly a static JSON theme like the PayTheory portal `light.json`).
   * Merged with `configProviderProps.theme` and then `themeOverride` (last wins).
   */
  baseTheme?: AntdThemeConfig;

  /**
   * Theme override (commonly tenant-specific theme overrides).
   * Merged last (highest precedence).
   */
  themeOverride?: AntdThemeConfig;

  /**
   * Locale passed to Ant Design ConfigProvider.
   */
  locale?: AntdConfigProviderProps['locale'];

  /**
   * Props passed to Ant Design ConfigProvider.
   *
   * Note: `theme.hashed` will be overridden by `hashed` if provided.
   */
  configProviderProps?: AntdConfigProviderProps;

  /**
   * Props passed to Ant Design StyleProvider.
   *
   * Note: `cache` is managed internally per request.
   */
  styleProviderProps?: Omit<React.ComponentProps<typeof StyleProvider>, 'cache'>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function mergeDeep<T>(base: T, override: unknown): T {
  if (override === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) return override as T;

  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] = mergeDeep(existing, value);
  }
  return out as T;
}

function mergeThemeConfig(
  base: AntdThemeConfig | undefined,
  theme: AntdThemeConfig | undefined,
  override: AntdThemeConfig | undefined,
): AntdThemeConfig | undefined {
  let out = base;
  if (theme !== undefined) out = out === undefined ? theme : mergeDeep(out, theme);
  if (override !== undefined) out = out === undefined ? override : mergeDeep(out, override);
  return out;
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
  return {
    name: 'antd',
    createState: () => ({ cache: createCache() }),
    wrapTree: (tree, _ctx, state) => {
      const antdState = state as AntdIntegrationState;
      const configProviderProps = options.configProviderProps ?? ({} as AntdConfigProviderProps);
      const { theme: _themeFromProps, locale: _localeFromProps, ...configProviderRest } = configProviderProps;

      const mergedThemeFromInputs = mergeThemeConfig(
        options.baseTheme,
        _themeFromProps,
        options.themeOverride,
      );

      const hashedFromTheme = isPlainObject(mergedThemeFromInputs)
        ? mergedThemeFromInputs['hashed']
        : undefined;

      const resolvedHashed =
        options.hashed ??
        (typeof hashedFromTheme === 'boolean' ? hashedFromTheme : undefined) ??
        false;

      const mergedTheme = isPlainObject(mergedThemeFromInputs)
        ? { ...mergedThemeFromInputs, hashed: resolvedHashed }
        : ({ hashed: resolvedHashed } as AntdThemeConfig);

      const locale = options.locale ?? _localeFromProps;

      const finalConfigProviderProps: AntdConfigProviderProps = {
        ...configProviderRest,
        theme: mergedTheme,
      };
      if (locale !== undefined) finalConfigProviderProps.locale = locale;

      return React.createElement(
        StyleProvider,
        { cache: antdState.cache, ...(options.styleProviderProps ?? {}) },
        React.createElement(
          ConfigProvider,
          finalConfigProviderProps,
          tree,
        ),
      );
    },
    finalize: (out, _ctx, state) => {
      const antdState = state as AntdIntegrationState;
      const extracted = extractStyle(antdState.cache);
      const styleTags = stylesFromExtractedHTML(String(extracted));
      if (!styleTags.length) return out;
      return { ...out, styleTags: [...(out.styleTags ?? []), ...styleTags] };
    },
  };
}
