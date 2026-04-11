/**
 * A single entry in the navigation tree consumed by the Stitch shell
 * primitives. One level of nesting (groups with children) is typical for
 * control-plane surfaces; deeper trees are supported but should be used
 * sparingly.
 */
export interface NavItem {
  /** Stable identifier; usually the route path. Used for menu selection. */
  key: string;
  /** Display label for the sidebar entry and breadcrumb. */
  label: string;
  /** Navigation target. Absent on group headers. */
  path?: string;
  /** Framework-specific icon payload. */
  icon?: unknown;
  /** Nested navigation items (sub-menu). */
  children?: NavItem[];
  /** Hide from the sidebar while still participating in breadcrumb resolution. */
  hidden?: boolean;
}

/**
 * A single node in a breadcrumb trail. Consumers may override the trail per
 * page, or let the shell derive it from the active nav path.
 */
export interface BreadcrumbNode {
  key: string;
  label: string;
  path?: string;
}

/**
 * Result of matching a pathname against a nav tree.
 */
export interface ResolvedNav {
  /** The matched nav item's key, or `undefined` if nothing matched. */
  activeKey: string | undefined;
  /** Ordered breadcrumb trail from root to the active item (inclusive). */
  breadcrumbs: BreadcrumbNode[];
  /** The active item's label, surfaced as a default page title. */
  pageTitle: string | undefined;
}
