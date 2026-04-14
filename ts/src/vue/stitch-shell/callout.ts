import { defineComponent, h } from 'vue';
import type { PropType } from 'vue';

import type { CalloutVariant } from '../../stitch-shell/callout-types.js';
import {
  renderDefaultSlot,
  renderPropContent,
  vnodeChildProp,
} from '../stitch-common.js';

export type { CalloutVariant } from '../../stitch-shell/callout-types.js';

export interface CalloutProps {
  variant?: CalloutVariant;
}

interface CalloutPalette {
  accent: string;
  background: string;
  color: string;
}

const palette: Record<CalloutVariant, CalloutPalette> = {
  info: {
    accent: 'var(--stitch-color-primary, #3a48c8)',
    background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
    color: 'var(--stitch-color-on-surface, #131b2e)',
  },
  success: {
    accent: 'var(--stitch-color-tertiary, #00332e)',
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
  },
  warning: {
    accent: 'var(--stitch-color-secondary, #6d5e0f)',
    background: 'var(--stitch-color-secondary-container, #ffecc0)',
    color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
  },
  danger: {
    accent: 'var(--stitch-color-error, #ba1a1a)',
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
  },
};

export const Callout = defineComponent({
  name: 'FaceTheoryVueCallout',
  props: {
    variant: {
      type: String as PropType<CalloutVariant>,
      default: 'info',
    },
    title: vnodeChildProp,
    icon: vnodeChildProp,
    actions: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () => {
      const current = palette[props.variant];
      const body = renderDefaultSlot(slots);

      return h(
        'div',
        {
          class: `facetheory-stitch-callout facetheory-stitch-callout-${props.variant}`,
          role:
            props.variant === 'danger' || props.variant === 'warning'
              ? 'alert'
              : 'note',
          style: {
            display: 'flex',
            gap: '12px',
            padding: '12px 16px',
            borderLeft: `3px solid ${current.accent}`,
            background: current.background,
            color: current.color,
            borderTopRightRadius: 'var(--stitch-radius-md, 8px)',
            borderBottomRightRadius: 'var(--stitch-radius-md, 8px)',
          },
        },
        [
          props.icon !== undefined
            ? h(
                'span',
                {
                  class: 'facetheory-stitch-callout-icon',
                  'aria-hidden': 'true',
                  style: {
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: current.accent,
                    fontSize: '18px',
                    lineHeight: 1,
                    marginTop: '2px',
                  },
                },
                renderPropContent(props.icon),
              )
            : null,
          h(
            'div',
            {
              class: 'facetheory-stitch-callout-body',
              style: {
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              },
            },
            [
              props.title !== undefined
                ? h(
                    'p',
                    {
                      class: 'facetheory-stitch-callout-title',
                      style: {
                        margin: 0,
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'inherit',
                      },
                    },
                    renderPropContent(props.title),
                  )
                : null,
              body.length > 0
                ? h(
                    'div',
                    {
                      class: 'facetheory-stitch-callout-content',
                      style: {
                        fontSize: '13px',
                        lineHeight: 1.5,
                        color: 'inherit',
                      },
                    },
                    body,
                  )
                : null,
            ],
          ),
          props.actions !== undefined
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-callout-actions',
                  style: {
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  },
                },
                renderPropContent(props.actions),
              )
            : null,
        ],
      );
    };
  },
});
