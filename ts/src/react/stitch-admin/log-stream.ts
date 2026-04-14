import * as React from 'react';

import type {
  LogEntry as SharedLogEntry,
  LogLevel,
} from '../../stitch-admin/log-types.js';

const h = React.createElement;

export type { LogLevel } from '../../stitch-admin/log-types.js';

export interface LogEntry extends Omit<SharedLogEntry, 'message' | 'actor'> {
  /** Log row body. */
  message: React.ReactNode;
  /** Optional actor/source label rendered between timestamp and message. */
  actor?: React.ReactNode;
}

export interface LogStreamProps {
  /** Entries rendered top-to-bottom in the order provided. */
  entries: LogEntry[];
  /**
   * `plain` is a compact audit-row layout (timestamp · actor · message).
   * `terminal` adds monospace framing, a window-chrome header, and a fixed
   * scroll height so it reads like a live repair shell. Default `plain`.
   */
  variant?: 'plain' | 'terminal';
  /** Optional label above the stream (e.g. "repair_logs_tty1"). */
  title?: React.ReactNode;
  /**
   * When provided, formats `timestamp` values into their display form.
   * Default renders ISO strings verbatim and epoch numbers as `HH:MM:SS`.
   */
  formatTimestamp?: (value: string | number) => string;
  /**
   * Max height for the scroll region when `variant === 'terminal'`. Default
   * `'240px'`. Ignored for `plain`.
   */
  maxHeight?: number | string;
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: 'var(--stitch-color-on-surface-variant, #464553)',
  info: 'var(--stitch-color-on-surface, #131b2e)',
  success: 'var(--stitch-color-tertiary, #00332e)',
  warn: 'var(--stitch-color-secondary, #6d5e0f)',
  error: 'var(--stitch-color-error, #ba1a1a)',
};

function defaultFormatTimestamp(value: string | number): string {
  if (typeof value === 'string') return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function renderEntry(
  entry: LogEntry,
  format: (value: string | number) => string,
): React.ReactElement {
  return h(
    'div',
    {
      key: entry.id,
      className: `facetheory-stitch-log-stream-row facetheory-stitch-log-stream-row-${entry.level}`,
      style: {
        display: 'flex',
        gap: '12px',
        alignItems: 'baseline',
        padding: '2px 0',
        color: LEVEL_COLOR[entry.level],
        fontSize: '12px',
        lineHeight: 1.5,
        fontVariantNumeric: 'tabular-nums',
      },
    },
    h(
      'span',
      {
        className: 'facetheory-stitch-log-stream-timestamp',
        style: {
          flexShrink: 0,
          color: 'var(--stitch-color-on-surface-variant, #464553)',
          fontFamily:
            'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)',
        },
      },
      format(entry.timestamp),
    ),
    entry.actor !== undefined
      ? h(
          'span',
          {
            className: 'facetheory-stitch-log-stream-actor',
            style: {
              flexShrink: 0,
              fontWeight: 600,
              color: 'var(--stitch-color-on-surface-variant, #464553)',
            },
          },
          entry.actor,
        )
      : null,
    h(
      'span',
      {
        className: 'facetheory-stitch-log-stream-message',
        style: { minWidth: 0, overflowWrap: 'anywhere' },
      },
      entry.message,
    ),
  );
}

/**
 * Compact log/audit viewer. `plain` renders a dense timestamp/actor/message
 * row stack for audit panels; `terminal` adds window chrome and scroll
 * framing for repair/diagnostics surfaces. Colors come from Stitch token
 * variables so tenant themes re-skin levels consistently.
 */
export function LogStream(props: LogStreamProps): React.ReactElement {
  const {
    entries,
    variant = 'plain',
    title,
    formatTimestamp = defaultFormatTimestamp,
    maxHeight = '240px',
  } = props;

  const rows = entries.map((entry) => renderEntry(entry, formatTimestamp));
  const maxHeightValue =
    typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;

  if (variant === 'terminal') {
    return h(
      'div',
      {
        className:
          'facetheory-stitch-log-stream facetheory-stitch-log-stream-terminal',
        style: {
          background: 'var(--stitch-color-surface-container-lowest, #ffffff)',
          borderRadius: 'var(--stitch-radius-md, 8px)',
          overflow: 'hidden',
          fontFamily:
            'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)',
        },
      },
      h(
        'div',
        {
          className: 'facetheory-stitch-log-stream-chrome',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
            color: 'var(--stitch-color-on-surface-variant, #464553)',
            fontSize: '11px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          },
        },
        h('span', {
          'aria-hidden': 'true',
          style: {
            width: '8px',
            height: '8px',
            borderRadius: '9999px',
            background: 'var(--stitch-color-error, #ba1a1a)',
          },
        }),
        h('span', {
          'aria-hidden': 'true',
          style: {
            width: '8px',
            height: '8px',
            borderRadius: '9999px',
            background: 'var(--stitch-color-secondary, #6d5e0f)',
          },
        }),
        h('span', {
          'aria-hidden': 'true',
          style: {
            width: '8px',
            height: '8px',
            borderRadius: '9999px',
            background: 'var(--stitch-color-tertiary, #00332e)',
          },
        }),
        title !== undefined
          ? h('span', { style: { marginLeft: '8px' } }, title)
          : null,
      ),
      h(
        'div',
        {
          className: 'facetheory-stitch-log-stream-body',
          style: {
            padding: '12px 16px',
            maxHeight: maxHeightValue,
            overflowY: 'auto',
          },
        },
        ...rows,
      ),
    );
  }

  return h(
    'div',
    {
      className:
        'facetheory-stitch-log-stream facetheory-stitch-log-stream-plain',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      },
    },
    title !== undefined
      ? h(
          'div',
          {
            className: 'facetheory-stitch-log-stream-title',
            style: {
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--stitch-color-on-surface-variant, #464553)',
              marginBottom: '4px',
            },
          },
          title,
        )
      : null,
    ...rows,
  );
}
