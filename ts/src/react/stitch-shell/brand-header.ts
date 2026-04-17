import * as React from 'react';

const h = React.createElement;

/**
 * True when `value` is a ReactNode that should produce visible output —
 * i.e. not one of the React "non-rendering children" (`undefined`, `null`,
 * `false`) and not an empty string. Used for optional chrome wrappers so
 * the common `cond && node` idiom does not leave empty chip chrome when
 * the guard is falsy.
 */
function isRenderableNode(value: React.ReactNode): boolean {
  return value !== undefined && value !== null && value !== false && value !== '';
}

export interface BrandHeaderProps {
  /**
   * Brand logo node (icon, image, or custom component). Brand-agnostic —
   * FaceTheory does not bundle any specific logo.
   */
  logo: React.ReactNode;
  /**
   * Brand wordmark — typically the product or platform name. Accepts a
   * string or any ReactNode so a caller can use a custom wordmark component.
   */
  wordmark: React.ReactNode;
  /**
   * Optional surface-chip label (for example a "[Core]" / "[MCP]" / "[Auth]"
   * classification, or any consumer-defined chip text). Omit to render just
   * the logo + wordmark.
   */
  surfaceLabel?: React.ReactNode;
  /**
   * Optional tone hint for the surface chip. The component binds the chip's
   * background and foreground to the CSS variables
   * `--stitch-color-{surfaceTone}-container` and
   * `--stitch-color-on-{surfaceTone}-container`. The tone name is
   * caller-chosen — FaceTheory ships no enumerated vocabulary. When omitted,
   * the chip falls back to neutral surface-container tokens.
   */
  surfaceTone?: string;
}

/**
 * BrandHeader renders a caller-supplied logo + wordmark pair, with an
 * optional surface-chip label on the right. The component is brand-agnostic:
 * all content is caller-provided, all colors bind through Stitch CSS
 * variables, and nothing Theory-Cloud-specific is hard-coded.
 *
 * Typical uses:
 *  - Pass the entire BrandHeader as the `logo` prop of the Topbar from 2.1,
 *    leaving the Topbar's `surfaceLabel` slot unused.
 *  - Pass the logo to Topbar's `logo` slot and render a separate chip
 *    through Topbar's `surfaceLabel` slot.
 *  - Render BrandHeader standalone as a page-level header outside the Shell.
 */
export function BrandHeader(props: BrandHeaderProps): React.ReactElement {
  const { logo, wordmark, surfaceLabel, surfaceTone } = props;

  const chipBg =
    surfaceTone !== undefined
      ? `var(--stitch-color-${surfaceTone}-container, var(--stitch-color-surface-container-high, #e2e7ff))`
      : 'var(--stitch-color-surface-container-high, #e2e7ff)';
  const chipColor =
    surfaceTone !== undefined
      ? `var(--stitch-color-on-${surfaceTone}-container, var(--stitch-color-on-surface, #131b2e))`
      : 'var(--stitch-color-on-surface, #131b2e)';

  return h(
    'div',
    {
      className: 'facetheory-stitch-brand-header',
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '12px',
      },
    },
    h(
      'span',
      {
        className: 'facetheory-stitch-brand-header-logo',
        style: { display: 'inline-flex', alignItems: 'center' },
      },
      logo,
    ),
    h(
      'span',
      {
        className: 'facetheory-stitch-brand-header-wordmark',
        style: {
          fontFamily: 'var(--stitch-font-display, inherit)',
          fontWeight: 600,
          fontSize: '15px',
          letterSpacing: '0.01em',
          color: 'var(--stitch-color-on-surface, #131b2e)',
        },
      },
      wordmark,
    ),
    isRenderableNode(surfaceLabel)
      ? h(
          'span',
          {
            className: 'facetheory-stitch-brand-header-surface-label',
            'data-surface-tone': surfaceTone,
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 10px',
              borderRadius: 'var(--stitch-radius-sm, 4px)',
              background: chipBg,
              color: chipColor,
              fontFamily: 'var(--stitch-font-label, inherit)',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.08em',
            },
          },
          surfaceLabel,
        )
      : null,
  );
}
