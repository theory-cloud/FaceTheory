import { defineComponent, h } from 'vue';

import {
  renderDefaultSlot,
  renderPropContent,
  vnodeChildProp,
} from '../stitch-common.js';

export const ConsentItem = defineComponent({
  name: 'FaceTheoryVueConsentItem',
  props: {
    label: { ...vnodeChildProp, required: true },
    description: vnodeChildProp,
    icon: vnodeChildProp,
    granted: { type: Boolean, default: false },
  },
  setup(props) {
    return () =>
      h(
        'li',
        {
          class: 'facetheory-stitch-consent-item',
          style: {
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '12px 16px',
            background: props.granted
              ? 'var(--stitch-color-surface-container-low, #f2f3ff)'
              : 'var(--stitch-color-surface-container-lowest, #ffffff)',
            borderRadius: 'var(--stitch-radius-md, 6px)',
            opacity: props.granted ? 0.7 : 1,
          },
        },
        [
          props.icon !== undefined
            ? h(
                'span',
                {
                  'aria-hidden': 'true',
                  style: {
                    fontSize: '18px',
                    color: 'var(--stitch-color-primary, #1f108e)',
                    flexShrink: 0,
                    marginTop: '2px',
                  },
                },
                renderPropContent(props.icon),
              )
            : null,
          h(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                flex: 1,
              },
            },
            [
              h(
                'span',
                {
                  style: {
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--stitch-color-on-surface, #131b2e)',
                  },
                },
                renderPropContent(props.label),
              ),
              props.description !== undefined
                ? h(
                    'span',
                    {
                      style: {
                        fontSize: '12px',
                        color:
                          'var(--stitch-color-on-surface-variant, #464553)',
                      },
                    },
                    renderPropContent(props.description),
                  )
                : null,
            ],
          ),
        ],
      );
  },
});

export const ConsentList = defineComponent({
  name: 'FaceTheoryVueConsentList',
  setup(_props, { slots }) {
    return () =>
      h(
        'ul',
        {
          class: 'facetheory-stitch-consent-list',
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            margin: 0,
            padding: 0,
            listStyle: 'none',
          },
        },
        renderDefaultSlot(slots),
      );
  },
});
