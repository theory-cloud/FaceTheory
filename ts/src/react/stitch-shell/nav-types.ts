import type { ReactNode } from 'react';

import type { NavItem as SharedNavItem } from '../../stitch-shell/nav-types.js';

export type {
  BreadcrumbNode,
  ResolvedNav,
} from '../../stitch-shell/nav-types.js';

export interface NavItem extends Omit<SharedNavItem, 'icon' | 'children'> {
  /** Optional leading icon node. */
  icon?: ReactNode;
  /** Nested navigation items (sub-menu). */
  children?: NavItem[];
}
