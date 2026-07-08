import { defineComponent, h } from 'vue';

import {
  authStateClassName,
  authStateRole,
  authStateVariantPalette,
} from '../../stitch-hosted-auth/index.js';
import type { AuthStateVariant } from '../../stitch-hosted-auth/index.js';

import { renderPropContent, vnodeChildProp } from '../stitch-common.js';

export type { AuthStateVariant } from '../../stitch-hosted-auth/index.js';

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
      const palette = authStateVariantPalette(props.variant);

      return h(
        'div',
        {
          class: authStateClassName(props.variant),
          role: authStateRole(props.variant),
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
