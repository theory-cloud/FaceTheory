import * as React from 'react';

import {
  authStateClassName,
  authStateRole,
  authStateVariantPalette,
  type AuthStateCardProps as SharedAuthStateCardProps,
} from '../../stitch-hosted-auth/index.js';

const h = React.createElement;

export type { AuthStateVariant } from '../../stitch-hosted-auth/index.js';

export type AuthStateCardProps = SharedAuthStateCardProps<React.ReactNode>;

/**
 * Terminal-state hosted-auth card. Covers the `Account Locked`, `Error`,
 * `Email Verification`, `Accept Invitation`, and success screens. Use this
 * instead of composing a manual card when the screen is purely informational
 * with zero-to-two actions.
 */
export function AuthStateCard(props: AuthStateCardProps): React.ReactElement {
  const { variant = 'info', title, description, icon, actions } = props;
  const palette = authStateVariantPalette(variant);

  return h(
    'div',
    {
      className: authStateClassName(variant),
      role: authStateRole(variant),
      style: {
        width: '100%',
        maxWidth: 440,
        background: palette.surface,
        color: palette.text,
        borderRadius: 'var(--stitch-radius-xl, 16px)',
        padding: '40px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        alignItems: 'center',
        textAlign: 'center',
        boxShadow: '0 24px 48px -12px rgba(19, 27, 46, 0.04)',
      },
    },
    icon !== undefined
      ? h(
          'div',
          {
            'aria-hidden': 'true',
            style: {
              width: 48,
              height: 48,
              borderRadius: '9999px',
              background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
              color: palette.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
            },
          },
          icon,
        )
      : null,
    h(
      'h1',
      {
        style: {
          margin: 0,
          fontSize: '22px',
          lineHeight: 1.2,
          fontFamily:
            'var(--stitch-font-display, "Space Grotesk"), system-ui, sans-serif',
        },
      },
      title,
    ),
    description !== undefined
      ? h(
          'p',
          { style: { margin: 0, fontSize: '14px', lineHeight: 1.5 } },
          description,
        )
      : null,
    actions !== undefined
      ? h(
          'div',
          {
            className: 'facetheory-stitch-auth-state-actions',
            style: {
              display: 'flex',
              gap: '12px',
              marginTop: 8,
              justifyContent: 'center',
              flexWrap: 'wrap',
            },
          },
          actions,
        )
      : null,
  );
}
