/**
 * Framework-neutral types for the FaceTheory wizard authority/context strip
 * primitive (also exported as the alias `WizardServerResolvedContextBar`).
 *
 * This is the read-only "tenant / namespace / MCP route / operator / partner
 * / agent scope" header that the TheoryMCP control plane renders above wizard
 * content. The contract is strictly presentational:
 *
 *   - FaceTheory renders only caller-supplied display values that the host
 *     has already server-resolved.
 *   - FaceTheory does not resolve, verify, derive, or validate tenant,
 *     namespace, operator, MCP route, partner, agent, account, entitlement,
 *     mailbox, GitHub, or authority state.
 *   - FaceTheory does not enforce security; the read-only / authority badge
 *     is text-labeled and explicitly does not imply enforcement.
 *   - FaceTheory never invents copy payloads; copyable cells use the value
 *     the host pre-resolved.
 *
 * Adapters narrow node-shaped fields (`label`, `value`, `icon`, `badge`,
 * `actions`, `emptyLabel`) to their native node type. The shape here is
 * shared so a Vue or Svelte adapter can wrap the same data without
 * re-shaping it.
 */

import type { WizardSafetyPolicy } from './wizard-types.js';

/** Color/tone hint for an authority context item. Adapter chooses tokens. */
export type WizardAuthorityContextItemTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

/** Size hint for the strip. Adapter chooses concrete spacing tokens. */
export type WizardAuthorityContextStripSize = 'sm' | 'md' | 'lg';

/**
 * Layout mode for the strip. `auto` uses a CSS-only responsive grid that
 * stacks below a natural breakpoint without hiding any label/value context.
 * The host can pin one of the other three explicitly.
 */
export type WizardAuthorityContextStripLayout = 'strip' | 'grid' | 'stack' | 'auto';

/**
 * A single label/value cell in the strip. Hosts supply already-resolved
 * values; the primitive renders them verbatim.
 */
export interface WizardAuthorityContextItem {
  /** Stable identifier used for React keying and copyable-action wiring. */
  key: string;
  /** Display label, e.g. "Tenant", "Namespace", "MCP route". */
  label: unknown;
  /** Display value, already server-resolved by the host. */
  value: unknown;
  /**
   * Optional leading icon. Adapter narrows to its native node type.
   * The icon must be decorative; the label still carries the meaning so
   * read-only / authority cues do not depend on the icon.
   */
  icon?: unknown;
  /**
   * Optional small text badge (e.g. "Live", "Imported"). Adapter narrows to
   * its native node type.
   */
  badge?: unknown;
  /** Optional tone hint for the cell. Defaults to `neutral`. */
  tone?: WizardAuthorityContextItemTone;
  /**
   * When true, the primitive renders an accessible "Copy" button alongside
   * the value. The host wires the actual clipboard write via `onCopyItem`;
   * the primitive never resolves or invents a payload.
   */
  copyable?: boolean;
  /**
   * Optional explicit copy payload. Defaults to the rendered string value
   * when `value` is a string; otherwise the host must supply this for the
   * copy button to carry a deterministic payload.
   */
  copyValue?: string;
  /** Optional tooltip text (rendered via the standard `title` attribute). */
  title?: string;
  /**
   * Optional link target. The primitive validates the URL through the
   * Stitch admin safe-href filter so `javascript:` and other unsafe schemes
   * are dropped.
   */
  href?: string;
}

/**
 * The strip envelope. Hosts pre-compose the items, optional authority
 * label, and optional action slot.
 */
export interface WizardAuthorityContextStrip {
  items: WizardAuthorityContextItem[];
  /**
   * Optional caller-supplied authority label, e.g. "Server-derived",
   * "Autheory session", "Route-resolved". Adapter narrows to its native
   * node type. The primitive renders this verbatim; it never asserts the
   * label is true.
   */
  authorityLabel?: unknown;
  /**
   * Optional text indicating the strip is read-only. Rendered as text (not
   * color-only) so screen-readers and high-contrast viewers see the cue.
   * The primitive does NOT enforce read-only; the label is informational
   * and exists so the host can be explicit about the contract.
   */
  readOnlyLabel?: unknown;
  /** Layout mode. Default `auto`. */
  layout?: WizardAuthorityContextStripLayout;
  /** Size hint. Default `md`. */
  size?: WizardAuthorityContextStripSize;
  /**
   * Controls whether items may wrap onto multiple lines in `strip` layout.
   * Default `true`. Ignored by `grid`, `stack`, and `auto`.
   */
  wrap?: boolean;
  /**
   * Optional action node slot, e.g. a "Refresh" or "Help" affordance. The
   * primitive renders it as-is; it never invents actions.
   */
  actions?: unknown;
  /** Optional empty-state label when `items` is empty. */
  emptyLabel?: unknown;
  /**
   * Explicit safety policy assertion. The primitive renders it into the DOM
   * via `data-safety-policy` and a footnote, so reviewers and tests can
   * confirm the strip carries no secrets or production-like data.
   */
  safetyPolicy: WizardSafetyPolicy;
}

/**
 * Stable alias matching the "ServerResolvedContextBar" naming preference
 * from the TheoryMCP control plane. Callers who think of this surface as a
 * server-resolved context bar can import the alias.
 */
export type WizardServerResolvedContextBar = WizardAuthorityContextStrip;
export type WizardServerResolvedContextBarItem = WizardAuthorityContextItem;
export type WizardServerResolvedContextBarLayout = WizardAuthorityContextStripLayout;
export type WizardServerResolvedContextBarSize = WizardAuthorityContextStripSize;
export type WizardServerResolvedContextBarTone = WizardAuthorityContextItemTone;
