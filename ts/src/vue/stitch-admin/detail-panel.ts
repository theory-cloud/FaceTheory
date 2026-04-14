import { defineComponent, h } from 'vue';
import type { PropType, VNodeChild } from 'vue';

import { renderPropContent, vnodeChildProp } from '../stitch-common.js';

export interface PropertyItem {
  key: string;
  label: VNodeChild;
  value: VNodeChild;
  span?: 'half' | 'full';
}

export const PropertyGrid = defineComponent({
  name: 'FaceTheoryVuePropertyGrid',
  props: {
    items: {
      type: Array as PropType<PropertyItem[]>,
      required: true,
    },
    columns: {
      type: Number,
      default: 2,
    },
  },
  setup(props) {
    return () =>
      h(
        'dl',
        {
          class: 'facetheory-stitch-property-grid',
          style: {
            display: 'grid',
            gridTemplateColumns: `repeat(${props.columns}, minmax(0, 1fr))`,
            columnGap: '24px',
            rowGap: '16px',
            margin: 0,
          },
        },
        props.items.map((item) =>
          h(
            'div',
            {
              key: item.key,
              style: {
                gridColumn:
                  item.span === 'full'
                    ? `1 / span ${props.columns}`
                    : undefined,
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                minWidth: 0,
              },
            },
            [
              h(
                'dt',
                {
                  style: {
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--stitch-color-on-surface-variant, #464553)',
                    margin: 0,
                  },
                },
                renderPropContent(item.label),
              ),
              h(
                'dd',
                {
                  style: {
                    margin: 0,
                    fontSize: '14px',
                    color: 'var(--stitch-color-on-surface, #131b2e)',
                    wordBreak: 'break-word',
                  },
                },
                renderPropContent(item.value),
              ),
            ],
          ),
        ),
      );
  },
});

export const DetailPanel = defineComponent({
  name: 'FaceTheoryVueDetailPanel',
  props: {
    title: vnodeChildProp,
    description: vnodeChildProp,
    actions: vnodeChildProp,
    properties: {
      type: Array as PropType<PropertyItem[]>,
      required: true,
    },
    columns: {
      type: Number,
      default: 2,
    },
  },
  setup(props) {
    return () =>
      h(
        'section',
        {
          class: 'facetheory-stitch-detail-panel',
          style: {
            background: 'var(--stitch-color-surface-container-lowest, #ffffff)',
            borderRadius: 'var(--stitch-radius-xl, 16px)',
            padding: '24px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          },
        },
        [
          props.title !== undefined ||
          props.description !== undefined ||
          props.actions !== undefined
            ? h(
                'header',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '16px',
                  },
                },
                [
                  h(
                    'div',
                    {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      },
                    },
                    [
                      props.title !== undefined
                        ? h(
                            'h2',
                            {
                              style: {
                                margin: 0,
                                fontSize: '18px',
                                lineHeight: 1.3,
                                color:
                                  'var(--stitch-color-on-surface, #131b2e)',
                              },
                            },
                            renderPropContent(props.title),
                          )
                        : null,
                      props.description !== undefined
                        ? h(
                            'p',
                            {
                              style: {
                                margin: 0,
                                fontSize: '13px',
                                color:
                                  'var(--stitch-color-on-surface-variant, #464553)',
                              },
                            },
                            renderPropContent(props.description),
                          )
                        : null,
                    ],
                  ),
                  props.actions !== undefined
                    ? h(
                        'div',
                        {
                          style: { display: 'flex', gap: '8px', flexShrink: 0 },
                        },
                        renderPropContent(props.actions),
                      )
                    : null,
                ],
              )
            : null,
          h(PropertyGrid, { items: props.properties, columns: props.columns }),
        ],
      );
  },
});
