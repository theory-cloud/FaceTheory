import type { BreadcrumbNode, NavItem, ResolvedNav } from './nav-types.js';

interface MatchContext {
  pathname: string;
  bestMatchLength: number;
  bestTrail: NavItem[] | null;
}

function walk(items: NavItem[], ancestors: NavItem[], ctx: MatchContext): void {
  for (const item of items) {
    const trail = [...ancestors, item];
    if (item.path && isPathMatch(ctx.pathname, item.path)) {
      if (item.path.length >= ctx.bestMatchLength) {
        ctx.bestMatchLength = item.path.length;
        ctx.bestTrail = trail;
      }
    }
    if (item.children && item.children.length > 0) {
      walk(item.children, trail, ctx);
    }
  }
}

function isPathMatch(pathname: string, itemPath: string): boolean {
  if (pathname === itemPath) return true;
  if (itemPath === '/') return false;
  const prefix = itemPath.endsWith('/') ? itemPath : `${itemPath}/`;
  return pathname.startsWith(prefix);
}

function trailToBreadcrumbs(trail: NavItem[]): BreadcrumbNode[] {
  return trail.map((item) => {
    const node: BreadcrumbNode = { key: item.key, label: item.label };
    if (item.path !== undefined) node.path = item.path;
    return node;
  });
}

/**
 * Matches `pathname` against a navigation tree and returns the active key,
 * an ordered breadcrumb trail, and a default page title.
 *
 * Match strategy: longest-prefix. If multiple items match, the one with the
 * longest `path` wins. Items without a `path` act as group headers and only
 * contribute to the breadcrumb trail when one of their descendants matches.
 */
export function resolveActiveNav(
  pathname: string,
  nav: NavItem[],
): ResolvedNav {
  const ctx: MatchContext = {
    pathname,
    bestMatchLength: -1,
    bestTrail: null,
  };
  walk(nav, [], ctx);

  if (!ctx.bestTrail) {
    return { activeKey: undefined, breadcrumbs: [], pageTitle: undefined };
  }

  const last = ctx.bestTrail[ctx.bestTrail.length - 1]!;
  return {
    activeKey: last.key,
    breadcrumbs: trailToBreadcrumbs(ctx.bestTrail),
    pageTitle: last.label,
  };
}
