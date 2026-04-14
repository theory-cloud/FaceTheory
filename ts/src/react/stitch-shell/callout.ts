import * as React from 'react';

import type { CalloutVariant } from '../../stitch-shell/callout-types.js';

const h = React.createElement;

export type { CalloutVariant } from '../../stitch-shell/callout-types.js';

export interface CalloutProps {
  /** Semantic severity. Drives the accent color. Default `info`. */
  variant?: CalloutVariant;
  /** Short heading. */
  title?: React.ReactNode;
  /** Optional leading icon node. */
  icon?: React.ReactNode;
  /** Body content. */
  children?: React.ReactNode;
  /** Optional trailing action slot (e.g. a small link or button). */
  actions?: React.ReactNode;
}

interface CalloutPalette {
  accent: string;
  background: string;
  color: string;
}

const PALETTE: Record<CalloutVariant, CalloutPalette> = {
  info: {
    accent: 'var(--stitch-color-primary, #3a48c8)',
    background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
    color: 'var(--stitch-color-on-surface, #131b2e)',
  },
  success: {
    accent: 'var(--stitch-color-tertiary, #00332e)',
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
  },
  warning: {
    accent: 'var(--stitch-color-secondary, #6d5e0f)',
    background: 'var(--stitch-color-secondary-container, #ffecc0)',
    color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
  },
  danger: {
    accent: 'var(--stitch-color-error, #ba1a1a)',
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
  },
};

/**
 * Inline content callout — used for policy notes, deprecation warnings,
 * and inline documentation blocks inside admin pages. The accent stripe
 * + tonal background are token-driven so tenant theming flows through.
 * Compose with `Panel` when you want the callout to feel like its own
 * elevated surface; drop it inline otherwise.
 */
export function Callout(props: CalloutProps): React.ReactElement {
  const { variant = 'info', title, icon, children, actions } = props;
  const palette = PALETTE[variant];

  return h(
    'div',
    {
      className: `facetheory-stitch-callout facetheory-stitch-callout-${variant}`,
      role: variant === 'danger' || variant === 'warning' ? 'alert' : 'note',
      style: {
        display: 'flex',
        gap: '12px',
        padding: '12px 16px',
        borderLeft: `3px solid ${palette.accent}`,
        background: palette.background,
        color: palette.color,
        borderTopRightRadius: 'var(--stitch-radius-md, 8px)',
        borderBottomRightRadius: 'var(--stitch-radius-md, 8px)',
      },
    },
    icon !== undefined
      ? h(
          'span',
          {
            className: 'facetheory-stitch-callout-icon',
            'aria-hidden': 'true',
            style: {
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              color: palette.accent,
              fontSize: '18px',
              lineHeight: 1,
              marginTop: '2px',
            },
          },
          icon,
        )
      : null,
    h(
      'div',
      {
        className: 'facetheory-stitch-callout-body',
        style: {
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        },
      },
      title !== undefined
        ? h(
            'p',
            {
              className: 'facetheory-stitch-callout-title',
              style: {
                margin: 0,
                fontSize: '13px',
                fontWeight: 600,
                color: 'inherit',
              },
            },
            title,
          )
        : null,
      children !== undefined
        ? h(
            'div',
            {
              className: 'facetheory-stitch-callout-content',
              style: {
                fontSize: '13px',
                lineHeight: 1.5,
                color: 'inherit',
              },
            },
            children,
          )
        : null,
    ),
    actions !== undefined
      ? h(
          'div',
          {
            className: 'facetheory-stitch-callout-actions',
            style: {
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            },
          },
          actions,
        )
      : null,
  );
}
