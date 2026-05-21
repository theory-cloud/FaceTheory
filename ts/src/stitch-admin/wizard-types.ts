/**
 * Framework-neutral primitives for FaceTheory Stitch admin wizards. The shapes
 * here are used by the TheoryMCP Agent Import & Completion Wizard and by any
 * other host-driven setup flow Theory Cloud surfaces grow on top of FaceTheory.
 *
 * The contract is deliberately presentational: hosts (e.g. the TheoryMCP
 * control plane) own routing, sessions, entitlements, GitHub/email bindings,
 * package validation, secret handling, and capability decisions. FaceTheory
 * only renders the host-supplied data and refuses to invent values during
 * render, so SSR output and hydrated DOM agree exactly.
 *
 * Adapters (React, Vue, Svelte) may narrow node-shaped fields to their native
 * node type but must not widen the rules below.
 */

import type {
  OperatorEmptyStateIntent,
  OperatorVisibilityMetadata,
} from './operator-visibility-types.js';

/**
 * Explicit safety policy for wizard surfaces. Wizard primitives must not be
 * fed secrets (release credentials, agent secrets, signed URLs, principals)
 * or production-looking partner/tenant fixtures. Hosts assert this contract
 * by passing the literal value into the primitive; the value is rendered into
 * the DOM so tests and reviewers can confirm the policy is in effect.
 */
export type WizardSafetyPolicy = 'no-secret-or-production-like-data';

/* -------------------------------------------------------------------------- */
/* Wizard step / progress state                                               */
/* -------------------------------------------------------------------------- */

/**
 * Lifecycle status for a single wizard step. Hosts compute the status from
 * their own state machine and pass it in.
 */
export type WizardStepStatus =
  | 'pending'
  | 'in-progress'
  | 'complete'
  | 'blocked'
  | 'skipped';

/** A single step in a wizard progress indicator. */
export interface WizardStep {
  /** Stable identifier used for keying and selection state. */
  key: string;
  /** Display label. Adapters narrow this to their node type. */
  label: unknown;
  /** Optional secondary description. Adapters narrow this to their node type. */
  description?: unknown;
  status: WizardStepStatus;
  /**
   * Optional short hint shown alongside the step (e.g. "blocked: missing
   * GitHub binding"). Adapters narrow this to their node type.
   */
  hint?: unknown;
  /** Optional explicit "this step is currently focused" override. */
  active?: boolean;
}

/**
 * Wizard progress state. The list of steps and the current step are owned by
 * the host; the primitive renders them in the supplied order so server and
 * client agree on what's shown.
 */
export interface WizardProgressState {
  steps: WizardStep[];
  /** Stable key of the currently focused step, if any. */
  currentStepKey?: string;
  /**
   * Optional human-readable progress label (e.g. "Step 3 of 5"). Adapters
   * derive a default if it is omitted; hosts may override it.
   */
  progressLabel?: string;
}

/* -------------------------------------------------------------------------- */
/* Package / file summary                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A single file in a wizard-visible package summary. The primitive does not
 * fetch or validate the file; hosts pass in the values they already know.
 */
export interface WizardPackageFile {
  /** Stable identifier used for keying. */
  key: string;
  /** Relative path inside the package. */
  path: string;
  /** Optional size in bytes (caller-supplied; not computed during render). */
  sizeBytes?: number;
  /** Optional pre-computed sha256 digest of the file body. */
  sha256?: string;
  /** Optional role label, e.g. "manifest", "adapter", "policy". */
  role?: string;
  /** Optional media type, e.g. "application/json". */
  mediaType?: string;
  /** Optional short note (caller-supplied). */
  note?: string;
}

/**
 * Wizard package summary. Hosts pre-compute totals; the primitive renders the
 * numbers verbatim so SSR and hydration match.
 */
export interface WizardPackageSummary {
  /** Stable package name. */
  name: string;
  /** Optional package version. Pre-1.0 hosts pass through whatever they have. */
  version?: string;
  /** Optional short description. Adapters narrow this to their node type. */
  description?: unknown;
  files: WizardPackageFile[];
  totals: {
    fileCount: number;
    /** Optional total size in bytes (caller-supplied). */
    byteCount?: number;
  };
  metadata?: OperatorVisibilityMetadata;
  safetyPolicy: WizardSafetyPolicy;
}

/* -------------------------------------------------------------------------- */
/* Validation finding list                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Severity for a wizard validation finding. Hosts run validation; the
 * primitive only displays the result.
 */
export type WizardFindingSeverity = 'info' | 'warning' | 'error' | 'blocker';

export interface WizardFinding {
  /** Stable identifier used for keying. */
  id: string;
  severity: WizardFindingSeverity;
  /** Short title. Adapters narrow this to their node type. */
  title: unknown;
  /** Optional longer body. Adapters narrow this to their node type. */
  description?: unknown;
  /** Optional source label, e.g. "manifest-validator". */
  source?: string;
  /**
   * Optional caller-supplied evidence reference. Hosts pre-redact this; the
   * primitive does not parse or fetch it.
   */
  evidence?: string;
  metadata?: OperatorVisibilityMetadata;
}

