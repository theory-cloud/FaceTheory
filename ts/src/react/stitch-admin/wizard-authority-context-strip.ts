import * as React from 'react';

import { safeMetadataHref } from '../../stitch-admin/safe-url.js';
import type {
  WizardAuthorityContextItem,
  WizardAuthorityContextItemTone,
  WizardAuthorityContextStrip,
  WizardAuthorityContextStripLayout,
  WizardAuthorityContextStripSize,
  WizardServerResolvedContextBar,
  WizardServerResolvedContextBarItem,
  WizardServerResolvedContextBarLayout,
  WizardServerResolvedContextBarSize,
  WizardServerResolvedContextBarTone,
} from '../../stitch-admin/wizard-authority-context-strip-types.js';
import type { WizardSafetyPolicy } from '../../stitch-admin/wizard-types.js';

const h = React.createElement;

export type {
  WizardAuthorityContextItem,
  WizardAuthorityContextItemTone,
  WizardAuthorityContextStrip,
  WizardAuthorityContextStripLayout,
  WizardAuthorityContextStripSize,
  WizardServerResolvedContextBar,
  WizardServerResolvedContextBarItem,
  WizardServerResolvedContextBarLayout,
  WizardServerResolvedContextBarSize,
  WizardServerResolvedContextBarTone,
};

interface TonePalette {
  background: string;
  color: string;
  border: string;
}

const TONE_PALETTE: Record<WizardAuthorityContextItemTone, TonePalette> = {
  neutral: {
    background: 'var(--stitch-color-surface-container, #eaedff)',
    color: 'var(--stitch-color-on-surface, #131b2e)',
    border: 'var(--stitch-color-outline-variant, #c6c5d0)',
  },
  info: {
    background: 'var(--stitch-color-primary-container, #e0e0ff)',
    color: 'var(--stitch-color-on-primary-container, #000066)',
    border: 'var(--stitch-color-primary-container, #e0e0ff)',
  },
  success: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    border: 'var(--stitch-color-tertiary-container, #004c45)',
  },
  warning: {
    background: 'var(--stitch-color-secondary-container, #ffecc0)',
    color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    border: 'var(--stitch-color-secondary-container, #ffecc0)',
  },
  danger: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    border: 'var(--stitch-color-error-container, #ffdad6)',
  },
};

interface SizeTokens {
  itemPadding: string;
  itemGap: string;
  labelFontSize: string;
  valueFontSize: string;
  stripGap: string;
  stripPadding: string;
  borderRadius: string;
}

const SIZE_TOKENS: Record<WizardAuthorityContextStripSize, SizeTokens> = {
  sm: {
    itemPadding: '6px 10px',
    itemGap: '4px',
    labelFontSize: '10px',
    valueFontSize: '12px',
    stripGap: '6px',
    stripPadding: '10px',
    borderRadius: 'var(--stitch-radius-sm, 8px)',
  },
  md: {
    itemPadding: '8px 12px',
    itemGap: '4px',
    labelFontSize: '11px',
    valueFontSize: '13px',
    stripGap: '8px',
    stripPadding: '12px',
    borderRadius: 'var(--stitch-radius-md, 10px)',
  },
  lg: {
    itemPadding: '10px 14px',
    itemGap: '6px',
    labelFontSize: '12px',
    valueFontSize: '14px',
    stripGap: '10px',
    stripPadding: '14px',
    borderRadius: 'var(--stitch-radius-md, 10px)',
  },
};

export interface WizardAuthorityContextStripPanelProps {
  /** Section heading. Adapter narrows to its native node type. Defaults are deterministic. */
  title?: React.ReactNode;
  /** Optional descriptive copy. */
  description?: React.ReactNode;
  strip: WizardAuthorityContextStrip;
  /**
   * Optional caller-supplied copy callback. Fired with `(itemKey, copyValue)`
   * when the user activates the cell's "Copy" button. If omitted, the button
   * still renders with deterministic markup so SSR and hydration match, but
   * it performs no clipboard write — the host is responsible for wiring the
   * action. The primitive does not invent or resolve copy payloads.
   */
  onCopyItem?: (itemKey: string, copyValue: string) => void;
}

