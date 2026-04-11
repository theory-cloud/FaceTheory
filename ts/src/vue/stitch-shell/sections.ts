import { defineComponent, h } from 'vue';
import type { PropType } from 'vue';

import {
  renderDefaultSlot,
  renderPropContent,
  vnodeChildProp,
} from '../stitch-common.js';

const trendColor: Record<'up' | 'down' | 'flat', string> = {
  up: 'var(--stitch-color-tertiary, #00332e)',
  down: 'var(--stitch-color-error, #ba1a1a)',
  flat: 'var(--stitch-color-on-surface-variant, #464553)',
};

export const Section = defineComponent({
  name: 'FaceTheoryVueSection',
  props: {
    title: vnodeChildProp,
    description: vnodeChildProp,
    actions: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        {
          class: 'facetheory-stitch-section',
          style: { display: 'flex', flexDirection: 'column', gap: '12px' },
        },
        [
          props.title !== undefined ||
          props.description !== undefined ||
          props.actions !== undefined
            ? h(
                'header',
                {
                  class: 'facetheory-stitch-section-header',
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
                        gap: '2px',
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
          renderDefaultSlot(slots),
        ],
      );
  },
});

export const Panel = defineComponent({
  name: 'FaceTheoryVuePanel',
  props: {
    padded: { type: Boolean, default: true },
    elevated: { type: Boolean, default: true },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          class: 'facetheory-stitch-panel',
          style: {
            background: props.elevated
              ? 'var(--stitch-color-surface-container-lowest, #ffffff)'
              : 'var(--stitch-color-surface-container-low, #f2f3ff)',
            borderRadius: 'var(--stitch-radius-xl, 16px)',
            padding: props.padded ? '24px' : '0',
          },
        },
        renderDefaultSlot(slots),
      );
  },
});

export const StatCard = defineComponent({
  name: 'FaceTheoryVueStatCard',
  props: {
    label: { ...vnodeChildProp, required: true },
    value: { ...vnodeChildProp, required: true },
    delta: {
      type: Object as PropType<
        { value: unknown; trend?: 'up' | 'down' | 'flat' } | undefined
      >,
      required: false,
    },
    icon: vnodeChildProp,
  },
  setup(props) {
    return () =>
      h(
        Panel,
        { padded: true },
        {
          default: () =>
            h(
              'div',
              {
                class: 'facetheory-stitch-stat-card',
                style: {
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                },
              },
              [
                props.icon !== undefined
                  ? h(
                      'div',
                      {
                        class: 'facetheory-stitch-stat-card-icon',
                        style: { fontSize: '20px', flexShrink: 0 },
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
                      gap: '4px',
                      flex: 1,
                      minWidth: 0,
                    },
                  },
                  [
                    h(
                      'span',
                      {
                        class: 'facetheory-stitch-stat-card-label',
                        style: {
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          color:
                            'var(--stitch-color-on-surface-variant, #464553)',
                        },
                      },
                      renderPropContent(props.label),
                    ),
                    h(
                      'span',
                      {
                        class: 'facetheory-stitch-stat-card-value',
                        style: {
                          fontSize: '28px',
                          fontWeight: 600,
                          lineHeight: 1.2,
                          color: 'var(--stitch-color-on-surface, #131b2e)',
                        },
                      },
                      renderPropContent(props.value),
                    ),
                    props.delta !== undefined
                      ? h(
                          'span',
                          {
                            class: 'facetheory-stitch-stat-card-delta',
                            style: {
                              fontSize: '12px',
                              color: trendColor[props.delta.trend ?? 'flat'],
                            },
                          },
                          props.delta.value as any,
                        )
                      : null,
                  ],
                ),
              ],
            ),
        },
      );
  },
});

export const SummaryStrip = defineComponent({
  name: 'FaceTheoryVueSummaryStrip',
  props: {
    columns: {
      type: [Number, String] as unknown as PropType<number | 'auto'>,
      default: 'auto',
    },
  },
  setup(props, { slots }) {
    return () => {
      const gridTemplateColumns =
        props.columns === 'auto'
          ? 'repeat(auto-fit, minmax(220px, 1fr))'
          : `repeat(${props.columns}, 1fr)`;
      return h(
        'div',
        {
          class: 'facetheory-stitch-summary-strip',
          style: {
            display: 'grid',
            gridTemplateColumns,
            gap: '16px',
          },
        },
        renderDefaultSlot(slots),
      );
    };
  },
});
