import * as React from 'react';
import { Typography } from 'antd';

const h = React.createElement;

export interface AuthPageLayoutProps {
  /** Brand mark rendered in the top-left (e.g. logo). */
  brand?: React.ReactNode;
  /** Background treatment. `gradient` applies the Stitch signature indigo gradient. */
  background?: 'surface' | 'gradient';
  /** Right-rail slot for legal / locale / help links rendered at the bottom. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Full-viewport hosted-auth page wrapper. Renders a brand slot, a centered
 * content region for the auth card, and an optional footer. Use this as the
 * outermost element on any unauthenticated route.
 */
export function AuthPageLayout(
  props: AuthPageLayoutProps,
): React.ReactElement {
  const { brand, background = 'surface', footer, children } = props;

  const bgStyle: React.CSSProperties =
    background === 'gradient'
      ? {
          background:
            'linear-gradient(135deg, var(--stitch-color-primary, #1f108e) 0%, var(--stitch-color-primary-container, #3730a3) 100%)',
        }
      : {
          background: 'var(--stitch-color-surface, #faf8ff)',
        };

  return h(
    'div',
    {
      className: 'facetheory-stitch-auth-page',
      style: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        ...bgStyle,
      },
    },
    brand !== undefined
      ? h(
          'header',
          {
            className: 'facetheory-stitch-auth-page-brand',
            style: { padding: '24px 32px' },
          },
          brand,
        )
      : null,
    h(
      'main',
      {
        className: 'facetheory-stitch-auth-page-main',
        style: {
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        },
      },
      children,
    ),
    footer !== undefined
      ? h(
          'footer',
          {
            className: 'facetheory-stitch-auth-page-footer',
            style: {
              padding: '16px 32px 24px',
              display: 'flex',
              justifyContent: 'center',
              gap: '16px',
            },
          },
          footer,
        )
      : null,
  );
}

export interface AuthCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned secondary action slot inside the header (e.g. "Sign up"). */
  headerAction?: React.ReactNode;
  /** Footer slot rendered below the body (e.g. "Trouble signing in?"). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Hosted-auth card. Applies the Stitch tonal rules: surface-container-lowest
 * background, xl corner radius, no border, security-glow ambient shadow.
 * Titles use the display font; body uses inputs or consent blocks supplied
 * by the caller.
 */
export function AuthCard(props: AuthCardProps): React.ReactElement {
  const { title, description, headerAction, footer, children } = props;
  return h(
    'div',
    {
      className: 'facetheory-stitch-auth-card',
      style: {
        width: '100%',
        maxWidth: 440,
        background: 'var(--stitch-color-surface-container-lowest, #ffffff)',
        borderRadius: 'var(--stitch-radius-xl, 16px)',
        padding: '40px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        boxShadow: '0 24px 48px -12px rgba(19, 27, 46, 0.04)',
      },
    },
    h(
      'header',
      {
        className: 'facetheory-stitch-auth-card-header',
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
        },
      },
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h(
          Typography.Title,
          {
            level: 1,
            style: {
              margin: 0,
              fontSize: '24px',
              lineHeight: 1.2,
              fontFamily:
                'var(--stitch-font-display, "Space Grotesk"), system-ui, sans-serif',
            },
          },
          title,
        ),
        description !== undefined
          ? h(
              Typography.Text,
              {
                type: 'secondary',
                style: { fontSize: '14px', lineHeight: 1.4 },
              },
              description,
            )
          : null,
      ),
      headerAction !== undefined
        ? h('div', { style: { flexShrink: 0 } }, headerAction)
        : null,
    ),
    h(
      'div',
      {
        className: 'facetheory-stitch-auth-card-body',
        style: { display: 'flex', flexDirection: 'column', gap: '16px' },
      },
      children,
    ),
    footer !== undefined
      ? h(
          'div',
          {
            className: 'facetheory-stitch-auth-card-footer',
            style: {
              display: 'flex',
              justifyContent: 'center',
              fontSize: '13px',
            },
          },
          footer,
        )
      : null,
  );
}