/**
 * Presentational read-only authority/context strip for wizard surfaces.
 *
 * Trust boundary (load-bearing):
 *
 *   - The primitive never resolves tenant, namespace, MCP route, operator,
 *     partner, agent, account, entitlement, mailbox, GitHub, or authority
 *     state.
 *   - The primitive never enforces read-only; the read-only label (when
 *     provided) is informational text.
 *   - The primitive never invents copy payloads; copyable cells use
 *     `item.copyValue` or, when absent and `item.value` is a string, the
 *     string value verbatim.
 *
 * Accessibility:
 *
 *   - Each cell carries `<dt>` (label) and `<dd>` (value) so screen-readers
 *     read the pairing.
 *   - The optional authority label and read-only label are text — not
 *     color or icon only.
 *   - Copy buttons are real `<button type="button">` elements with an
 *     explicit `aria-label="Copy <label>"` and a `data-copy-value` payload
 *     supplied by the host.
 *   - Layout is CSS-only and stacks responsively under `auto` without
 *     hiding any label/value context.
 */
export function WizardAuthorityContextStripPanel(
  props: WizardAuthorityContextStripPanelProps,
): React.ReactElement {
  const { title, description, strip, onCopyItem } = props;
  const layout: WizardAuthorityContextStripLayout = strip.layout ?? 'auto';
  const size: WizardAuthorityContextStripSize = strip.size ?? 'md';
  const sizeTokens = SIZE_TOKENS[size];
  const wrap = strip.wrap !== false;
  const itemCount = strip.items.length;

  return h(
    'section',
    {
      className: `facetheory-stitch-wizard-authority-context-strip facetheory-stitch-wizard-authority-context-strip-layout-${layout} facetheory-stitch-wizard-authority-context-strip-size-${size}`,
      'data-safety-policy': strip.safetyPolicy,
      'data-layout': layout,
      'data-size': size,
      'data-wrap': wrap ? 'true' : 'false',
      'data-item-count': String(itemCount),
      'data-read-only': strip.readOnlyLabel !== undefined ? 'true' : 'false',
      'data-has-authority-label': strip.authorityLabel !== undefined ? 'true' : 'false',
      role: 'region',
      'aria-label':
        typeof title === 'string'
          ? title
          : 'Server-resolved context',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: sizeTokens.stripPadding,
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
        color: 'var(--stitch-color-on-surface, #131b2e)',
      },
    },
    renderHeader(title, description, strip, sizeTokens),
    itemCount > 0
      ? renderItems(strip, layout, sizeTokens, wrap, onCopyItem)
      : renderEmpty(strip.emptyLabel),
    renderSafetyFootnote(strip.safetyPolicy),
  );
}

/** Stable alias for callers who prefer the "ServerResolvedContextBar" naming. */
export const WizardServerResolvedContextBarPanel = WizardAuthorityContextStripPanel;
export type WizardServerResolvedContextBarPanelProps = WizardAuthorityContextStripPanelProps;

