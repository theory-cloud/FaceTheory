import { defineComponent, h } from 'vue';
import type { PropType } from 'vue';

import { renderDefaultSlot } from '../stitch-common.js';

export interface CopyableCodeProps {
  code: string;
  copyLabel?: string;
  size?: 'sm' | 'md';
  onCopy?: (code: string) => void;
}

function handleCopy(code: string, onCopy?: (code: string) => void): void {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.writeText === 'function'
  ) {
    void navigator.clipboard.writeText(code);
  }
  onCopy?.(code);
}

export const CopyableCode = defineComponent({
  name: 'FaceTheoryVueCopyableCode',
  props: {
    code: { type: String, required: true },
    copyLabel: { type: String, default: 'Copy' },
    size: {
      type: String as PropType<'sm' | 'md'>,
      default: 'md',
    },
    onCopy: {
      type: Function as PropType<((code: string) => void) | undefined>,
      required: false,
    },
  },
  setup(props, { slots }) {
    return () => {
      const padding = props.size === 'sm' ? '2px 8px' : '4px 10px';
      const fontSize = props.size === 'sm' ? '11px' : '12px';
      const visibleContent = renderDefaultSlot(slots);

      return h(
        'span',
        {
          class: 'facetheory-stitch-copyable-code',
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
        [
          h(
            'code',
            {
              class: 'facetheory-stitch-copyable-code-value',
              style: {
                fontFamily: 'inherit',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              },
            },
            visibleContent.length > 0 ? visibleContent : props.code,
          ),
          h(
            'button',
            {
              type: 'button',
              'aria-label': props.copyLabel,
              class: 'facetheory-stitch-copyable-code-button',
              onClick: () => handleCopy(props.code, props.onCopy),
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
            },
            props.copyLabel,
          ),
        ],
      );
    };
  },
});
