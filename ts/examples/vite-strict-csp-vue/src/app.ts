import { defineComponent, h } from 'vue';

export interface StrictCspVueAppProps {
  page: 'home' | 'next';
  message: string;
  detail: string;
  logoUrl: string;
}

const NAV_ITEMS = [
  { href: '/', label: 'Home', page: 'home' as const },
  { href: '/next', label: 'Next', page: 'next' as const },
];

export const App = defineComponent({
  name: 'FaceTheoryStrictCspVueApp',
  props: {
    page: { type: String, required: true },
    message: { type: String, required: true },
    detail: { type: String, required: true },
    logoUrl: { type: String, required: true },
  },
  setup(props: StrictCspVueAppProps) {
    return () =>
      h(
        'main',
        {
          class: 'strict-csp-shell',
          'data-facetheory-view': '',
          'data-page': props.page,
        },
        [
          h(
            'section',
            {
              class: 'strict-csp-card',
              'aria-labelledby': 'strict-csp-title',
            },
            [
              h('img', {
                class: 'strict-csp-logo',
                src: props.logoUrl,
                alt: 'FaceTheory strict CSP',
              }),
              h('p', { class: 'strict-csp-eyebrow' }, 'FaceTheory strict CSP'),
              h(
                'h1',
                { id: 'strict-csp-title', class: 'strict-csp-title' },
                'Vue + Vite without inline output',
              ),
              h('p', { class: 'strict-csp-copy' }, `Hello ${props.message}`),
              h('p', { class: 'strict-csp-copy' }, props.detail),
              h(
                'nav',
                {
                  class: 'strict-csp-nav',
                  'aria-label': 'Strict CSP example pages',
                },
                NAV_ITEMS.map((item) =>
                  h(
                    'a',
                    {
                      key: item.href,
                      class: 'strict-csp-link',
                      href: item.href,
                      'aria-current': item.page === props.page ? 'page' : undefined,
                    },
                    item.label,
                  ),
                ),
              ),
            ],
          ),
        ],
      );
  },
});
