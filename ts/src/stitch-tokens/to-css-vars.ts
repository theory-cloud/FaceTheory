import type { StitchTokenSet } from './types.js';

function kebab(value: string): string {
  return value.replace(/([A-Z])/g, '-$1').toLowerCase();
}

export interface StitchCssVarOptions {
  /** CSS variable prefix. Defaults to `--stitch`. */
  prefix?: string;
  /**
   * Additional CSS variable prefixes to emit alongside `prefix`. Each entry
   * produces a full copy of the token variables under that prefix.
   *
   * Typical use: emit both a consumer-branded prefix (e.g. `--tc`) and the
   * Stitch-default `--stitch` prefix so FaceTheory's built-in stitch-shell
   * components keep resolving via their hard-coded `var(--stitch-*, ...)`
   * fallbacks while consumer-authored styles can read the branded vars too.
   *
   * Example:
   *   stitchToCssVars(tokens, { prefix: '--tc', additionalPrefixes: ['--stitch'] })
   */
  additionalPrefixes?: string[];
}

function emitStitchVars(
  tokens: StitchTokenSet,
  prefix: string,
): Record<string, string> {
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

  // Optional surface classification. Brand-agnostic: consumers choose the
  // vocabulary (e.g. "core", "mcp", "auth"); FaceTheory only emits the value
  // through the CSS variable channel so downstream components can key off it.
  if (tokens.surface !== undefined) {
    out[`${prefix}-surface`] = tokens.surface;
  }

  return out;
}

/**
 * Converts a Stitch token set into a flat CSS variable record. Variable names
 * follow the Material-inspired naming used in the Stitch design doc
 * (`--stitch-color-surface-container-low`, `--stitch-font-body`, ...).
 *
 * Pass `additionalPrefixes` to emit the same tokens under extra CSS variable
 * prefixes. FaceTheory's built-in stitch-shell components hard-code
 * `var(--stitch-*, ...)` fallbacks, so a consumer that wants a branded prefix
 * should include `--stitch` in the emitted set to preserve compatibility.
 */
export function stitchToCssVars(
  tokens: StitchTokenSet,
  options: StitchCssVarOptions = {},
): Record<string, string> {
  const primary = options.prefix ?? '--stitch';
  const additional = options.additionalPrefixes ?? [];
  const seen = new Set<string>();
  const out: Record<string, string> = {};

  for (const prefix of [primary, ...additional]) {
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    Object.assign(out, emitStitchVars(tokens, prefix));
  }

  return out;
}

/**
 * Serializes a CSS variable record as a `:root { ... }` block. Use this for
 * SSR style injection when spreading onto a framework `style` prop is not an
 * option. The returned string is raw CSS text, so emit it through FaceTheory's
 * `styleTags` / `headTags: [{ type: 'style', ... }]` paths rather than wrapping
 * it in `<style>...</style>` and passing it through `head.html`.
 */
export function stitchCssVarsToRootBlock(vars: Record<string, string>): string {
  const lines = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `:root {\n${lines}\n}`;
}