function renderHeader(
  title: React.ReactNode | undefined,
  description: React.ReactNode | undefined,
  strip: WizardAuthorityContextStrip,
  sizeTokens: SizeTokens,
): React.ReactElement | null {
  const hasTitle = title !== undefined;
  const hasDescription = description !== undefined;
  const hasAuthority = strip.authorityLabel !== undefined;
  const hasReadOnly = strip.readOnlyLabel !== undefined;
  const hasActions = strip.actions !== undefined;

  if (!hasTitle && !hasDescription && !hasAuthority && !hasReadOnly && !hasActions) {
    return null;
  }

  return h(
    'header',
    {
      className: 'facetheory-stitch-wizard-authority-context-strip-header',
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
      },
    },
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 } },
      hasTitle
        ? h(
            'h2',
            { style: { margin: 0, fontSize: '14px', lineHeight: 1.4 } },
            title as React.ReactNode,
          )
        : null,
      hasDescription
        ? h(
            'p',
            {
              style: {
                margin: 0,
                fontSize: '12px',
                lineHeight: 1.5,
                color: 'var(--stitch-color-on-surface-variant, #464553)',
              },
            },
            description,
          )
        : null,
      hasAuthority || hasReadOnly
        ? h(
            'div',
            {
              className: 'facetheory-stitch-wizard-authority-context-strip-status',
              style: {
                display: 'inline-flex',
                gap: '8px',
                flexWrap: 'wrap',
                alignItems: 'center',
                marginTop: hasTitle || hasDescription ? '2px' : 0,
                fontSize: sizeTokens.labelFontSize,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--stitch-color-on-surface-variant, #464553)',
              },
            },
            hasAuthority
              ? h(
                  'span',
                  {
                    className: 'facetheory-stitch-wizard-authority-context-strip-authority',
                    'data-authority-label': 'true',
                  },
                  strip.authorityLabel as React.ReactNode,
                )
              : null,
            hasReadOnly
              ? h(
                  'span',
                  {
                    className: 'facetheory-stitch-wizard-authority-context-strip-readonly',
                    'data-read-only-label': 'true',
                    'aria-label': 'Read-only',
                  },
                  strip.readOnlyLabel as React.ReactNode,
                )
              : null,
          )
        : null,
    ),
    hasActions
      ? h(
          'div',
          {
            className: 'facetheory-stitch-wizard-authority-context-strip-actions',
            style: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
          },
          strip.actions as React.ReactNode,
        )
      : null,
  );
}

function renderItems(
  strip: WizardAuthorityContextStrip,
  layout: WizardAuthorityContextStripLayout,
  sizeTokens: SizeTokens,
  wrap: boolean,
  onCopyItem: WizardAuthorityContextStripPanelProps['onCopyItem'],
): React.ReactElement {
  const containerStyle = layoutContainerStyle(layout, sizeTokens, wrap);
  return h(
    'dl',
    {
      className: 'facetheory-stitch-wizard-authority-context-strip-items',
      style: { margin: 0, padding: 0, ...containerStyle },
    },
    strip.items.map((item) => renderItem(item, sizeTokens, onCopyItem)),
  );
}

function layoutContainerStyle(
  layout: WizardAuthorityContextStripLayout,
  sizeTokens: SizeTokens,
  wrap: boolean,
): React.CSSProperties {
  switch (layout) {
    case 'grid':
      return {
        display: 'grid',
        gap: sizeTokens.stripGap,
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      };
    case 'stack':
      return {
        display: 'flex',
        flexDirection: 'column',
        gap: sizeTokens.stripGap,
      };
    case 'strip':
      return {
        display: 'flex',
        flexDirection: 'row',
        gap: sizeTokens.stripGap,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        overflowX: wrap ? 'visible' : 'auto',
      };
    case 'auto':
    default:
      // CSS-only responsive: auto-fit grid stacks naturally on narrow viewports
      // without hiding any label/value context.
      return {
        display: 'grid',
        gap: sizeTokens.stripGap,
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      };
  }
}

