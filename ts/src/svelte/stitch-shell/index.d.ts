import type { Component } from 'svelte';

export type { NavItem, BreadcrumbNode, ResolvedNav } from './nav-types.js';
export { resolveActiveNav } from '../../stitch-shell/index.js';

export interface SidebarProps {
  nav: import('./nav-types.js').NavItem[];
  activeKey?: string;
  openKeys?: string[];
  collapsed?: boolean;
  onNavigate?: (path: string, key: string) => void;
}

export interface TopbarProps {}

export interface ShellProps extends SidebarProps {}

export interface BreadcrumbProps {
  items: import('./nav-types.js').BreadcrumbNode[];
  onNavigate?: (node: import('./nav-types.js').BreadcrumbNode) => void;
}

export interface PageTitleProps {
  description?: unknown;
}

export interface PageFrameProps {
  title?: unknown;
  description?: unknown;
  breadcrumbs?: import('./nav-types.js').BreadcrumbNode[];
  onBreadcrumbNavigate?: (
    node: import('./nav-types.js').BreadcrumbNode,
  ) => void;
}

export interface SectionProps {
  title?: unknown;
  description?: unknown;
}

export interface PanelProps {
  padded?: boolean;
  elevated?: boolean;
}

export interface StatCardProps {
  label: unknown;
  value: unknown;
  delta?: { value: unknown; trend?: 'up' | 'down' | 'flat' };
}

export interface SummaryStripProps {
  columns?: number | 'auto';
}

export declare const Shell: Component<ShellProps>;
export declare const Sidebar: Component<SidebarProps>;
export declare const Topbar: Component<TopbarProps>;

export declare const PageFrame: Component<PageFrameProps>;
export declare const PageTitle: Component<PageTitleProps>;
export declare const Breadcrumb: Component<BreadcrumbProps>;

export declare const Section: Component<SectionProps>;
export declare const Panel: Component<PanelProps>;
export declare const StatCard: Component<StatCardProps>;
export declare const SummaryStrip: Component<SummaryStripProps>;
