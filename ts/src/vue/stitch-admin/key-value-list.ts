import { defineComponent, h } from 'vue';
import type { PropType, VNodeChild } from 'vue';

import { renderPropContent } from '../stitch-common.js';

export interface KeyValueEntry {
  key: string;
  label: VNodeChild;
  value: VNodeChild;
}

export interface InlineKeyValueListProps {
  entries: KeyValueEntry[];
  labelWidth?: number | string;
  valueMono?: boolean;
}

export const InlineKeyValueList = defineComponent({
  name: 'FaceTheoryVueInlineKeyValueList',
  props: {
    entries: {
      type: Array as PropType<KeyValueEntry[]>,
      required: true,
    },
    labelWidth: {
      type: [Number, String] as PropType<number | string>,
      default: '48px',
    },
    valueMono: {
      type: Boolean,
      default: true,
    },
  },
  setup(props) {
    return () => {
      const labelWidthValue =
        typeof props.labelWidth === 'number'
          ? `${props.labelWidth}px`
          : props.labelWidth;

      return h(
        'dl',
        {
          class: 'facetheory-stitch-inline-key-value-list',
          style: {
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          },
        },
        props.entries.map((entry) =>
          h(
            'div',
            {
              key: entry.key,
              class: 'facetheory-stitch-inline-key-value-list-row',
              style: {
                display: 'flex',
                alignItems: 'baseline',
                gap: '8px',
                minWidth: 0,
              },
            },
            [
              h(
                'dt',
                {
                  style: {
                    flex: `0 0 ${labelWidthValue}`,
                    margin: 0,
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--stitch-color-on-surface-variant, #464553)',
                  },
                },
                renderPropContent(entry.label),
              ),
              h(
                'dd',
                {
                  style: {
                    margin: 0,
                    minWidth: 0,
                    fontSize: '12px',
                    fontFamily: props.valueMono
                      ? 'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)'
                      : 'inherit',
                    color: 'var(--stitch-color-on-surface, #131b2e)',
                    overflowWrap: 'anywhere',
                  },
                },
                renderPropContent(entry.value),
              ),
            ],
          ),
        ),
      );
    };
  },
});
