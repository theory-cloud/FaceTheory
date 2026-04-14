import * as React from 'react';
import { Button, Input } from 'antd';
import type { ButtonProps } from 'antd';
import type { StatusVariant } from '../../stitch-admin/status-types.js';

const h = React.createElement;

export type { StatusVariant } from '../../stitch-admin/status-types.js';

interface StatusPalette {
  background: string;
  color: string;
  label: string;
}

const STATUS_PALETTE: Record<StatusVariant, StatusPalette> = {
  active: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    label: 'Active',
  },
  pending: {
    background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
    color: 'var(--stitch-color-on-surface-variant, #464553)',
    label: 'Pending',
  },
  suspended: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    label: 'Suspended',
  },
  archived: {
    background: 'var(--stitch-color-surface-container, #eaedff)',
    color: 'var(--stitch-color-on-surface-variant, #464553)',
    label: 'Archived',
  },
  error: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    label: 'Error',
  },
  warning: {
    background: 'var(--stitch-color-secondary-container, #ffecc0)',
    color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    label: 'Warning',
  },
  allow: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    label: 'Allow',
  },
  deny: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    label: 'Deny',
  },
};

export interface StatusTagProps {
  variant: StatusVariant;
  /** Override the built-in label (e.g. "Active · 12 members"). */
  label?: React.ReactNode;
}

/**
 * Status pill used inside data tables and detail panels to signal entity
 * state. Colors are bound to Stitch token variables so variants stay in
 * sync with tenant theming.
 */
export function StatusTag(props: StatusTagProps): React.ReactElement {
  const { variant, label } = props;
  const palette = STATUS_PALETTE[variant];
  return h(
    'span',
    {
      className: `facetheory-stitch-status-tag facetheory-stitch-status-tag-${variant}`,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        fontSize: '12px',
        fontWeight: 500,
        letterSpacing: '0.02em',
        borderRadius: '9999px',
        background: palette.background,
        color: palette.color,
      },
    },
    label ?? palette.label,
  );
}

export interface DestructiveConfirmProps {
  /** Main heading (e.g. "Delete partner?"). */
  title: React.ReactNode;
  /** Long-form description of what will happen. */
  description?: React.ReactNode;
  /**
   * If set, renders a text field that must match this string before the
   * confirm button enables. Use for high-risk actions (e.g. tenant delete).
   */
  requireText?: string;
  /** Override the confirm label. Defaults to "Delete". */
  confirmLabel?: React.ReactNode;
  /** Override the cancel label. Defaults to "Cancel". */
  cancelLabel?: React.ReactNode;
  onCancel?: () => void;
  onConfirm?: () => void;
  loading?: boolean;
}

/**
 * Modal body contents for a destructive confirmation flow. Consumers supply
 * their own AntD Modal wrapper (so open state stays under their control);
 * this component provides the Stitch-styled inner layout, the optional
 * "type to confirm" guard, and the action buttons.
 */
export function DestructiveConfirm(
  props: DestructiveConfirmProps,
): React.ReactElement {
  const {
    title,
    description,
    requireText,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    onCancel,
    onConfirm,
    loading,
  } = props;

  const [typed, setTyped] = React.useState('');
  const confirmable = requireText === undefined || typed === requireText;

  return h(
    'div',
    {
      className: 'facetheory-stitch-destructive-confirm',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '4px 0',
      },
    },
    h(
      'div',
      {
        style: { display: 'flex', flexDirection: 'column', gap: '6px' },
      },
      h(
        'h2',
        {
          style: {
            margin: 0,
            fontSize: '18px',
            color: 'var(--stitch-color-on-surface, #131b2e)',
          },
        },
        title,
      ),
      description !== undefined
        ? h(
            'p',
            {
              style: {
                margin: 0,
                fontSize: '14px',
                lineHeight: 1.5,
                color: 'var(--stitch-color-on-surface-variant, #464553)',
              },
            },
            description,
          )
        : null,
    ),
    requireText !== undefined
      ? h(
          'div',
          {
            style: { display: 'flex', flexDirection: 'column', gap: '6px' },
          },
          h(
            'label',
            {
              style: {
                fontSize: '12px',
                color: 'var(--stitch-color-on-surface-variant, #464553)',
              },
            },
            `Type "${requireText}" to confirm`,
          ),
          h(Input, {
            value: typed,
            onChange: (event) => setTyped(event.target.value),
            placeholder: requireText,
            'aria-label': `Type ${requireText} to confirm`,
          }),
        )
      : null,
    h(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
          marginTop: 8,
        },
      },
      h(Button, buildCancelProps(onCancel, loading, cancelLabel)),
      h(
        Button,
        buildConfirmProps(onConfirm, loading, !confirmable, confirmLabel),
      ),
    ),
  );
}

function buildCancelProps(
  onCancel: (() => void) | undefined,
  loading: boolean | undefined,
  label: React.ReactNode,
): ButtonProps {
  const out: ButtonProps = { children: label };
  if (onCancel !== undefined) out.onClick = onCancel;
  if (loading === true) out.disabled = true;
  return out;
}

function buildConfirmProps(
  onConfirm: (() => void) | undefined,
  loading: boolean | undefined,
  disabled: boolean,
  label: React.ReactNode,
): ButtonProps {
  const out: ButtonProps = {
    type: 'primary',
    danger: true,
    disabled,
    children: label,
  };
  if (onConfirm !== undefined) out.onClick = onConfirm;
  if (loading === true) out.loading = true;
  return out;
}
