/**
 * Framework-neutral types for the FaceTheory `SelectableCardGrid` /
 * `ChoiceCard` primitives. The TheoryMCP Agent Import & Completion Wizard
 * uses these to render the operator-facing choice surfaces (allowed actions,
 * binding targets, environment selection) above wizard content.
 *
 * Trust boundary (load-bearing):
 *
 *   - This is presentation-only. FaceTheory does not decide whether a choice
 *     is authorized.
 *   - theory-mcp-server (the host) supplies allowed / disabled / blocked
 *     state from route-resolved server policy and TableTheory-backed state.
 *   - FaceTheory makes no authorization inference from option labels,
 *     package fields, repository names, or action-family strings.
 *   - The `recommended`, `riskLabel`, `disabledReason`, `blocked`, and
 *     `blockedReason` fields are caller-supplied display values, never
 *     computed by the primitive.
 *
 * Adapters (React, Vue, Svelte) narrow node-shaped fields to their native
 * node type. The shape here is shared so the three adapters render the same
 * testable contract (class names, `data-*`, ARIA, role markers).
 */

import type { OperatorVisibilityMetadata } from './operator-visibility-types.js';
import type { WizardSafetyPolicy } from './wizard-types.js';

/**
 * Tone hint for a card. Hosts pick one; the adapter chooses concrete tokens.
 * `recommended` is its own tone so the visual cue and the textual
 * "Recommended" label can be paired.
 */
export type SelectableCardTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'recommended';

/**
 * Selection mode. `single` maps to `role="radiogroup"` + `role="radio"`;
 * `multi` maps to `role="group"` + `role="checkbox"`.
 */
export type SelectableCardGridSelection = 'single' | 'multi';

/** Layout mode. Adapter renders the appropriate inline-styled container. */
export type SelectableCardGridLayout = 'grid' | 'stack' | 'two-column';

/** Size hint. Adapter chooses concrete padding / font tokens. */
export type SelectableCardGridSize = 'sm' | 'md' | 'lg';

/**
 * A single selectable card. Hosts provide already-resolved values; the
 * adapter only renders them.
 */
export interface SelectableCardOption {
  /** Stable identifier used for keying and selection state. */
  key: string;
  /** Required title. Adapters narrow this to their native node type. */
  title: unknown;
  /** Optional descriptive copy. Adapters narrow this to their native node type. */
  description?: unknown;
  /**
   * Optional leading icon. Decorative; adapters render with `aria-hidden`
   * so screen-readers do not double-read it. The accessible name comes from
   * the title.
   */
  icon?: unknown;
  /** Optional badge (e.g. "Beta", "Live"). Adapters narrow this. */
  badge?: unknown;
  /** Optional tone hint for the card. Defaults to `neutral`. */
  tone?: SelectableCardTone;
  /**
   * Optional caller-supplied risk / warning label rendered as TEXT
   * (e.g. "High blast radius"). Color-independent so high-contrast viewers
   * see it. The primitive does not compute risk; it only displays.
   */
  riskLabel?: string;
  /**
   * Optional disabled reason copy. Presence implies the option is disabled
   * (the adapter sets `aria-disabled="true"` on the card and wires
   * `aria-describedby` to the reason node so screen-readers announce it).
   * The primitive does not decide disabled state; it relays the host's
   * decision.
   */
  disabledReason?: string;
  /**
   * Explicit `recommended` marker. Renders a TEXT "Recommended" pill in
   * addition to any tone styling so the cue is not color-only.
   */
  recommended?: boolean;
  /**
   * Explicit `blocked` marker. Renders a TEXT "Blocked" pill and disables
   * selection on the card. Often paired with `blockedReason` text.
   */
  blocked?: boolean;
  /** Caller-supplied reason copy for blocked options. */
  blockedReason?: string;
  /**
   * Optional already-server-resolved metadata badges (authority /
   * provenance / correlation / confidence / staleness). Adapters render via
   * `MetadataBadgeGroup`.
   */
  metadata?: OperatorVisibilityMetadata;
}

/**
 * The card grid envelope. Hosts pre-compute selection state and the option
 * order; the adapter renders verbatim.
 */
export interface SelectableCardGrid {
  /** Stable HTML id used by the adapter to wire label/description/aria-* refs. */
  groupId: string;
  /** Caller-supplied options. */
  options: SelectableCardOption[];
  /** Currently selected option keys. Empty array means nothing selected. */
  selectedKeys: string[];
  /** Selection mode. */
  selection: SelectableCardGridSelection;
  /** Layout mode. Default `grid`. */
  layout?: SelectableCardGridLayout;
  /** Size hint. Default `md`. */
  size?: SelectableCardGridSize;
  /**
   * Optional group label rendered above the cards and exposed via
   * `aria-labelledby`. Adapters narrow this.
   */
  label?: unknown;
  /**
   * Optional descriptive copy. Adapters narrow this and wire it via
   * `aria-describedby` on the group.
   */
  description?: unknown;
  /**
   * Explicit safety policy assertion (mirrors the rest of the wizard
   * primitives — hosts confirm placeholders carry no secrets or
   * production-like data, and the adapter renders the policy into the DOM).
   */
  safetyPolicy: WizardSafetyPolicy;
}

/**
 * Props for the standalone `ChoiceCard` primitive — a single card rendered
 * outside a grid. The card still relays selection state through host
 * callbacks; it does NOT toggle itself.
 */
export interface ChoiceCardProps {
  /** Required stable id used to wire label / aria-describedby refs. */
  cardId: string;
  /** The option payload. */
  option: SelectableCardOption;
  /**
   * Selection mode. Determines whether the card renders as a radio (single
   * selection family) or checkbox (multi selection family). Standalone
   * cards still declare their family so screen-readers get the right
   * semantics.
   */
  selection: SelectableCardGridSelection;
  /** Whether the card is currently selected. Caller-controlled. */
  selected: boolean;
  /** Size hint. Default `md`. */
  size?: SelectableCardGridSize;
  /** Explicit safety policy assertion. */
  safetyPolicy: WizardSafetyPolicy;
}