export interface WizardFindingList {
  findings: WizardFinding[];
  safetyPolicy: WizardSafetyPolicy;
}

/* -------------------------------------------------------------------------- */
/* Safe diff / reconcile summary                                              */
/* -------------------------------------------------------------------------- */

/**
 * Diff/reconcile entry. The primitive renders the kind and the caller-supplied
 * detail copy. When `redacted: true`, the detail is replaced with a redaction
 * marker before render so secrets cannot leak into the DOM even if a host
 * accidentally passes one in.
 */
export interface WizardReconcileEntry {
  /** Stable identifier used for keying. */
  key: string;
  /** Display label. Adapters narrow this to their node type. */
  label: unknown;
  kind: 'added' | 'removed' | 'changed' | 'unchanged' | 'redacted';
  /** Optional pre-redacted detail (caller-supplied). */
  detail?: unknown;
  /**
   * Set to `true` when the underlying value is sensitive. The primitive
   * replaces `detail` with a redaction marker; hosts must still avoid passing
   * raw secrets in.
   */
  redacted?: boolean;
}

export interface WizardReconcileSummary {
  entries: WizardReconcileEntry[];
  totals: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
    redacted: number;
  };
  safetyPolicy: WizardSafetyPolicy;
}

/* -------------------------------------------------------------------------- */
/* Redacted capability review                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Lifecycle intent for a capability shown in the wizard. The host decides;
 * the primitive renders the chosen intent.
 */
export type WizardCapabilityIntent = 'requested' | 'granted' | 'denied';

/**
 * Sensitivity classification for a capability. `redacted` always renders a
 * redaction marker; `sensitive` renders only the label/intent without detail.
 */
export type WizardCapabilitySensitivity = 'public' | 'sensitive' | 'redacted';

export interface WizardCapability {
  /** Stable identifier used for keying. */
  key: string;
  /** Display label. Adapters narrow this to their node type. */
  label: unknown;
  /** Optional descriptive copy. Adapters narrow this to their node type. */
  description?: unknown;
  intent: WizardCapabilityIntent;
  sensitivity: WizardCapabilitySensitivity;
  /** Optional caller-supplied detail (only shown when sensitivity = "public"). */
  detail?: unknown;
}

export interface WizardCapabilityReview {
  capabilities: WizardCapability[];
  safetyPolicy: WizardSafetyPolicy;
}

/* -------------------------------------------------------------------------- */
/* Final enablement checklist                                                 */
/* -------------------------------------------------------------------------- */

/** Status for a single enablement item. */
export type WizardEnablementItemStatus =
  | 'ready'
  | 'attention'
  | 'blocked'
  | 'not-applicable';

export interface WizardEnablementItem {
  /** Stable identifier used for keying. */
  key: string;
  /** Display label. Adapters narrow this to their node type. */
  label: unknown;
  /** Optional descriptive copy. Adapters narrow this to their node type. */
  description?: unknown;
  status: WizardEnablementItemStatus;
  /** Optional pre-redacted detail (caller-supplied). */
  detail?: unknown;
}

export interface WizardEnablementChecklist {
  items: WizardEnablementItem[];
  /** Optional summary label (e.g. "3 of 5 ready"). */
  summaryLabel?: string;
  /**
   * Optional explicit "all checks ready" assertion from the host. The
   * primitive renders it but does not compute it.
   */
  allReady?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Recovery / resume status                                                   */
/* -------------------------------------------------------------------------- */

/** Recovery state for a wizard session. */
export type WizardRecoveryState =
  | 'fresh'
  | 'resumable'
  | 'expired'
  | 'failed'
  | 'unknown';

/**
 * Caller-supplied resume token reference. The wizard primitive never renders
 * a raw token; it only displays the supplied label (e.g. "session abc12…").
 * Hosts produce the label with whatever redaction they already enforce.
 */
export interface WizardResumeTokenReference {
  /** Stable display label for the token. Never the raw token value. */
  label: string;
  /**
   * Explicit assertion that the value above is not a raw secret. The primitive
   * renders the policy into the DOM so tests can verify the contract.
   */
  redacted: true;
}

export interface WizardRecoveryStatus {
  state: WizardRecoveryState;
  /** Optional human-readable label, e.g. "Resume previous wizard?". */
  label?: string;
  /** Optional explanatory copy. */
  description?: string;
  /** ISO-8601 timestamp for the last successful save (caller-supplied). */
  lastSavedAt?: string;
  /** Optional caller-supplied stable age label, e.g. "saved 2 minutes ago". */
  ageLabel?: string;
  resumeTokenReference?: WizardResumeTokenReference;
  metadata?: OperatorVisibilityMetadata;
}

/* -------------------------------------------------------------------------- */
/* Empty / error states                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Wizard-flavored empty/error state. This is the operator empty-state shape
 * with the wizard safety policy explicitly attached so reviewers can confirm
 * placeholders never contain real partner/tenant/release data or secrets.
 */
export interface WizardEmptyStateConfig {
  intent: OperatorEmptyStateIntent;
  title: string;
  description?: string;
  actionLabel?: string;
  safetyPolicy: WizardSafetyPolicy;
}
