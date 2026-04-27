import assert from 'node:assert/strict';
import test from 'node:test';

import {
  stitchCssVarsToRootBlock as reactStitchCssVarsToRootBlock,
  stitchToCssVars as reactStitchToCssVars,
} from '../../src/react/stitch-tokens/index.js';
import {
  stitchCssVarsToRootBlock,
  stitchToCssVars,
  type StitchTokenSet,
} from '../../src/stitch-tokens/index.js';
import { stitchToAntdTheme } from '../../src/react/stitch-tokens/index.js';

const m3aFixture: StitchTokenSet = {
  mode: 'light',
  palette: {
    primary: '#1f108e',
    primaryContainer: '#3730a3',
    primaryFixed: '#e2dfff',
    primaryFixedDim: '#c3c0ff',
    onPrimary: '#ffffff',
    onPrimaryContainer: '#a9a7ff',
    onPrimaryFixed: '#0f0069',
    onPrimaryFixedVariant: '#3b35a7',
    inversePrimary: '#c3c0ff',
    surfaceTint: '#544fc0',

    secondary: '#515f74',
    secondaryContainer: '#d5e3fc',
    secondaryFixed: '#d5e3fc',
    secondaryFixedDim: '#b9c7df',
    onSecondary: '#ffffff',
    onSecondaryContainer: '#57657a',
    onSecondaryFixed: '#0d1c2e',
    onSecondaryFixedVariant: '#3a485b',

    tertiary: '#00332e',
    tertiaryContainer: '#004c45',
    tertiaryFixed: '#89f5e7',
    tertiaryFixedDim: '#6bd8cb',
    onTertiary: '#ffffff',
    onTertiaryContainer: '#52c1b4',
    onTertiaryFixed: '#00201d',
    onTertiaryFixedVariant: '#005049',

    background: '#faf8ff',
    surface: '#faf8ff',
    surfaceBright: '#faf8ff',
    surfaceDim: '#d2d9f4',
    surfaceContainerLowest: '#ffffff',
    surfaceContainerLow: '#f2f3ff',
    surfaceContainer: '#eaedff',
    surfaceContainerHigh: '#e2e7ff',
    surfaceContainerHighest: '#dae2fd',
    surfaceVariant: '#dae2fd',
    inverseSurface: '#283044',
    inverseOnSurface: '#eef0ff',
    onBackground: '#131b2e',
    onSurface: '#131b2e',
    onSurfaceVariant: '#464553',

    outline: '#777584',
    outlineVariant: '#c8c4d5',

    error: '#ba1a1a',
    errorContainer: '#ffdad6',
    onError: '#ffffff',
    onErrorContainer: '#93000a',
  },
  typography: {
    displayFont: 'Space Grotesk',
    bodyFont: 'Inter',
    labelFont: 'Inter',
  },
  roundness: {
    sm: 4,
    md: 6,
    lg: 12,
    xl: 16,
  },
  spacing: {
    baseUnit: 4,
  },
};

test('stitch-tokens: AntD theme binds primary palette', () => {
  const theme = stitchToAntdTheme(m3aFixture);
  assert.equal(theme.token?.colorPrimary, '#1f108e');
  assert.equal(theme.token?.colorPrimaryBg, '#3730a3');
  assert.equal(theme.token?.colorInfo, '#1f108e');
});

test('stitch-tokens: AntD theme uses tonal surfaces as the layout base', () => {
  const theme = stitchToAntdTheme(m3aFixture);
  assert.equal(theme.token?.colorBgLayout, '#faf8ff');
  assert.equal(theme.token?.colorBgContainer, '#ffffff');
  assert.equal(theme.token?.colorBgElevated, '#ffffff');
  assert.equal(theme.token?.colorBgSpotlight, '#e2e7ff');
});

test('stitch-tokens: AntD theme enforces Stitch "no dividers" rule', () => {
  const theme = stitchToAntdTheme(m3aFixture);
  assert.equal(theme.token?.colorSplit, 'transparent');
  assert.equal(theme.components?.Table?.borderColor, 'transparent');
  assert.equal(theme.components?.Table?.headerSplitColor, 'transparent');
  assert.equal(theme.components?.Card?.colorBorderSecondary, 'transparent');
});

