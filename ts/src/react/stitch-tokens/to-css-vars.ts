import type { StitchTokenSet } from './types.js';

function kebab(value: string): string {
  return value.replace(/([A-Z])/g, '-$1').toLowerCase();
}

export interface StitchCssVarOptions {
  /** CSS variable prefix. Defaults to `--stitch`. */
  prefix?: string;
}

/**
 * Converts a Stitch token set into a flat CSS variable record. Variable names
 * follow the Material-inspired naming used in the Stitch design doc
 * (`--stitch-color-surface-container-low`, `--stitch-font-body`, ...).
 */
export function stitchToCssVars(
  tokens: StitchTokenSet,
  options: StitchCssVarOptions = {},
): Record<string, string> {
  const prefix = options.prefix ?? '--stitch';
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(tokens.palette)) {
    out[`${prefix}-color-${kebab(key)}`] = value;
  }

  out[`${prefix}-font-display`] = tokens.typography.displayFont;
  out[`${prefix}-font-body`] = tokens.typography.bodyFont;
  out[`${prefix}-font-label`] = tokens.typography.labelFont;

  out[`${prefix}-radius-sm`] = `${tokens.roundness.sm}px`;
  out[`${prefix}-radius-md`] = `${tokens.roundness.md}px`;
  out[`${prefix}-radius-lg`] = `${tokens.roundness.lg}px`;
  out[`${prefix}-radius-xl`] = `${tokens.roundness.xl}px`;

  out[`${prefix}-spacing-unit`] = `${tokens.spacing.baseUnit}px`;
  out[`${prefix}-mode`] = tokens.mode;

  return out;
}

/**
 * Serializes a CSS variable record as a `:root { ... }` block. Use this for
 * SSR style injection when spreading onto a React `style` prop is not an option.
 */
export function stitchCssVarsToRootBlock(vars: Record<string, string>): string {
  const lines = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `:root {\n${lines}\n}`;
}
