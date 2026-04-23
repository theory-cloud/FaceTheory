import { defineComponent, Fragment, h } from 'vue';

import { resolveSurfaceTone } from '../../stitch-shell/surface-tone.js';
import { renderPropContent, vnodeChildProp } from '../stitch-common.js';

/**
 * True when `value` is a VNodeChild that should produce visible output.
 *
 * See the sibling helper in `shell.ts` for the full semantics. In short:
 * handles scalar non-rendering children (`undefined` / `null` / `false` /
 * `true` / `''`), arrays (renderable if any element is renderable), and
 * empty Vue Fragments. VNodes whose component render function returns
 * nothing at runtime are not detected here — callers should use the
 * `cond && node` pattern at the call site for runtime-null cases.
 */
function isRenderableChild(value: unknown): boolean {
  if (
    value === undefined ||
    value === null ||
    value === false ||
    value === true ||
    value === ''
  ) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(isRenderableChild);
  }
  if (typeof value === 'object' && value !== null && 'type' in value) {
    const vnode = value as { type: unknown; children?: unknown };
    if (vnode.type === Fragment) {
      return isRenderableChild(vnode.children);
    }
  }
  return true;
}

export interface BrandHeaderProps {
  /**
   * Brand logo node (icon, image, or custom component). Brand-agnostic —
   * FaceTheory does not bundle any specific logo.
   */
  logo?: unknown;
  /**
   * Brand wordmark — typically the product or platform name. Accepts a
   * string or any VNodeChild so a caller can use a custom wordmark component.
   */
  wordmark?: unknown;
  /**
   * Optional surface-chip label (for example a "[Core]" / "[MCP]" / "[Auth]"
   * classification, or any consumer-defined chip text). Omit to render just
   * the logo + wordmark.
   */
  surfaceLabel?: unknown;
  /**
   * Optional tone hint for the surface chip. The component binds the chip's
   * background and foreground to the CSS variables
   * `--stitch-color-{surfaceTone}-container` and
   * `--stitch-color-on-{surfaceTone}-container`. The tone name is
   * caller-chosen and normalized to a safe lowercase kebab-case token suffix.
   * When omitted or normalized to an empty suffix, the chip falls back to
   * neutral surface-container tokens.
   */
  surfaceTone?: string;
}

/**
 * BrandHeader (Vue) renders a caller-supplied logo + wordmark pair, with an
 * optional surface-chip label on the right. The component is brand-agnostic:
 * all content is caller-provided, all colors bind through Stitch CSS
 * variables, and nothing Theory-Cloud-specific is hard-coded.
 *
 * Typical uses:
 *  - Pass the entire BrandHeader as the `logo` prop of the Topbar, leaving
 *    the Topbar's `surfaceLabel` slot unused.
 *  - Pass the logo to Topbar's `logo` slot and render a separate chip
 *    through Topbar's `surfaceLabel` slot.
 *  - Render BrandHeader standalone as a page-level header outside the Shell.
 */
export const BrandHeader = defineComponent({
  name: 'FaceTheoryVueBrandHeader',
  props: {
    logo: vnodeChildProp,
    wordmark: vnodeChildProp,
    surfaceLabel: vnodeChildProp,
    surfaceTone: { type: String, required: false },
  },
  setup(props) {
    return () => {
      const { normalizedTone, chipBg, chipColor } = resolveSurfaceTone(props.surfaceTone);

      return h(
        'div',
        {
          class: 'facetheory-stitch-brand-header',
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
          },
        },
        [
          h(
            'span',
            {
              class: 'facetheory-stitch-brand-header-logo',
              style: { display: 'inline-flex', alignItems: 'center' },
            },
            renderPropContent(props.logo),
          ),
          h(
            'span',
            {
              class: 'facetheory-stitch-brand-header-wordmark',
              style: {
                fontFamily: 'var(--stitch-font-display, inherit)',
                fontWeight: 600,
                fontSize: '15px',
                letterSpacing: '0.01em',
                color: 'var(--stitch-color-on-surface, #131b2e)',
              },
            },
            renderPropContent(props.wordmark),
          ),
          isRenderableChild(props.surfaceLabel)
            ? h(
                'span',
                {
                  class: 'facetheory-stitch-brand-header-surface-label',
                  'data-surface-tone': normalizedTone,
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
                renderPropContent(props.surfaceLabel),
              )
            : null,
        ],
      );
    };
  },
});
