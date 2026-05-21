/**
 * Framework-neutral types for the FaceTheory wizard reconciliation plan
 * primitive. This is the richer cousin of `WizardReconcileSummary`:
 *
 * - `WizardReconcileSummary` (from `wizard-types.ts`) describes a before/after
 *   diff with kinds `added | removed | changed | unchanged | redacted`.
 *
 * - `WizardReconciliationPlan` (this file) describes the *plan* the host
 *   intends to execute next, with operation kinds that include not just
 *   create/update but also `satisfied`, `conflict`, `blocked`, `external`,
 *   and `noop`. It is the natural shape for the TheoryMCP Agent Import &
 *   Completion Wizard "what will happen if you click Enable" step.
 *
 * The contract is presentational: hosts (e.g. the TheoryMCP control plane)
 * compute the plan and pass rows in. FaceTheory:
 *
 *   - never decides whether an operation is safe, destructive, allowed by
 *     TheoryMCP route authority, allowed by email/GitHub bindings, or
 *     externally complete;
 *   - never computes redaction; it only renders `[redacted]` when the host
 *     marks a row or detail as redacted;
 *   - never opens, fetches, or hashes evidence;
 *   - renders the same DOM for the same input on SSR and hydrated client.
 */

import type { OperatorVisibilityMetadata } from './operator-visibility-types.js';
import type { WizardSafetyPolicy } from './wizard-types.js';

/**
 * Operation kinds for a row in a wizard reconciliation plan.
 *
 * Canonical seven kinds plus stable aliases:
 *
 * - `create`                       — operation will create a new resource
 * - `update`                       — operation will update an existing resource
 * - `satisfied` / `already_satisfied` — desired state already matches; no work
 * - `conflict`                     — incompatible with another row or external state
 * - `blocked`                      — cannot proceed (host explains why)
 * - `external` / `external_step_required` — completed outside this wizard
 * - `noop` / `not_requested`       — explicitly requested as a no-op
 *
 * Aliases normalize to the canonical kind on render.
 */
export type WizardReconciliationPlanOperationKind =
  | 'create'
  | 'update'
  | 'satisfied'
  | 'already_satisfied'
  | 'conflict'
  | 'blocked'
  | 'external'
  | 'external_step_required'
  | 'noop'
  | 'not_requested';

/** Canonical (non-alias) operation kinds the totals object is keyed on. */
export type WizardReconciliationPlanCanonicalKind =
  | 'create'
  | 'update'
  | 'satisfied'
  | 'conflict'
  | 'blocked'
  | 'external'
  | 'noop';

/**
 * Optional structured detail row inside a reconciliation plan row. Hosts
 * pre-redact values; the primitive renders `[redacted]` when `redacted: true`.
 * Adapters narrow node-shaped fields to their native node type.
 */
export interface WizardReconciliationPlanDetail {
  /** Stable identifier used for keying inside the row. */
  key: string;
  /** Display label. */
  label: unknown;
  /** Pre-redacted value (caller-supplied). */
  value?: unknown;
  /** Set to `true` when the underlying value is sensitive. */
  redacted?: boolean;
}

/**
 * A single row in a wizard reconciliation plan. Hosts compute everything the
 * primitive needs.
 */
export interface WizardReconciliationPlanRow {
  /** Stable identifier used for keying. */
  key: string;
  /** Display label. */
  label: unknown;
  kind: WizardReconciliationPlanOperationKind;
  /**
   * Optional short summary copy (e.g. "Will create namespace 'acme'"). The
   * primitive renders this verbatim — it does not compose it from `kind`.
   */
  summary?: unknown;
  /**
   * Optional stable caller-supplied status label, e.g. "Will create" /
   * "Already satisfied" / "Conflict with existing binding". The primitive
   * renders this verbatim alongside an icon-free, color-independent badge.
   * If absent, a deterministic default label derived from `kind` is used.
   */
  statusLabel?: string;
  /**
   * Optional caller-supplied reason copy. Required in practice for
   * `conflict`, `blocked`, `external`, and `noop` rows so reviewers can
   * understand why no work happens; the primitive does not enforce that the
   * field is present, but tests and docs ask hosts to supply it.
   */
  reason?: string;
  /**
   * Optional structured detail rows shown only when the row is expanded.
   * Each detail entry may carry its own redaction flag.
   */
  details?: WizardReconciliationPlanDetail[];
  /**
   * Caller-controlled expansion state. The primitive renders the panel and
   * mirrors this value in `aria-expanded`; it never toggles itself.
   */
  expanded?: boolean;
  /**
   * Mark the entire row as sensitive. When true, the summary/reason are
   * still rendered but all detail values are replaced with the redaction
   * marker. Hosts should still avoid passing raw secrets in.
   */
  redacted?: boolean;
  metadata?: OperatorVisibilityMetadata;
}

/**
 * Reconciliation plan envelope. Hosts pre-compute the totals (keyed by
 * canonical kind), the safety-policy assertion, and the row order.
 */
export interface WizardReconciliationPlan {
  rows: WizardReconciliationPlanRow[];
  totals: Record<WizardReconciliationPlanCanonicalKind, number>;
  safetyPolicy: WizardSafetyPolicy;
}

/**
 * Stable alias matching the alternate "DiffList" naming preference. Callers
 * who think of this surface as a diff list rather than a reconciliation plan
 * can import the alias.
 */
export type WizardDiffList = WizardReconciliationPlan;
export type WizardDiffListRow = WizardReconciliationPlanRow;
export type WizardDiffListDetail = WizardReconciliationPlanDetail;
export type WizardDiffListOperationKind = WizardReconciliationPlanOperationKind;
export type WizardDiffListCanonicalKind = WizardReconciliationPlanCanonicalKind;

/**
 * Resolve any operation kind (canonical or alias) to its canonical form. The
 * primitive uses this so totals/labels/data attributes are stable regardless
 * of which alias the host supplied.
 */
export function canonicalizeWizardReconciliationPlanKind(
  kind: WizardReconciliationPlanOperationKind,
): WizardReconciliationPlanCanonicalKind {
  switch (kind) {
    case 'already_satisfied':
      return 'satisfied';
    case 'external_step_required':
      return 'external';
    case 'not_requested':
      return 'noop';
    default:
      return kind;
  }
}