test('stitch-tokens: AntD theme drops shadows from buttons per Stitch design MD', () => {
  const theme = stitchToAntdTheme(m3aFixture);
  assert.equal(theme.components?.Button?.primaryShadow, 'none');
  assert.equal(theme.components?.Button?.defaultShadow, 'none');
  assert.equal(theme.components?.Button?.dangerShadow, 'none');
});

test('stitch-tokens: AntD theme binds menu selection to primary fixed', () => {
  const theme = stitchToAntdTheme(m3aFixture);
  assert.equal(theme.components?.Menu?.itemSelectedBg, '#e2dfff');
  assert.equal(theme.components?.Menu?.itemSelectedColor, '#0f0069');
});

test('stitch-tokens: AntD theme uses body font for the base font family', () => {
  const theme = stitchToAntdTheme(m3aFixture);
  assert.match(theme.token?.fontFamily ?? '', /^Inter,/);
});

test('stitch-tokens: AntD theme opts out of hashed + wireframe', () => {
  const theme = stitchToAntdTheme(m3aFixture);
  assert.equal(theme.hashed, false);
  assert.equal(theme.token?.wireframe, false);
  assert.deepEqual(theme.cssVar, { key: 'stitch' });
});

test('stitch-tokens: CSS vars emit kebab-case color names under default prefix', () => {
  const vars = stitchToCssVars(m3aFixture);
  assert.equal(vars['--stitch-color-primary'], '#1f108e');
  assert.equal(vars['--stitch-color-primary-container'], '#3730a3');
  assert.equal(vars['--stitch-color-surface-container-low'], '#f2f3ff');
  assert.equal(vars['--stitch-color-on-primary-fixed-variant'], '#3b35a7');
});

test('stitch-tokens: CSS vars emit typography, radius, spacing, mode', () => {
  const vars = stitchToCssVars(m3aFixture);
  assert.equal(vars['--stitch-font-display'], 'Space Grotesk');
  assert.equal(vars['--stitch-font-body'], 'Inter');
  assert.equal(vars['--stitch-font-label'], 'Inter');
  assert.equal(vars['--stitch-radius-sm'], '4px');
  assert.equal(vars['--stitch-radius-md'], '6px');
  assert.equal(vars['--stitch-radius-lg'], '12px');
  assert.equal(vars['--stitch-radius-xl'], '16px');
  assert.equal(vars['--stitch-spacing-unit'], '4px');
  assert.equal(vars['--stitch-mode'], 'light');
});

test('stitch-tokens: CSS vars honor custom prefix', () => {
  const vars = stitchToCssVars(m3aFixture, { prefix: '--autheory' });
  assert.equal(vars['--autheory-color-primary'], '#1f108e');
  assert.ok(!('--stitch-color-primary' in vars));
});

