import { defineComponent, h } from 'vue';

import {
  renderDefaultSlot,
  renderPropContent,
  vnodeChildProp,
} from '../stitch-common.js';

export const AuthPageLayout = defineComponent({
  name: 'FaceTheoryVueAuthPageLayout',
  props: {
    brand: vnodeChildProp,
    background: {
      type: String as () => 'surface' | 'gradient',
      default: 'surface',
    },
    footer: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () => {
      const backgroundStyle =
        props.background === 'gradient'
          ? {
              background:
                'linear-gradient(135deg, var(--stitch-color-primary, #1f108e) 0%, var(--stitch-color-primary-container, #3730a3) 100%)',
            }
          : {
              background: 'var(--stitch-color-surface, #faf8ff)',
            };

      return h(
        'div',
        {
          class: 'facetheory-stitch-auth-page',
          style: {
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            ...backgroundStyle,
          },
        },
        [
          props.brand !== undefined
            ? h(
                'header',
                {
                  class: 'facetheory-stitch-auth-page-brand',
                  style: { padding: '24px 32px' },
                },
                renderPropContent(props.brand),
              )
            : null,
          h(
            'main',
            {
              class: 'facetheory-stitch-auth-page-main',
              style: {
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
              },
            },
            renderDefaultSlot(slots),
          ),
          props.footer !== undefined
            ? h(
                'footer',
                {
                  class: 'facetheory-stitch-auth-page-footer',
                  style: {
                    padding: '16px 32px 24px',
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '16px',
                  },
                },
                renderPropContent(props.footer),
              )
            : null,
        ],
      );
    };
  },
});

export const AuthCard = defineComponent({
  name: 'FaceTheoryVueAuthCard',
  props: {
    title: { ...vnodeChildProp, required: true },
    description: vnodeChildProp,
    headerAction: vnodeChildProp,
    footer: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          class: 'facetheory-stitch-auth-card',
          style: {
            width: '100%',
            maxWidth: '440px',
            background: 'var(--stitch-color-surface-container-lowest, #ffffff)',
            borderRadius: 'var(--stitch-radius-xl, 16px)',
            padding: '40px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            boxShadow: '0 24px 48px -12px rgba(19, 27, 46, 0.04)',
          },
        },
        [
          h(
            'header',
            {
              class: 'facetheory-stitch-auth-card-header',
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
                    gap: '6px',
                  },
                },
                [
                  h(
                    'h1',
                    {
                      style: {
                        margin: 0,
                        fontSize: '24px',
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
                        {
                          style: {
                            margin: 0,
                            fontSize: '14px',
                            lineHeight: 1.4,
                            color:
                              'var(--stitch-color-on-surface-variant, #464553)',
                          },
                        },
                        renderPropContent(props.description),
                      )
                    : null,
                ],
              ),
              props.headerAction !== undefined
                ? h(
                    'div',
                    { style: { flexShrink: 0 } },
                    renderPropContent(props.headerAction),
                  )
                : null,
            ],
          ),
          h(
            'div',
            {
              class: 'facetheory-stitch-auth-card-body',
              style: { display: 'flex', flexDirection: 'column', gap: '16px' },
            },
            renderDefaultSlot(slots),
          ),
          props.footer !== undefined
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-auth-card-footer',
                  style: {
                    display: 'flex',
                    justifyContent: 'center',
                    fontSize: '13px',
                  },
                },
                renderPropContent(props.footer),
              )
            : null,
        ],
      );
  },
});
