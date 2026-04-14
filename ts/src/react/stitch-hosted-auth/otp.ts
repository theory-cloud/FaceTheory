import * as React from 'react';
import { Input } from 'antd';

const h = React.createElement;

export interface OTPInputProps {
  /** Number of characters to accept. Default 6. */
  length?: number;
  value?: string;
  onChange?: (value: string) => void;
  /** Fires when the last digit is entered (useful for auto-submit flows). */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  /** Visually marks the input invalid. Pairs with a caller-supplied error message. */
  invalid?: boolean;
  /** Autofocus the first character box on mount. Default `true`. */
  autoFocus?: boolean;
}

/**
 * One-time-password input. Wraps AntD's `Input.OTP` with Stitch styling —
 * individual character boxes sit on `surface-container-high`, the active box
 * flips to `surface-container-lowest` with a 2px primary ghost border, and
 * invalid states borrow the error container token.
 */
export function OTPInput(props: OTPInputProps): React.ReactElement {
  const {
    length = 6,
    value,
    onChange,
    onComplete,
    disabled,
    invalid,
    autoFocus = true,
  } = props;

  const className = [
    'facetheory-stitch-otp-input',
    invalid ? 'facetheory-stitch-otp-input-invalid' : null,
  ]
    .filter(Boolean)
    .join(' ');

  const otpProps: React.ComponentProps<typeof Input.OTP> = {
    length,
    className,
    autoFocus,
  };
  if (value !== undefined) otpProps.value = value;
  if (onChange !== undefined) otpProps.onChange = onChange;
  if (disabled !== undefined) otpProps.disabled = disabled;
  if (invalid === true) otpProps.status = 'error';
  if (onComplete !== undefined) {
    const existingOnChange = onChange;
    otpProps.onChange = (next: string) => {
      if (existingOnChange) existingOnChange(next);
      if (next.length === length) onComplete(next);
    };
  }

  return h(Input.OTP, otpProps);
}
