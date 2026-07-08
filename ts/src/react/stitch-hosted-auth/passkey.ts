import * as React from 'react';
import { Button } from 'antd';
import type { ButtonProps } from 'antd';

import {
  AUTH_SIGNATURE_GRADIENT_BACKGROUND,
  type PasskeyCTAProps as SharedPasskeyCTAProps,
} from '../../stitch-hosted-auth/index.js';

const h = React.createElement;

export interface PasskeyCTAProps
  extends Omit<
    SharedPasskeyCTAProps<React.ReactNode, ButtonProps['onClick']>,
    'children'
  > {
  children: React.ReactNode;
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
      background: AUTH_SIGNATURE_GRADIENT_BACKGROUND,
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
