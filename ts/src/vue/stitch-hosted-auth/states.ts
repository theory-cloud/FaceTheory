import { defineComponent, h } from 'vue';

import { renderPropContent, vnodeChildProp } from '../stitch-common.js';

export type AuthStateVariant = 'info' | 'success' | 'warning' | 'error';

interface VariantPalette {
  accent: string;
  surface: string;
  text: string;
}

const variantPalette: Record<AuthStateVariant, VariantPalette> = {
  info: {
    accent: 'var(--stitch-color-primary, #1f108e)',
    surface: 'var(--stitch-color-surface-container-lowest, #ffffff)',
    text: 'var(--stitch-color-on-surface, #131b2e)',
  },
  success: {
    accent: 'var(--stitch-color-tertiary, #00332e)',
    surface: 'var(--stitch-color-surface-container-lowest, #ffffff)',
    text: 'var(--stitch-color-on-surface, #131b2e)',
  },
  warning: {
    accent: 'var(--stitch-color-error, #ba1a1a)',
    surface: 'var(--stitch-color-surface-container-lowest, #ffffff)',
    text: 'var(--stitch-color-on-surface, #131b2e)',
  },
  error: {
    accent: 'var(--stitch-color-error, #ba1a1a)',
    surface: 'var(--stitch-color-error-container, #ffdad6)',
    text: 'var(--stitch-color-on-error-container, #93000a)',
  },
};

export const AuthStateCard = defineComponent({
  name: 'FaceTheoryVueAuthStateCard',
  props: {
    variant: {
      type: String as () => AuthStateVariant,
      default: 'info',
    },
    title: { ...vnodeChildProp, required: true },
    description: vnodeChildProp,
    icon: vnodeChildProp,
    actions: vnodeChildProp,
  },
  setup(props) {
    return () => {
      const palette = variantPalette[props.variant];

      return h(
        'div',
        {
          class: `facetheory-stitch-auth-state facetheory-stitch-auth-state-${props.variant}`,
          role:
            props.variant === 'error' || props.variant === 'warning'
              ? 'alert'
              : undefined,
          style: {
            width: '100%',
            maxWidth: '440px',
            background: palette.surface,
            color: palette.text,
            borderRadius: 'var(--stitch-radius-xl, 16px)',
            padding: '40px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            alignItems: 'center',
            textAlign: 'center',
            boxShadow: '0 24px 48px -12px rgba(19, 27, 46, 0.04)',
          },
        },
        [
          props.icon !== undefined
            ? h(
                'div',
                {
                  'aria-hidden': 'true',
                  style: {
                    width: '48px',
                    height: '48px',
                    borderRadius: '9999px',
                    background:
                      'var(--stitch-color-surface-container-low, #f2f3ff)',
                    color: palette.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                  },
                },
                renderPropContent(props.icon),
              )
            : null,
          h(
            'h1',
            {
              style: {
                margin: 0,
                fontSize: '22px',
                lineHeight: 1.2,
                fontFamily:
                  'var(--stitch-font-display, "Space Grotesk"), system-ui, sans-serif',
              },
            },
            renderPropContent(props.title),
          ),
          props.description !== undefined
            ? h(
                'p',
                { style: { margin: 0, fontSize: '14px', lineHeight: 1.5 } },
                renderPropContent(props.description),
              )
            : null,
          props.actions !== undefined
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-auth-state-actions',
                  style: {
                    display: 'flex',
                    gap: '12px',
                    marginTop: '8px',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
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
