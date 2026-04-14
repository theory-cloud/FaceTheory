/**
 * A single entry in a Stitch Tabs control. Framework adapters extend this
 * type to narrow `icon` and `label` to their native node shape; keep shared
 * fields framework-agnostic so Vue/Svelte ports can reuse the same contract.
 */
export interface TabItem {
  /** Stable identifier; used for selection state. */
  key: string;
  /** Display label. Framework adapters may tighten this to their node type. */
  label: unknown;
  /** Optional numeric badge rendered next to the label (e.g. result counts). */
  count?: number;
  /** Optional leading icon payload; framework adapters type this precisely. */
  icon?: unknown;
  /** Hide from the visible bar while still being addressable by key. */
  hidden?: boolean;
  /** Disable the tab. Disabled tabs are visible but not selectable. */
  disabled?: boolean;
}
