import type { NavItem as SharedNavItem } from '../../stitch-shell/nav-types.js';

export type {
  BreadcrumbNode,
  ResolvedNav,
} from '../../stitch-shell/nav-types.js';

export interface NavItem extends Omit<SharedNavItem, 'icon' | 'children'> {
  icon?: unknown;
  children?: NavItem[];
}
