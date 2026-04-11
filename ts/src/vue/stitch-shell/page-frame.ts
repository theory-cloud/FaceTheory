import { defineComponent, h } from 'vue';
import type { PropType } from 'vue';

import type { BreadcrumbNode } from './nav-types.js';
import {
  renderDefaultSlot,
  renderPropContent,
  vnodeChildProp,
} from '../stitch-common.js';

export const Breadcrumb = defineComponent({
  name: 'FaceTheoryVueBreadcrumb',
  props: {
    items: {
      type: Array as PropType<BreadcrumbNode[]>,
      required: true,
    },
    onNavigate: {
      type: Function as PropType<((node: BreadcrumbNode) => void) | undefined>,
      required: false,
    },
  },
  setup(props) {
    return () => {
      if (props.items.length === 0) return null;

      return h(
        'nav',
        {
          class: 'facetheory-stitch-breadcrumb',
          'aria-label': 'Breadcrumb',
        },
        props.items.map((node, index) => [
          index > 0
            ? h(
                'span',
                {
                  'aria-hidden': 'true',
                  style: {
                    margin: '0 8px',
                    color: 'var(--stitch-color-on-surface-variant, #464553)',
                  },
                },
                '›',
              )
            : null,
          node.path !== undefined && props.onNavigate
            ? h(
                'a',
                {
                  href: node.path,
                  onClick: (event: MouseEvent) => {
                    event.preventDefault();
                    props.onNavigate?.(node);
                  },
                },
                node.label,
              )
            : h('span', null, node.label),
        ]),
      );
    };
  },
});

export const PageTitle = defineComponent({
  name: 'FaceTheoryVuePageTitle',
  props: {
    description: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          class: 'facetheory-stitch-page-title',
          style: { display: 'flex', flexDirection: 'column', gap: '4px' },
        },
        [
          h(
            'h1',
            {
              style: { margin: 0, fontSize: '28px', lineHeight: 1.2 },
            },
            renderDefaultSlot(slots),
          ),
          props.description !== undefined
            ? h(
                'p',
                {
                  style: {
                    margin: 0,
                    fontSize: '14px',
                    color: 'var(--stitch-color-on-surface-variant, #464553)',
                  },
                },
                renderPropContent(props.description),
              )
            : null,
        ],
      );
  },
});

export const PageFrame = defineComponent({
  name: 'FaceTheoryVuePageFrame',
  props: {
    title: vnodeChildProp,
    description: vnodeChildProp,
    breadcrumbs: {
      type: Array as PropType<BreadcrumbNode[] | undefined>,
      required: false,
    },
    onBreadcrumbNavigate: {
      type: Function as PropType<((node: BreadcrumbNode) => void) | undefined>,
      required: false,
    },
    actions: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          class: 'facetheory-stitch-page-frame',
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            padding: '32px 48px',
          },
        },
        [
          props.breadcrumbs && props.breadcrumbs.length > 0
            ? h(Breadcrumb, {
                items: props.breadcrumbs,
                onNavigate: props.onBreadcrumbNavigate,
              })
            : null,
          props.title !== undefined || props.actions !== undefined
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-page-frame-header',
                  style: {
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '24px',
                  },
                },
                [
                  props.title !== undefined
                    ? h(
                        PageTitle,
                        { description: props.description },
                        { default: () => renderPropContent(props.title) },
                      )
                    : h('div'),
                  props.actions !== undefined
                    ? h(
                        'div',
                        {
                          class: 'facetheory-stitch-page-frame-actions',
                          style: {
                            display: 'flex',
                            gap: '12px',
                            flexShrink: 0,
                          },
                        },
                        renderPropContent(props.actions),
                      )
                    : null,
                ],
              )
            : null,
          h(
            'div',
            {
              class: 'facetheory-stitch-page-frame-body',
              style: { display: 'flex', flexDirection: 'column', gap: '24px' },
            },
            renderDefaultSlot(slots),
          ),
        ],
      );
  },
});