function renderItem(
  item: WizardAuthorityContextItem,
  sizeTokens: SizeTokens,
  onCopyItem: WizardAuthorityContextStripPanelProps['onCopyItem'],
): React.ReactElement {
  const tone = item.tone ?? 'neutral';
  const palette = TONE_PALETTE[tone];
  const valueString =
    item.copyValue !== undefined
      ? item.copyValue
      : typeof item.value === 'string'
        ? item.value
        : undefined;
  const showCopy = item.copyable === true && valueString !== undefined;
  const safeHref = safeMetadataHref(item.href);

  return h(
    'div',
    {
      key: item.key,
      className: `facetheory-stitch-wizard-authority-context-strip-item facetheory-stitch-wizard-authority-context-strip-item-tone-${tone}`,
      'data-item-key': item.key,
      'data-item-tone': tone,
      'data-item-copyable': showCopy ? 'true' : 'false',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: sizeTokens.itemGap,
        padding: sizeTokens.itemPadding,
        borderRadius: sizeTokens.borderRadius,
        background: palette.background,
        color: palette.color,
        border: `1px solid ${palette.border}`,
        minWidth: 0,
      },
    },
    h(
      'dt',
      {
        className: 'facetheory-stitch-wizard-authority-context-strip-item-label',
        style: {
          margin: 0,
          fontSize: sizeTokens.labelFontSize,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--stitch-color-on-surface-variant, #464553)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        },
      },
      item.icon !== undefined
        ? h(
            'span',
            {
              className: 'facetheory-stitch-wizard-authority-context-strip-item-icon',
              'aria-hidden': 'true',
            },
            item.icon as React.ReactNode,
          )
        : null,
      h(
        'span',
        { className: 'facetheory-stitch-wizard-authority-context-strip-item-label-text' },
        item.label as React.ReactNode,
      ),
      item.badge !== undefined
        ? h(
            'span',
            {
              className: 'facetheory-stitch-wizard-authority-context-strip-item-badge',
              style: {
                fontSize: '10px',
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: '9999px',
                background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
                color: 'var(--stitch-color-on-surface, #131b2e)',
                marginLeft: '2px',
              },
            },
            item.badge as React.ReactNode,
          )
        : null,
    ),
    h(
      'dd',
      {
        className: 'facetheory-stitch-wizard-authority-context-strip-item-value',
        title: item.title,
        style: {
          margin: 0,
          fontSize: sizeTokens.valueFontSize,
          lineHeight: 1.4,
          color: 'var(--stitch-color-on-surface, #131b2e)',
          fontFamily: 'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)',
          overflowWrap: 'anywhere',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          minWidth: 0,
        },
      },
      safeHref !== undefined
        ? h(
            'a',
            {
              href: safeHref,
              className: 'facetheory-stitch-wizard-authority-context-strip-item-value-link',
              style: { color: 'inherit', overflowWrap: 'anywhere' },
            },
            item.value as React.ReactNode,
          )
        : h(
            'span',
            {
              className: 'facetheory-stitch-wizard-authority-context-strip-item-value-text',
              style: { overflowWrap: 'anywhere' },
            },
            item.value as React.ReactNode,
          ),
      showCopy && valueString !== undefined
        ? renderCopyButton(item, valueString, onCopyItem)
        : null,
    ),
  );
}

function renderCopyButton(
  item: WizardAuthorityContextItem,
  copyValue: string,
  onCopyItem: WizardAuthorityContextStripPanelProps['onCopyItem'],
): React.ReactElement {
  const labelString =
    typeof item.label === 'string' ? item.label : `item ${item.key}`;
  return h(
    'button',
    {
      type: 'button',
      className: 'facetheory-stitch-wizard-authority-context-strip-item-copy',
      'aria-label': `Copy ${labelString}`,
      'data-copy-item-key': item.key,
      'data-copy-value': copyValue,
      onClick:
        onCopyItem !== undefined
          ? () => onCopyItem(item.key, copyValue)
          : undefined,
      style: {
        appearance: 'none',
        background: 'transparent',
        border: '1px solid var(--stitch-color-outline-variant, #c6c5d0)',
        borderRadius: 'var(--stitch-radius-sm, 8px)',
        padding: '2px 8px',
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--stitch-color-on-surface, #131b2e)',
        cursor: onCopyItem !== undefined ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
      },
    },
    'Copy',
  );
}

function renderEmpty(emptyLabel: unknown): React.ReactElement {
  return h(
    'div',
    {
      className: 'facetheory-stitch-wizard-authority-context-strip-empty',
      role: 'status',
      style: {
        padding: '12px',
        borderRadius: 'var(--stitch-radius-md, 10px)',
        background: 'var(--stitch-color-surface-container, #eaedff)',
        color: 'var(--stitch-color-on-surface-variant, #464553)',
        fontSize: '13px',
      },
    },
    emptyLabel !== undefined
      ? (emptyLabel as React.ReactNode)
      : 'No server-resolved context available.',
  );
}

function renderSafetyFootnote(policy: WizardSafetyPolicy): React.ReactElement {
  return h(
    'p',
    {
      className: 'facetheory-stitch-wizard-safety-footnote',
      'data-safety-policy': policy,
      style: {
        margin: 0,
        fontSize: '11px',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--stitch-color-on-surface-variant, #464553)',
      },
    },
    `Safety policy: ${policy}`,
  );
}
