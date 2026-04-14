import { defineComponent, h } from 'vue';
import type { PropType, VNode } from 'vue';

import type { NavItem } from './nav-types.js';
import {
  renderDefaultSlot,
  renderPropContent,
  vnodeChildProp,
} from '../stitch-common.js';

function groupOpen(item: NavItem, openKeys: string[] | undefined): boolean {
  if (!item.children || item.children.length === 0) return false;
  if (openKeys === undefined) return true;
  return openKeys.includes(item.key);
}

function renderNavItems(
  items: NavItem[],
  activeKey: string | undefined,
  openKeys: string[] | undefined,
  onNavigate: ((path: string, key: string) => void) | undefined,
): VNode[] {
  return items
    .filter((item) => !item.hidden)
    .map((item) => {
      const active = item.key === activeKey;

      return h('li', { key: item.key, style: { listStyle: 'none' } }, [
        item.path !== undefined
          ? h(
              'a',
              {
                href: item.path,
                onClick: (event: MouseEvent) => {
                  if (!onNavigate) return;
                  event.preventDefault();
                  onNavigate(item.path!, item.key);
                },
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: 'var(--stitch-radius-lg, 12px)',
                  textDecoration: 'none',
                  background: active
                    ? 'var(--stitch-color-primary-fixed, #e2dfff)'
                    : 'transparent',
                  color: active
                    ? 'var(--stitch-color-on-primary-fixed, #0f0069)'
                    : 'var(--stitch-color-on-surface, #131b2e)',
                },
              },
              [
                item.icon !== undefined
                  ? h(
                      'span',
                      {
                        'aria-hidden': 'true',
                        style: { display: 'inline-flex' },
                      },
                      renderPropContent(item.icon),
                    )
                  : null,
                h('span', null, item.label),
              ],
            )
          : h(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  color: 'var(--stitch-color-on-surface-variant, #464553)',
                  fontSize: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                },
              },
              item.label,
            ),
        item.children && item.children.length > 0 && groupOpen(item, openKeys)
          ? h(
              'ul',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  margin: '4px 0 0 12px',
                  padding: 0,
                },
              },
              renderNavItems(item.children, activeKey, openKeys, onNavigate),
            )
          : null,
      ]);
    });
}

export const Sidebar = defineComponent({
  name: 'FaceTheoryVueSidebar',
  props: {
    nav: {
      type: Array as PropType<NavItem[]>,
      required: true,
    },
    activeKey: { type: String, required: false },
    openKeys: {
      type: Array as PropType<string[] | undefined>,
      required: false,
    },
    collapsed: { type: Boolean, default: false },
    onNavigate: {
      type: Function as PropType<
        ((path: string, key: string) => void) | undefined
      >,
      required: false,
    },
    brand: vnodeChildProp,
    footer: vnodeChildProp,
  },
  setup(props) {
    return () =>
      h(
        'aside',
        {
          class: 'facetheory-stitch-sidebar',
          style: {
            width: props.collapsed ? '72px' : '264px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
            padding: '16px 8px',
            gap: '12px',
            background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
          },
        },
        [
          props.brand !== undefined
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-sidebar-brand',
                  style: { padding: '8px 12px' },
                },
                renderPropContent(props.brand),
              )
            : null,
          h(
            'div',
            {
              class: 'facetheory-stitch-sidebar-menu',
              style: { flex: 1, overflowY: 'auto' },
            },
            h(
              'ul',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  margin: 0,
                  padding: 0,
                },
              },
              renderNavItems(
                props.nav,
                props.activeKey,
                props.openKeys,
                props.onNavigate,
              ),
            ),
          ),
          props.footer !== undefined
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-sidebar-footer',
                  style: { padding: '8px 12px' },
                },
                renderPropContent(props.footer),
              )
            : null,
        ],
      );
  },
});

export const Topbar = defineComponent({
  name: 'FaceTheoryVueTopbar',
  props: {
    left: vnodeChildProp,
    center: vnodeChildProp,
    right: vnodeChildProp,
  },
  setup(props) {
    return () =>
      h(
        'header',
        {
          class: 'facetheory-stitch-topbar',
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            padding: '0 32px',
            height: '64px',
            background: 'var(--stitch-color-surface, #faf8ff)',
          },
        },
        [
          h(
            'div',
            { style: { flex: 1, minWidth: 0 } },
            renderPropContent(props.left),
          ),
          h(
            'div',
            { style: { flex: 1, display: 'flex', justifyContent: 'center' } },
            renderPropContent(props.center),
          ),
          h(
            'div',
            {
              style: {
                flex: 1,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
              },
            },
            renderPropContent(props.right),
          ),
        ],
      );
  },
});

export const Shell = defineComponent({
  name: 'FaceTheoryVueShell',
  props: {
    nav: {
      type: Array as PropType<NavItem[]>,
      required: true,
    },
    activeKey: { type: String, required: false },
    openKeys: {
      type: Array as PropType<string[] | undefined>,
      required: false,
    },
    collapsed: { type: Boolean, default: false },
    onNavigate: {
      type: Function as PropType<
        ((path: string, key: string) => void) | undefined
      >,
      required: false,
    },
    brand: vnodeChildProp,
    sidebarFooter: vnodeChildProp,
    topbarLeft: vnodeChildProp,
    topbarCenter: vnodeChildProp,
    topbarRight: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          class: 'facetheory-stitch-shell',
          style: {
            minHeight: '100vh',
            display: 'flex',
            background: 'var(--stitch-color-background, #faf8ff)',
          },
        },
        [
          h(Sidebar, {
            nav: props.nav,
            collapsed: props.collapsed,
            ...(props.activeKey !== undefined
              ? { activeKey: props.activeKey }
              : {}),
            ...(props.openKeys !== undefined
              ? { openKeys: props.openKeys }
              : {}),
            ...(props.onNavigate !== undefined
              ? { onNavigate: props.onNavigate }
              : {}),
            ...(props.brand !== undefined ? { brand: props.brand } : {}),
            ...(props.sidebarFooter !== undefined
              ? { footer: props.sidebarFooter }
              : {}),
          }),
          h(
            'div',
            {
              style: {
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
              },
            },
            [
              h(Topbar, {
                left: props.topbarLeft,
                center: props.topbarCenter,
                right: props.topbarRight,
              }),
              h(
                'main',
                {
                  class: 'facetheory-stitch-shell-content',
                  style: { padding: '0', overflow: 'auto', flex: 1 },
                },
                renderDefaultSlot(slots),
              ),
            ],
          ),
        ],
      );
  },
});
