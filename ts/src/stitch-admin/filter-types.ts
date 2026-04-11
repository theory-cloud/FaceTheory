/**
 * A single filter chip definition. Chips are the dense alternative to a
 * full AntD `Form` sitting above a data table — they show the current filter
 * state as removable tokens alongside the result set. Framework adapters
 * narrow `label` to their native node type.
 */
export interface FilterChipConfig {
  /** Stable identifier; used for change/remove callbacks. */
  key: string;
  /** Display label. Framework adapters may tighten this to their node type. */
  label: unknown;
  /** Optional numeric badge rendered next to the label. */
  count?: number;
  /**
   * Whether the chip is in the active/selected state. Defaults to `true`
   * because chips usually represent an applied filter; set to `false` to
   * render an unselected option chip.
   */
  active?: boolean;
  /**
   * Whether the chip shows a removal affordance. Defaults to `true`; set
   * `false` for read-only chips (e.g. locked/system filters).
   */
  removable?: boolean;
}
