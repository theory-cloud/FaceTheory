import { defineComponent, h } from 'vue';
import type { PropType, VNodeChild } from 'vue';

import type { FilterChipConfig as SharedFilterChipConfig } from '../../stitch-admin/filter-types.js';
import {
  renderPropContent,
  vnodeChildProp,
} from '../stitch-common.js';

export interface FilterChipConfig extends Omit<
  SharedFilterChipConfig,
  'label'
> {
  label: VNodeChild;
}

export interface FilterChipProps
  extends Omit<FilterChipConfig, 'key'> {
  onClick?: () => void;
  onRemove?: () => void;
}

export interface FilterChipGroupProps {
  chips: FilterChipConfig[];
  onChipClick?: (key: string) => void;
  onChipRemove?: (key: string) => void;
  trailing?: VNodeChild;
}

const chipBaseClass = 'facetheory-stitch-filter-chip';

export const FilterChip = defineComponent({
  name: 'FaceTheoryVueFilterChip',
  props: {
    label: { ...vnodeChildProp, required: true },
    count: { type: Number, required: false },
    active: { type: Boolean, default: true },
    removable: { type: Boolean, default: true },
    onClick: {
      type: Function as PropType<(() => void) | undefined>,
      required: false,
    },
    onRemove: {
      type: Function as PropType<(() => void) | undefined>,
      required: false,
    },
  },
  setup(props) {
    return () => {
      const colors = props.active
        ? {
            background: 'var(--stitch-color-primary-container, #e0e0ff)',
            color: 'var(--stitch-color-on-primary-container, #000066)',
          }
        : {
            background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
            color: 'var(--stitch-color-on-surface-variant, #464553)',
          };

      return h(
        'span',
        {
          class: chipBaseClass,
          style: { display: 'inline-flex', alignItems: 'center' },
        },
        [
          h(
            'button',
            {
              type: 'button',
              class: `${chipBaseClass}-body`,
              onClick: props.onClick,
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 500,
                lineHeight: 1.4,
                background: colors.background,
                color: colors.color,
                border: 'none',
                borderRadius: '9999px',
                cursor: props.onClick !== undefined ? 'pointer' : 'default',
              },
            },
            [
              h('span', null, renderPropContent(props.label)),
              props.count !== undefined
                ? h(
                    'span',
                    {
                      class: `${chipBaseClass}-count`,
                      style: {
                        fontVariantNumeric: 'tabular-nums',
                        opacity: 0.75,
                      },
                    },
                    String(props.count),
                  )
                : null,
            ],
          ),
          props.removable
            ? h(
                'button',
                {
                  type: 'button',
                  'aria-label': 'Remove filter',
                  class: `${chipBaseClass}-remove`,
                  onClick: (event: MouseEvent) => {
                    event.stopPropagation();
                    props.onRemove?.();
                  },
                  style: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '16px',
                    height: '16px',
                    marginLeft: '4px',
                    fontSize: '12px',
                    lineHeight: 1,
                    color: 'inherit',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '9999px',
                    cursor: 'pointer',
                  },
                },
                '×',
              )
            : null,
        ],
      );
    };
  },
});

export const FilterChipGroup = defineComponent({
  name: 'FaceTheoryVueFilterChipGroup',
  props: {
    chips: {
      type: Array as PropType<FilterChipConfig[]>,
      required: true,
    },
    onChipClick: {
      type: Function as PropType<((key: string) => void) | undefined>,
      required: false,
    },
    onChipRemove: {
      type: Function as PropType<((key: string) => void) | undefined>,
      required: false,
    },
    trailing: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () => {
      const trailing =
        slots.trailing?.() ?? renderPropContent(props.trailing);

      return h(
        'div',
        {
          class: 'facetheory-stitch-filter-chip-group',
          style: {
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px',
          },
        },
        [
          ...props.chips.map((chip) => {
            const chipProps: FilterChipProps = {
              label: chip.label,
              active: chip.active ?? true,
              removable: chip.removable ?? true,
            };
            if (chip.count !== undefined) chipProps.count = chip.count;
            if (props.onChipClick !== undefined) {
              chipProps.onClick = () => {
                props.onChipClick?.(chip.key);
              };
            }
            if (props.onChipRemove !== undefined) {
              chipProps.onRemove = () => {
                props.onChipRemove?.(chip.key);
              };
            }

            return h(FilterChip, { ...chipProps, key: chip.key });
          }),
          trailing.length > 0
            ? h(
                'span',
                {
                  class: 'facetheory-stitch-filter-chip-group-trailing',
                  style: { marginLeft: 'auto', display: 'inline-flex' },
                },
                trailing,
              )
            : null,
        ],
      );
    };
  },
});
