import * as React from 'react';
import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';

import type { NavItem } from './nav-types.js';

const h = React.createElement;

/**
 * True when `value` is a ReactNode that should produce visible output.
 *
 * Handles the statically detectable "nothing to render" shapes so optional
 * chrome wrappers do not leak into the SSR output when a caller composes
 * through any of:
 *
 *  - Scalar non-rendering children: `undefined`, `null`, `false`, `true`,
 *    `''` (the four values React treats as gaps plus the empty string
 *    which emits no visible output). This covers the common
 *    `cond && <Node />` and `cond && 'text'` idioms, which yield these
 *    scalars when the guard is falsy.
 *  - Arrays: renderable if *any* element is renderable (recursive). A
 *    `[false, null]` array collapses to no output.
 *  - Empty React Fragments: `<></>` and fragments whose children recurse
 *    to no renderable nodes.
 *
 * Limitation: React elements whose *component function* returns null
 * (e.g. `<OptionalBrand />` where `OptionalBrand` returns `null` based on
 * runtime state) cannot be detected here without invoking the component's
 * render function, which would double-run hooks and side effects. For
 * that case, callers should compose conditionally at the call site
 * (`logo={shouldShow && <OptionalBrand />}`) so the falsy value hits
 * this helper directly.
 */
function isRenderableNode(value: React.ReactNode): boolean {
  if (
    value === undefined ||
    value === null ||
    value === false ||
    value === true ||
    value === ''
  ) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(isRenderableNode);
  }
  if (React.isValidElement(value) && value.type === React.Fragment) {
    const children = (value.props as { children?: React.ReactNode }).children;
    return isRenderableNode(children);
  }
  return true;
}

type MenuItemType = NonNullable<MenuProps['items']>[number];

function renderNavLabel(
  item: NavItem,
  onNavigate: ((path: string, key: string) => void) | undefined,
): React.ReactNode {
  const path = item.path;
  if (path === undefined) return item.label;

  const anchorProps: React.AnchorHTMLAttributes<HTMLAnchorElement> = {
    href: path,
  };
  if (onNavigate !== undefined) {
    anchorProps.onClick = (event) => {
      event.preventDefault();
      onNavigate(path, item.key);
    };
  }

  return h('a', anchorProps, item.label);
}

function navToMenuItems(
  items: NavItem[],
  onNavigate: ((path: string, key: string) => void) | undefined,
): MenuItemType[] {
  const out: MenuItemType[] = [];
  for (const item of items) {
    if (item.hidden) continue;
    const children =
      item.children && item.children.length > 0
        ? navToMenuItems(item.children, onNavigate)
        : undefined;
    const menuItem: Record<string, unknown> = {
      key: item.key,
      label: renderNavLabel(item, onNavigate),
    };
    if (item.icon !== undefined) menuItem.icon = item.icon;
    if (children && children.length > 0) menuItem.children = children;
    out.push(menuItem as unknown as MenuItemType);
  }
  return out;
}

export interface SidebarProps {
  nav: NavItem[];
  activeKey?: string;
  openKeys?: string[];
  collapsed?: boolean;
  onNavigate?: (path: string, key: string) => void;
  /** Brand slot rendered at the top of the sidebar. */
  brand?: React.ReactNode;
  /** Footer slot rendered at the bottom of the sidebar. */
  footer?: React.ReactNode;
}

export function Sidebar(props: SidebarProps): React.ReactElement {
  const { nav, activeKey, openKeys, collapsed, onNavigate, brand, footer } =
    props;

  const items = React.useMemo(() => navToMenuItems(nav, onNavigate), [nav, onNavigate]);

  const menuProps: MenuProps = {
    mode: 'inline',
    items,
    style: { borderInlineEnd: 'none', background: 'transparent' },
  };
  if (activeKey !== undefined) menuProps.selectedKeys = [activeKey];
  if (openKeys !== undefined) menuProps.openKeys = openKeys;

  return h(
    Layout.Sider,
    {
      width: 264,
      collapsedWidth: 72,
      collapsible: true,
      trigger: null,
      collapsed: collapsed ?? false,
      style: { display: 'flex', flexDirection: 'column' },
    },
    h(
      'div',
      {
        className: 'facetheory-stitch-sidebar',
        style: {
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: '16px 8px',
          gap: '12px',
        },
      },
      brand !== undefined
        ? h(
            'div',
            {
              className: 'facetheory-stitch-sidebar-brand',
              style: { padding: '8px 12px' },
            },
            brand,
          )
        : null,
      h(
        'div',
        {
          className: 'facetheory-stitch-sidebar-menu',
          style: { flex: 1, overflowY: 'auto' },
        },
        h(Menu, menuProps),
      ),
      footer !== undefined
        ? h(
            'div',
            {
              className: 'facetheory-stitch-sidebar-footer',
              style: { padding: '8px 12px' },
            },
            footer,
          )
        : null,
    ),
  );
}

