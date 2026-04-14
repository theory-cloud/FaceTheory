import { defineComponent, h } from 'vue';
import type { PropType } from 'vue';

import {
  renderDefaultSlot,
  renderPropContent,
  vnodeChildProp,
} from '../stitch-common.js';

export interface AuthFlowStep {
  key: string;
  label: string;
  description?: unknown;
}

export const AuthFlowStepper = defineComponent({
  name: 'FaceTheoryVueAuthFlowStepper',
  props: {
    steps: {
      type: Array as PropType<AuthFlowStep[]>,
      required: true,
    },
    currentIndex: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h(
        'ol',
        {
          class: 'facetheory-stitch-auth-flow-stepper',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: 0,
            padding: 0,
            listStyle: 'none',
          },
        },
        props.steps.map((step, index) => {
          const isCurrent = index === props.currentIndex;
          const isCompleted = index < props.currentIndex;
          const dotColor =
            isCompleted || isCurrent
              ? 'var(--stitch-color-primary, #1f108e)'
              : 'var(--stitch-color-surface-container-high, #e2e7ff)';
          const labelColor = isCurrent
            ? 'var(--stitch-color-on-surface, #131b2e)'
            : 'var(--stitch-color-on-surface-variant, #464553)';

          return h(
            'li',
            {
              key: step.key,
              'aria-current': isCurrent ? 'step' : undefined,
              style: { display: 'flex', alignItems: 'center', gap: '8px' },
            },
            [
              h('span', {
                'aria-hidden': 'true',
                style: {
                  width: '10px',
                  height: '10px',
                  borderRadius: '9999px',
                  background: dotColor,
                  display: 'inline-block',
                },
              }),
              h(
                'span',
                {
                  style: {
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: labelColor,
                    fontWeight: isCurrent ? 600 : 400,
                  },
                },
                step.label,
              ),
            ],
          );
        }),
      );
  },
});

export const AuthFlowSection = defineComponent({
  name: 'FaceTheoryVueAuthFlowSection',
  props: {
    eyebrow: vnodeChildProp,
    title: vnodeChildProp,
    description: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          class: 'facetheory-stitch-auth-flow-section',
          style: { display: 'flex', flexDirection: 'column', gap: '16px' },
        },
        [
          props.eyebrow !== undefined
            ? h(
                'span',
                {
                  style: {
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--stitch-color-on-surface-variant, #464553)',
                  },
                },
                renderPropContent(props.eyebrow),
              )
            : null,
          props.title !== undefined
            ? h(
                'h2',
                {
                  style: {
                    margin: 0,
                    fontSize: '18px',
                    lineHeight: 1.3,
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
                    fontSize: '14px',
                    lineHeight: 1.5,
                    color: 'var(--stitch-color-on-surface-variant, #464553)',
                  },
                },
                renderPropContent(props.description),
              )
            : null,
          h(
            'div',
            {
              style: { display: 'flex', flexDirection: 'column', gap: '12px' },
            },
            renderDefaultSlot(slots),
          ),
        ],
      );
  },
});
