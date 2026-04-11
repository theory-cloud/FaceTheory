import { defineComponent, h } from 'vue';

import {
  renderDefaultSlot,
  renderPropContent,
  vnodeChildProp,
} from '../stitch-common.js';

export const FormRow = defineComponent({
  name: 'FaceTheoryVueFormRow',
  props: {
    label: { ...vnodeChildProp, required: true },
    description: vnodeChildProp,
    required: { type: Boolean, default: false },
    error: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          class: 'facetheory-stitch-form-row',
          style: {
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 280px) 1fr',
            columnGap: '32px',
            rowGap: '8px',
            alignItems: 'start',
          },
        },
        [
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
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
                [
                  renderPropContent(props.label),
                  props.required
                    ? h(
                        'span',
                        {
                          'aria-hidden': 'true',
                          style: {
                            color: 'var(--stitch-color-error, #ba1a1a)',
                            marginLeft: '4px',
                          },
                        },
                        '*',
                      )
                    : null,
                ],
              ),
              props.description !== undefined
                ? h(
                    'span',
                    {
                      style: {
                        fontSize: '12px',
                        color:
                          'var(--stitch-color-on-surface-variant, #464553)',
                        lineHeight: 1.5,
                      },
                    },
                    renderPropContent(props.description),
                  )
                : null,
            ],
          ),
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            [
              renderDefaultSlot(slots),
              props.error !== undefined
                ? h(
                    'span',
                    {
                      role: 'alert',
                      style: {
                        fontSize: '12px',
                        color: 'var(--stitch-color-error, #ba1a1a)',
                      },
                    },
                    renderPropContent(props.error),
                  )
                : null,
            ],
          ),
        ],
      );
  },
});

export const SplitForm = defineComponent({
  name: 'FaceTheoryVueSplitForm',
  setup(_props, { slots }) {
    return () =>
      h(
        'div',
        {
          class: 'facetheory-stitch-split-form',
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '32px',
          },
        },
        renderDefaultSlot(slots),
      );
  },
});

export const FormSection = defineComponent({
  name: 'FaceTheoryVueFormSection',
  props: {
    title: vnodeChildProp,
    description: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          class: 'facetheory-stitch-form-section',
          style: { display: 'flex', flexDirection: 'column', gap: '16px' },
        },
        [
          props.title !== undefined || props.description !== undefined
            ? h(
                'header',
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
                        'h3',
                        {
                          style: {
                            margin: 0,
                            fontSize: '15px',
                            color: 'var(--stitch-color-on-surface, #131b2e)',
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
              )
            : null,
          h(
            'div',
            {
              style: { display: 'flex', flexDirection: 'column', gap: '24px' },
            },
            renderDefaultSlot(slots),
          ),
        ],
      );
  },
});