test('stitch-tokens: stitchCssVarsToRootBlock renders a valid :root block', () => {
  const block = stitchCssVarsToRootBlock({
    '--stitch-color-primary': '#1f108e',
    '--stitch-radius-md': '6px',
  });
  assert.match(block, /^:root {\n/);
  assert.match(block, /\n {2}--stitch-color-primary: #1f108e;\n/);
  assert.match(block, /\n {2}--stitch-radius-md: 6px;\n/);
  assert.match(block, /}\n?$/);
});

test('stitch-tokens: stitchCssVarsToRootBlock escapes style terminators', () => {
  const block = stitchCssVarsToRootBlock({
    '--stitch-color-primary': 'red;</style><script>alert(1)</script>',
    '--stitch-surface': '</STYLE><script>alert(2)</script>',
  });

  assert.equal(block.includes('</style>'), false);
  assert.equal(block.includes('</STYLE>'), false);
  assert.ok(block.includes('<\\/style><script>alert(1)</script>'));
  assert.ok(block.includes('<\\/style><script>alert(2)</script>'));
});

test('stitch-tokens: React subpath re-exports the shared token helpers', () => {
  const vars = stitchToCssVars(m3aFixture);
  assert.deepEqual(reactStitchToCssVars(m3aFixture), vars);

  const block = stitchCssVarsToRootBlock(vars);
  assert.equal(reactStitchCssVarsToRootBlock(vars), block);
});

test('stitch-tokens: surface dimension is optional and omitted by default', () => {
  const vars = stitchToCssVars(m3aFixture);
  assert.ok(!('--stitch-surface' in vars));
});

test('stitch-tokens: surface dimension emits --stitch-surface when set', () => {
  const vars = stitchToCssVars({ ...m3aFixture, surface: 'auth' });
  assert.equal(vars['--stitch-surface'], 'auth');
});

test('stitch-tokens: surface dimension honors custom prefix', () => {
  const vars = stitchToCssVars(
    { ...m3aFixture, surface: 'core' },
    { prefix: '--tc' },
  );
  assert.equal(vars['--tc-surface'], 'core');
  assert.ok(!('--stitch-surface' in vars));
});

test('stitch-tokens: surface dimension accepts free-form strings (no enum)', () => {
  // FaceTheory ships no enumerated vocabulary — consumers pick the string.
  const vars = stitchToCssVars({ ...m3aFixture, surface: 'my-custom-name' });
  assert.equal(vars['--stitch-surface'], 'my-custom-name');
});

test('stitch-tokens: additionalPrefixes emits tokens under extra prefixes', () => {
  const vars = stitchToCssVars(m3aFixture, {
    prefix: '--tc',
    additionalPrefixes: ['--stitch'],
  });
  // Primary (branded) prefix emits all tokens.
  assert.equal(vars['--tc-color-primary'], '#1f108e');
  assert.equal(vars['--tc-font-body'], 'Inter');
  assert.equal(vars['--tc-radius-md'], '6px');
  // Additional (default) prefix emits a parallel set so built-in components
  // still resolve via their hard-coded var(--stitch-*, ...) fallbacks.
  assert.equal(vars['--stitch-color-primary'], '#1f108e');
  assert.equal(vars['--stitch-font-body'], 'Inter');
  assert.equal(vars['--stitch-radius-md'], '6px');
});

test('stitch-tokens: additionalPrefixes deduplicates when overlapping with primary', () => {
  const vars = stitchToCssVars(m3aFixture, {
    prefix: '--stitch',
    additionalPrefixes: ['--stitch', '--tc'],
  });
  // Primary is emitted once even when repeated in additionalPrefixes.
  assert.equal(vars['--stitch-color-primary'], '#1f108e');
  assert.equal(vars['--tc-color-primary'], '#1f108e');
});

test('stitch-tokens: additionalPrefixes carries through surface and typography', () => {
  const vars = stitchToCssVars(
    { ...m3aFixture, surface: 'auth' },
    { prefix: '--tc', additionalPrefixes: ['--stitch'] },
  );
  assert.equal(vars['--tc-surface'], 'auth');
  assert.equal(vars['--stitch-surface'], 'auth');
  assert.equal(vars['--tc-font-display'], 'Space Grotesk');
  assert.equal(vars['--stitch-font-display'], 'Space Grotesk');
});

test('stitch-tokens: built-in stitch-shell components read default --stitch- prefix', () => {
  // Guardrail: dual-prefix emission must include --stitch-* so the
  // built-in stitch-shell components keep resolving via their hard-coded
  // var(--stitch-*, fallback) declarations. Regression guard.
  const vars = stitchToCssVars(m3aFixture, {
    prefix: '--tc',
    additionalPrefixes: ['--stitch'],
  });
  const keys = Object.keys(vars);
  assert.ok(keys.some((k) => k.startsWith('--stitch-color-')));
  assert.ok(keys.some((k) => k.startsWith('--stitch-radius-')));
  assert.ok(keys.some((k) => k.startsWith('--stitch-font-')));
});
