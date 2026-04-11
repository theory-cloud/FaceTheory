import * as React from 'react';

const h = React.createElement;

export interface CopyableCodeProps {
  /**
   * The literal string that will be copied to the clipboard. Also used as
   * the default visible content when `children` is omitted.
   */
  code: string;
  /**
   * Override the rendered content while keeping `code` as the copy payload.
   * Useful when the visible form is highlighted (e.g. masked tenant ID) and
   * the copied form is the raw value.
   */
  children?: React.ReactNode;
  /** Accessible label for the copy button. Default "Copy". */
  copyLabel?: string;
  /** `md` is the default; `sm` tightens padding for dense table cells. */
  size?: 'sm' | 'md';
  /**
   * Fires after a successful clipboard write. Consumers wire this to
   * analytics or optimistic UI; the button handles the actual copy.
   */
  onCopy?: (code: string) => void;
}

function handleCopy(code: string, onCopy?: (code: string) => void): void {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.writeText === 'function'
  ) {
    void navigator.clipboard.writeText(code);
  }
  if (onCopy !== undefined) onCopy(code);
}

/**
 * Monospace code chip with an inline copy button. Used wherever the control
 * plane surfaces an addressable identifier — routes, tenant IDs, ARNs,
 * webhook URLs. The copy action uses `navigator.clipboard.writeText` on the
 * client; on the server it renders as a regular button so SSR output is
 * stable.
 */
export function CopyableCode(props: CopyableCodeProps): React.ReactElement {
  const { code, children, copyLabel = 'Copy', size = 'md', onCopy } = props;

  const padding = size === 'sm' ? '2px 8px' : '4px 10px';
  const fontSize = size === 'sm' ? '11px' : '12px';

  const buttonProps: React.HTMLAttributes<HTMLButtonElement> & {
    type: 'button';
  } = {
    type: 'button',
    'aria-label': copyLabel,
    className: 'facetheory-stitch-copyable-code-button',
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2px 6px',
      fontSize: '11px',
      fontWeight: 600,
      color: 'var(--stitch-color-on-surface-variant, #464553)',
      background: 'transparent',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
    },
    onClick: () => handleCopy(code, onCopy),
  };

  return h(
    'span',
    {
      className: 'facetheory-stitch-copyable-code',
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding,
        fontSize,
        fontFamily:
          'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)',
        color: 'var(--stitch-color-on-surface, #131b2e)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
        borderRadius: 'var(--stitch-radius-md, 8px)',
        maxWidth: '100%',
      },
    },
    h(
      'code',
      {
        className: 'facetheory-stitch-copyable-code-value',
        style: {
          fontFamily: 'inherit',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        },
      },
      children ?? code,
    ),
    h('button', buttonProps, copyLabel),
  );
}
