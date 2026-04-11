import { defineComponent, h, ref } from 'vue';
import type { PropType } from 'vue';
import type { StatusVariant } from '../../stitch-admin/status-types.js';

import { renderPropContent, vnodeChildProp } from '../stitch-common.js';

export type { StatusVariant } from '../../stitch-admin/status-types.js';

interface StatusPalette {
  background: string;
  color: string;
  label: string;
}

const statusPalette: Record<StatusVariant, StatusPalette> = {
  active: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    label: 'Active',
  },
  pending: {
    background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
    color: 'var(--stitch-color-on-surface-variant, #464553)',
    label: 'Pending',
  },
  suspended: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    label: 'Suspended',
  },
  archived: {
    background: 'var(--stitch-color-surface-container, #eaedff)',
    color: 'var(--stitch-color-on-surface-variant, #464553)',
    label: 'Archived',
  },
  error: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    label: 'Error',
  },
  warning: {
    background: 'var(--stitch-color-secondary-container, #ffecc0)',
    color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    label: 'Warning',
  },
  allow: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    label: 'Allow',
  },
  deny: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    label: 'Deny',
  },
};

export const StatusTag = defineComponent({
  name: 'FaceTheoryVueStatusTag',
  props: {
    variant: {
      type: String as PropType<StatusVariant>,
      required: true,
    },
    label: vnodeChildProp,
  },
  setup(props) {
    return () => {
      const palette = statusPalette[props.variant];
      return h(
        'span',
        {
          class: `facetheory-stitch-status-tag facetheory-stitch-status-tag-${props.variant}`,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 10px',
            fontSize: '12px',
            fontWeight: 500,
            letterSpacing: '0.02em',
            borderRadius: '9999px',
            background: palette.background,
            color: palette.color,
          },
        },
        props.label !== undefined
          ? renderPropContent(props.label)
          : palette.label,
      );
    };
  },
});

export const DestructiveConfirm = defineComponent({
  name: 'FaceTheoryVueDestructiveConfirm',
  props: {
    title: { ...vnodeChildProp, required: true },
    description: vnodeChildProp,
    requireText: { type: String, required: false },
    confirmLabel: vnodeChildProp,
    cancelLabel: vnodeChildProp,
    onCancel: {
      type: Function as PropType<(() => void) | undefined>,
      required: false,
    },
    onConfirm: {
      type: Function as PropType<(() => void) | undefined>,
      required: false,
    },
    loading: { type: Boolean, default: false },
  },
  setup(props) {
    const typed = ref('');

    return () => {
      const confirmable =
        props.requireText === undefined || typed.value === props.requireText;

      return h(
        'div',
        {
          class: 'facetheory-stitch-destructive-confirm',
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            padding: '4px 0',
          },
        },
        [
          h(
            'div',
            {
              style: { display: 'flex', flexDirection: 'column', gap: '6px' },
            },
            [
              h(
                'h2',
                {
                  style: {
                    margin: 0,
                    fontSize: '18px',
                    color: 'var(--stitch-color-on-surface, #131b2e)',
                  },
                },
                renderPropContent(props.title),
              ),
              props.description !== undefined
                ? h(
                    'p',
                    {
                      style: {
                        margin: 0,
                        fontSize: '14px',
                        lineHeight: 1.5,
                        color:
                          'var(--stitch-color-on-surface-variant, #464553)',
                      },
                    },
                    renderPropContent(props.description),
                  )
                : null,
            ],
          ),
          props.requireText !== undefined
            ? h(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  },
                },
                [
                  h(
                    'label',
                    {
                      style: {
                        fontSize: '12px',
                        color:
                          'var(--stitch-color-on-surface-variant, #464553)',
                      },
                    },
                    `Type "${props.requireText}" to confirm`,
                  ),
                  h('input', {
                    value: typed.value,
                    placeholder: props.requireText,
                    'aria-label': `Type ${props.requireText} to confirm`,
                    onInput: (event: Event) => {
                      typed.value = (event.target as HTMLInputElement).value;
                    },
                    style: {
                      padding: '10px 12px',
                      borderRadius: 'var(--stitch-radius-md, 6px)',
                      border:
                        '1px solid var(--stitch-color-outline-variant, #c8c4d5)',
                    },
                  }),
                ],
              )
            : null,
          h(
            'div',
            {
              style: {
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                marginTop: '8px',
              },
            },
            [
              h(
                'button',
                {
                  type: 'button',
                  disabled: props.loading,
                  onClick: props.onCancel,
                  style: {
                    padding: '10px 14px',
                    borderRadius: 'var(--stitch-radius-md, 6px)',
                    border:
                      '1px solid var(--stitch-color-outline-variant, #c8c4d5)',
                    background: 'transparent',
                    cursor: props.loading ? 'default' : 'pointer',
                  },
                },
                props.cancelLabel !== undefined
                  ? renderPropContent(props.cancelLabel)
                  : 'Cancel',
              ),
              h(
                'button',
                {
                  type: 'button',
                  disabled: !confirmable || props.loading,
                  onClick: props.onConfirm,
                  style: {
                    padding: '10px 14px',
                    borderRadius: 'var(--stitch-radius-md, 6px)',
                    border: 'none',
                    background: 'var(--stitch-color-error, #ba1a1a)',
                    color: '#ffffff',
                    cursor:
                      !confirmable || props.loading ? 'default' : 'pointer',
                  },
                },
                props.loading
                  ? 'Loading…'
                  : props.confirmLabel !== undefined
                    ? renderPropContent(props.confirmLabel)
                    : 'Delete',
              ),
            ],
          ),
        ],
      );
    };
  },
});
