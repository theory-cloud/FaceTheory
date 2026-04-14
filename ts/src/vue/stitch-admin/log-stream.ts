import { defineComponent, h } from 'vue';
import type { PropType, VNode, VNodeChild } from 'vue';

import type {
  LogEntry as SharedLogEntry,
  LogLevel,
} from '../../stitch-admin/log-types.js';
import { renderPropContent, vnodeChildProp } from '../stitch-common.js';

export type { LogLevel } from '../../stitch-admin/log-types.js';

export interface LogEntry extends Omit<SharedLogEntry, 'message' | 'actor'> {
  message: VNodeChild;
  actor?: VNodeChild;
}

export interface LogStreamProps {
  entries: LogEntry[];
  variant?: 'plain' | 'terminal';
  title?: VNodeChild;
  formatTimestamp?: (value: string | number) => string;
  maxHeight?: number | string;
}

const levelColor: Record<LogLevel, string> = {
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
): VNode {
  return h(
    'div',
    {
      key: entry.id,
      class: `facetheory-stitch-log-stream-row facetheory-stitch-log-stream-row-${entry.level}`,
      style: {
        display: 'flex',
        gap: '12px',
        alignItems: 'baseline',
        padding: '2px 0',
        color: levelColor[entry.level],
        fontSize: '12px',
        lineHeight: 1.5,
        fontVariantNumeric: 'tabular-nums',
      },
    },
    [
      h(
        'span',
        {
          class: 'facetheory-stitch-log-stream-timestamp',
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
              class: 'facetheory-stitch-log-stream-actor',
              style: {
                flexShrink: 0,
                fontWeight: 600,
                color: 'var(--stitch-color-on-surface-variant, #464553)',
              },
            },
            renderPropContent(entry.actor),
          )
        : null,
      h(
        'span',
        {
          class: 'facetheory-stitch-log-stream-message',
          style: { minWidth: 0, overflowWrap: 'anywhere' },
        },
        renderPropContent(entry.message),
      ),
    ],
  );
}

export const LogStream = defineComponent({
  name: 'FaceTheoryVueLogStream',
  props: {
    entries: {
      type: Array as PropType<LogEntry[]>,
      required: true,
    },
    variant: {
      type: String as PropType<'plain' | 'terminal'>,
      default: 'plain',
    },
    title: vnodeChildProp,
    formatTimestamp: {
      type: Function as PropType<
        ((value: string | number) => string) | undefined
      >,
      required: false,
    },
    maxHeight: {
      type: [Number, String] as PropType<number | string>,
      default: '240px',
    },
  },
  setup(props) {
    return () => {
      const formatTimestamp = props.formatTimestamp ?? defaultFormatTimestamp;
      const rows = props.entries.map((entry) =>
        renderEntry(entry, formatTimestamp),
      );
      const maxHeightValue =
        typeof props.maxHeight === 'number'
          ? `${props.maxHeight}px`
          : props.maxHeight;

      if (props.variant === 'terminal') {
        return h(
          'div',
          {
            class:
              'facetheory-stitch-log-stream facetheory-stitch-log-stream-terminal',
            style: {
              background: 'var(--stitch-color-surface-container-lowest, #ffffff)',
              borderRadius: 'var(--stitch-radius-md, 8px)',
              overflow: 'hidden',
              fontFamily:
                'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)',
            },
          },
          [
            h(
              'div',
              {
                class: 'facetheory-stitch-log-stream-chrome',
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
              [
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
                props.title !== undefined
                  ? h(
                      'span',
                      {
                        style: { marginLeft: '8px' },
                      },
                      renderPropContent(props.title),
                    )
                  : null,
              ],
            ),
            h(
              'div',
              {
                class: 'facetheory-stitch-log-stream-body',
                style: {
                  padding: '12px 16px',
                  maxHeight: maxHeightValue,
                  overflowY: 'auto',
                },
              },
              rows,
            ),
          ],
        );
      }

      return h(
        'div',
        {
          class: 'facetheory-stitch-log-stream facetheory-stitch-log-stream-plain',
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          },
        },
        [
          props.title !== undefined
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-log-stream-title',
                  style: {
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--stitch-color-on-surface-variant, #464553)',
                    marginBottom: '4px',
                  },
                },
                renderPropContent(props.title),
              )
            : null,
          ...rows,
        ],
      );
    };
  },
});
