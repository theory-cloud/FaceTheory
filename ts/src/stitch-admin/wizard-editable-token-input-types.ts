/**
 * Framework-neutral types for the FaceTheory wizard editable token input
 * (also exported as the alias `WizardChipList*`).
 *
 * This is the controlled chip/token entry primitive the TheoryMCP Agent
 * Import & Completion Wizard uses for steps like "Allowed senders" or
 * "Allowed domains". The contract is presentational and host-driven:
 *
 *   - FaceTheory renders only caller-supplied state.
 *   - FaceTheory does NOT own hidden token authority state. Hosts pass the
 *     current token list and (optionally) the current draft; FaceTheory
 *     proposes the next state via callbacks, but the host owns acceptance.
 *   - FaceTheory does NOT claim a token is safe to write. Any client-side
 *     validation surfaced here is UX only. TheoryMCP must still
 *     server-validate allowed senders/domains before writing
 *     `AgentEmailBinding` policy.
 *   - FaceTheory never resolves mailbox authority, tenant, namespace,
 *     agent, partner, provider credentials, or email policy state.
 *
 * Adapters narrow `label`, `description`, and per-token `value` rendering
 * to their native node type. The shape here is shared so Vue or Svelte
 * adapters can wrap the same data without re-shaping it.
 */

import type { WizardSafetyPolicy } from './wizard-types.js';

/** Tone hint for a single chip/token. Adapter chooses concrete tokens. */
export type WizardEditableTokenInputTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

/**
 * Optional per-token metadata. Hosts supply this for tokens that need
 * non-default presentation (e.g. a different tone, a tooltip, a
 * non-removable system-defined entry). Tokens without an entry render
 * with default `neutral` tone and remain removable unless the wider input
 * is disabled or read-only.
 */
export interface WizardEditableTokenInputItem {
  /** Stable token string. Matches an entry in `value`. */
  value: string;
  /** Tone hint for the chip. Defaults to `neutral`. */
  tone?: WizardEditableTokenInputTone;
  /** Optional tooltip rendered via the `title` attribute. */
  title?: string;
  /** When true, the chip's Remove button is disabled. */
  disabled?: boolean;
  /** When false, no Remove button is rendered for this token. Default true. */
  removable?: boolean;
}

/**
 * Result of a caller-supplied token validator. The primitive renders the
 * message (when invalid) below the input and uses `normalized` as the
 * payload it proposes via `onChange` when the user commits the draft.
 */
export interface WizardEditableTokenInputValidationResult {
  valid: boolean;
  message?: string;
  normalized?: string;
}

/**
 * Caller-supplied feedback severity tone. The primitive uses this only for
 * styling; it does NOT change the announced role.
 */
export type WizardEditableTokenInputFeedbackTone =
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

/** Controlled input envelope. */
export interface WizardEditableTokenInput {
  /** Required, stable HTML id used to wire `<label htmlFor>` and aria-describedby. */
  inputId: string;
  /** Controlled token list. */
  value: string[];
  /** Optional per-token metadata. */
  items?: WizardEditableTokenInputItem[];
  /** Optional caller-supplied label. */
  label?: unknown;
  /** Optional descriptive copy below the label. */
  description?: unknown;
  /** Optional placeholder text for the draft input. */
  placeholder?: string;
  /** Controlled draft value (the text currently being typed). */
  draftValue?: string;
  /**
   * Optional caller-supplied feedback message. When present, the primitive
   * renders this verbatim with `role="alert"` regardless of validator/
   * duplicate/maxTokens state. Hosts use this to surface server-side
   * messages alongside the wizard.
   */
  feedbackMessage?: string;
  /** Optional tone hint for caller-supplied feedback. Defaults to `info`. */
  feedbackTone?: WizardEditableTokenInputFeedbackTone;
  /**
   * Optional maximum number of tokens. When `value.length >= maxTokens`,
   * the primitive renders a "Maximum reached" feedback line. The host is
   * still responsible for enforcing the cap on `onChange`.
   */
  maxTokens?: number;
  /** Whether duplicate tokens are allowed. Default `false`. */
  allowDuplicates?: boolean;
  /**
   * Optional prefix string rendered on every chip (e.g. `"@"` for email
   * handles, `"*."` for wildcard domains). Decorative — adapter renders
   * with `aria-hidden` so screen-readers do not double-read it.
   */
  tokenPrefix?: string;
  /** Disabled state — input is non-interactive; Remove buttons disabled. */
  disabled?: boolean;
  /** Read-only state — input is non-interactive; chips are not removable. */
  readOnly?: boolean;
  /**
   * Optional caller-supplied token validator. Called during render for the
   * current `draftValue` only. Must be a pure function so SSR and hydrated
   * DOM agree byte-for-byte.
   */
  validateToken?: (
    token: string,
  ) => WizardEditableTokenInputValidationResult;
  /**
   * Optional accessible "kind" string used in Remove button aria-labels
   * (e.g. `"sender"` produces `"Remove sender qa@example.com"`). Default
   * `"token"`.
   */
  removeLabelKind?: string;
  /** Explicit safety policy assertion rendered into the DOM. */
  safetyPolicy: WizardSafetyPolicy;
}

/** Stable alias matching the "ChipList" naming preference. */
export type WizardChipList = WizardEditableTokenInput;
export type WizardChipListItem = WizardEditableTokenInputItem;
export type WizardChipListTone = WizardEditableTokenInputTone;
export type WizardChipListValidationResult = WizardEditableTokenInputValidationResult;
export type WizardChipListFeedbackTone = WizardEditableTokenInputFeedbackTone;