export interface TopbarProps {
  /**
   * Brand logo slot, rendered at the far left of the bar. Brand-agnostic:
   * accepts any ReactNode (icon, img, component). Rendered before
   * `surfaceLabel` and `left`, in that order.
   */
  logo?: React.ReactNode;
  /**
   * Surface label slot (for example a "surface chip" identifying Core / MCP /
   * Auth or any consumer-defined classification). Rendered immediately to the
   * right of `logo` and before `left`. FaceTheory provides the slot only and
   * makes no styling claims about the chip itself.
   */
  surfaceLabel?: React.ReactNode;
  /** Left-aligned slot; typically the current page title or search. */
  left?: React.ReactNode;
  /** Center slot; typically contextual actions or filters. */
  center?: React.ReactNode;
  /** Right-aligned slot; typically the account/user menu. */
  right?: React.ReactNode;
}

export function Topbar(props: TopbarProps): React.ReactElement {
  const { logo, surfaceLabel, left, center, right } = props;
  return h(
    Layout.Header,
    {
      className: 'facetheory-stitch-topbar',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '0 32px',
        height: 64,
        lineHeight: 'normal',
      },
    },
    h(
      'div',
      {
        className: 'facetheory-stitch-topbar-left',
        style: {
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        },
      },
      isRenderableNode(logo)
        ? h(
            'div',
            {
              className: 'facetheory-stitch-topbar-logo',
              style: { display: 'flex', alignItems: 'center' },
            },
            logo,
          )
        : null,
      isRenderableNode(surfaceLabel)
        ? h(
            'div',
            {
              className: 'facetheory-stitch-topbar-surface-label',
              style: { display: 'flex', alignItems: 'center' },
            },
            surfaceLabel,
          )
        : null,
      isRenderableNode(left)
        ? h('div', { style: { minWidth: 0 } }, left)
        : null,
    ),
    h(
      'div',
      { style: { flex: 1, display: 'flex', justifyContent: 'center' } },
      center ?? null,
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
      right ?? null,
    ),
  );
}

export interface ShellProps {
  nav: NavItem[];
  activeKey?: string;
  openKeys?: string[];
  collapsed?: boolean;
  onNavigate?: (path: string, key: string) => void;
  brand?: React.ReactNode;
  sidebarFooter?: React.ReactNode;
  /** Passes through to Topbar `logo`. Brand-agnostic. */
  topbarLogo?: React.ReactNode;
  /** Passes through to Topbar `surfaceLabel`. Brand-agnostic. */
  topbarSurfaceLabel?: React.ReactNode;
  topbarLeft?: React.ReactNode;
  topbarCenter?: React.ReactNode;
  topbarRight?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The root control-plane shell. Composes a Sidebar, a Topbar, and a content
 * region. Consumers are responsible for wiring routing — the shell takes
 * `activeKey` and `onNavigate` rather than touching a router directly so it
 * stays router-agnostic.
 */
export function Shell(props: ShellProps): React.ReactElement {
  const {
    nav,
    activeKey,
    openKeys,
    collapsed,
    onNavigate,
    brand,
    sidebarFooter,
    topbarLogo,
    topbarSurfaceLabel,
    topbarLeft,
    topbarCenter,
    topbarRight,
    children,
  } = props;

  const sidebarProps: SidebarProps = { nav };
  if (activeKey !== undefined) sidebarProps.activeKey = activeKey;
  if (openKeys !== undefined) sidebarProps.openKeys = openKeys;
  if (collapsed !== undefined) sidebarProps.collapsed = collapsed;
  if (onNavigate !== undefined) sidebarProps.onNavigate = onNavigate;
  if (brand !== undefined) sidebarProps.brand = brand;
  if (sidebarFooter !== undefined) sidebarProps.footer = sidebarFooter;

  const topbarProps: TopbarProps = {};
  if (topbarLogo !== undefined) topbarProps.logo = topbarLogo;
  if (topbarSurfaceLabel !== undefined)
    topbarProps.surfaceLabel = topbarSurfaceLabel;
  if (topbarLeft !== undefined) topbarProps.left = topbarLeft;
  if (topbarCenter !== undefined) topbarProps.center = topbarCenter;
  if (topbarRight !== undefined) topbarProps.right = topbarRight;

  return h(
    Layout,
    {
      className: 'facetheory-stitch-shell',
      hasSider: true,
      style: { minHeight: '100vh' },
    },
    h(Sidebar, sidebarProps),
    h(
      Layout,
      null,
      h(Topbar, topbarProps),
      h(
        Layout.Content,
        {
          className: 'facetheory-stitch-shell-content',
          style: { padding: '0', overflow: 'auto' },
        },
        children,
      ),
    ),
  );
}
