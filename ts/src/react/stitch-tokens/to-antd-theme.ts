import type { ThemeConfig } from 'antd';

import type { StitchTokenSet } from './types.js';

/**
 * Converts a Stitch token set into an Ant Design `ThemeConfig`.
 *
 * The resulting theme honors the Stitch "tonal architecture" rules: surfaces
 * layer via `surface-container-*` rather than borders, tables use transparent
 * dividers with alternating surface rows, and primary actions bind to the
 * tonal brand palette. Callers merge tenant overrides on top via
 * `createAntdIntegration({ baseTheme, themeOverride })`.
 */
export function stitchToAntdTheme(tokens: StitchTokenSet): ThemeConfig {
  const { palette, typography, roundness } = tokens;

  return {
    cssVar: { key: 'stitch' },
    hashed: false,
    token: {
      colorPrimary: palette.primary,
      colorPrimaryBg: palette.primaryContainer,
      colorPrimaryBgHover: palette.primaryFixed,
      colorInfo: palette.primary,

      colorSuccess: palette.tertiary,
      colorError: palette.error,
      colorErrorBg: palette.errorContainer,

      colorBgBase: palette.surface,
      colorBgLayout: palette.background,
      colorBgContainer: palette.surfaceContainerLowest,
      colorBgElevated: palette.surfaceContainerLowest,
      colorBgSpotlight: palette.surfaceContainerHigh,

      colorText: palette.onSurface,
      colorTextBase: palette.onSurface,
      colorTextSecondary: palette.onSurfaceVariant,
      colorTextPlaceholder: palette.onSurfaceVariant,

      colorBorder: palette.outlineVariant,
      colorBorderSecondary: palette.outlineVariant,
      colorSplit: 'transparent',

      fontFamily: `${typography.bodyFont}, system-ui, -apple-system, 'Segoe UI', sans-serif`,
      fontFamilyCode: 'ui-monospace, SFMono-Regular, Menlo, monospace',

      borderRadiusXS: roundness.sm,
      borderRadiusSM: roundness.sm,
      borderRadius: roundness.md,
      borderRadiusLG: roundness.lg,
      borderRadiusOuter: roundness.lg,

      wireframe: false,
    },
    components: {
      Button: {
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
      },
      Card: {
        borderRadiusLG: roundness.xl,
        headerBg: palette.surfaceContainerLowest,
        colorBorderSecondary: 'transparent',
      },
      Table: {
        headerBg: palette.surfaceContainer,
        headerColor: palette.onSurfaceVariant,
        headerSplitColor: 'transparent',
        rowHoverBg: palette.surfaceContainerLow,
        borderColor: 'transparent',
      },
      Menu: {
        itemBg: 'transparent',
        itemHoverBg: palette.surfaceContainerLow,
        itemSelectedBg: palette.primaryFixed,
        itemSelectedColor: palette.onPrimaryFixed,
        subMenuItemBg: 'transparent',
      },
      Layout: {
        bodyBg: palette.background,
        headerBg: palette.surface,
        siderBg: palette.surfaceContainerLow,
        footerBg: palette.surface,
      },
      Input: {
        activeBorderColor: palette.primary,
        hoverBorderColor: palette.primary,
      },
      Select: {
        activeBorderColor: palette.primary,
        hoverBorderColor: palette.primary,
      },
      Tabs: {
        inkBarColor: palette.primary,
        itemActiveColor: palette.primary,
        itemSelectedColor: palette.primary,
        itemHoverColor: palette.primary,
        cardBg: palette.surfaceContainerLow,
      },
      Modal: {
        contentBg: palette.surfaceContainerLowest,
        headerBg: palette.surfaceContainerLowest,
        footerBg: palette.surfaceContainerLowest,
      },
      Drawer: {
        colorBgElevated: palette.surfaceContainerLowest,
      },
      Tooltip: {
        colorBgSpotlight: palette.inverseSurface,
        colorTextLightSolid: palette.inverseOnSurface,
      },
    },
  };
}
