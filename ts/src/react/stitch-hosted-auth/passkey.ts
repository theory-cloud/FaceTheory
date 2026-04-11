import * as React from 'react';
import { Button } from 'antd';
import type { ButtonProps } from 'antd';

const h = React.createElement;

export interface PasskeyCTAProps {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick?: ButtonProps['onClick'];
  /** Leading icon (e.g. a passkey glyph). */
  icon?: React.ReactNode;
  /** HTML button type. Default `button` so it does not submit forms. */
  type?: 'button' | 'submit';
}

/**
 * Primary passkey (or "modern auth") call-to-action. Pill-shaped, full-width,
 * and bound to the Stitch signature indigo gradient. Use this to distinguish
 * modern passkey-first flows from legacy password CTAs (which use the default
 * md-radius AntD button).
 */
export function PasskeyCTA(props: PasskeyCTAProps): React.ReactElement {
  const { children, loading, disabled, onClick, icon, type = 'button' } = props;

  const buttonProps: ButtonProps = {
    type: 'primary',
    size: 'large',
    block: true,
    htmlType: type,
    className: 'facetheory-stitch-passkey-cta',
    style: {
      background:
        'linear-gradient(135deg, var(--stitch-color-primary, #1f108e) 0%, var(--stitch-color-primary-container, #3730a3) 100%)',
      border: 'none',
      borderRadius: '9999px',
      height: 48,
      fontWeight: 600,
      fontSize: '15px',
    },
  };
  if (loading !== undefined) buttonProps.loading = loading;
  if (disabled !== undefined) buttonProps.disabled = disabled;
  if (onClick !== undefined) buttonProps.onClick = onClick;
  if (icon !== undefined) buttonProps.icon = icon;

  return h(Button, { ...buttonProps, children });
}
