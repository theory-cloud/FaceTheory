import * as React from 'react';
import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';

import type { NavItem } from './nav-types.js';

const h = React.createElement;

type MenuItemType = NonNullable<MenuProps['items']>[number];

function navToMenuItems(items: NavItem[]): MenuItemType[] {
  const out: MenuItemType[] = [];
  for (const item of items) {
    if (item.hidden) continue;
    const children =
      item.children && item.children.length > 0
        ? navToMenuItems(item.children)
        : undefined;
    const menuItem: Record<string, unknown> = {
      key: item.key,
      label: item.label,
    };
    if (item.icon !== undefined) menuItem.icon = item.icon;
    if (children && children.length > 0) menuItem.children = children;
    out.push(menuItem as unknown as MenuItemType);
  }
  return out;
}

function flattenKeyToPath(items: NavItem[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (list: NavItem[]) => {
    for (const item of list) {
      if (item.path !== undefined) map.set(item.key, item.path);
      if (item.children) walk(item.children);
    }
  };
  walk(items);
  return map;
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

  const items = React.useMemo(() => navToMenuItems(nav), [nav]);
  const keyToPath = React.useMemo(() => flattenKeyToPath(nav), [nav]);

  const handleClick: MenuProps['onClick'] = (info) => {
    const path = keyToPath.get(String(info.key));
    if (path !== undefined && onNavigate) onNavigate(path, String(info.key));
  };

  const menuProps: MenuProps = {
    mode: 'inline',
    items,
    onClick: handleClick,
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
  /** Left-aligned slot; typically the current page title or search. */
  left?: React.ReactNode;
  /** Center slot; typically contextual actions or filters. */
  center?: React.ReactNode;
  /** Right-aligned slot; typically the account/user menu. */
  right?: React.ReactNode;
}

export function Topbar(props: TopbarProps): React.ReactElement {
  const { left, center, right } = props;
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
    h('div', { style: { flex: 1, minWidth: 0 } }, left ?? null),
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
  if (topbarLeft !== undefined) topbarProps.left = topbarLeft;
  if (topbarCenter !== undefined) topbarProps.center = topbarCenter;
  if (topbarRight !== undefined) topbarProps.right = topbarRight;

  return h(
    Layout,
    {
      className: 'facetheory-stitch-shell',
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
