/**
 * Framework-neutral types for the FaceTheory `AuditTrailPanel` and
 * lower-level `DisclosurePanel` primitives. The TheoryMCP Agent Import &
 * Completion Wizard uses these on the final-review / validation-history
 * surfaces.
 *
 * Trust boundary (load-bearing):
 *
 *   - Presentation-only. FaceTheory does NOT decide redaction or audit
 *     policy, parse event content, fetch external state, apply changes,
 *     authorize anything, or invent operational receipts.
 *   - theory-mcp-server (the host) supplies already-redacted event text
 *     and metadata. FaceTheory only renders the audit trail and the
 *     disclosure behavior.
 *   - Redaction marker rule: when an event carries `redactedMarker`, the
 *     primitive renders the marker as text and suppresses the event's
 *     `body`, `metadata`, and `externalLink`. The host must pre-redact
 *     anything else; the primitive does NOT inspect or transform raw
 *     secret values.
 *   - External link rule: `externalLink.href` is filtered through the
 *     Stitch admin safe-href guard (`safeMetadataHref`). Only `http:` and
 *     `https:` URLs survive; everything else (e.g. `javascript:`) is
 *     dropped at render time. The primitive emits `rel="noopener
 *     noreferrer"` and `target="_blank"` on safe external links.
 */

import type { OperatorVisibilityMetadata } from './operator-visibility-types.js';
import type { WizardSafetyPolicy } from './wizard-types.js';

/**
 * Tone hint for an audit event chip. Adapters choose the concrete color
 * tokens; the tone is also rendered as a TEXT pill so high-contrast
 * viewers see the cue.
 */
export type AuditTrailEventTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

/**
 * Status of an audit event. Drives the role marker for prominent rows
 * (`error` → `role="alert"`) and the chip label.
 */
export type AuditTrailEventStatus = 'info' | 'success' | 'warning' | 'error';

/** Caller-supplied key-value metadata pair rendered in detailed variant. */
export interface AuditTrailEventMetadataEntry {
  /** Stable identifier used for keying. */
  key: string;
  /** Display label for the key. */
  label: unknown;
  /** Display value. The host pre-redacts; the primitive renders verbatim. */
  value: unknown;
}

/** Caller-supplied external link reference for an event. */
export interface AuditTrailEventExternalLink {
  href: string;
  /** Optional display label. Defaults to `href` text if omitted. */
  label?: unknown;
}

/**
 * A single audit event row.
 *
 * When `redactedMarker` is set, the primitive renders ONLY the timestamp,
 * actor (if present), the marker text, and the status/tone pills.
 * `body`, `metadata`, and `externalLink` are suppressed regardless of
 * caller value to keep raw secret-like data out of the DOM.
 */
export interface AuditTrailEvent {
  /** Stable identifier used for keying. */
  id: string;
  /**
   * ISO-8601 timestamp or any caller-supplied stable string. The primitive
   * never computes the timestamp; it just renders.
   */
  timestamp: string;
  /** Caller-supplied actor label (e.g. principal, agent, service). */
  actor?: unknown;
  /**
   * Optional caller-supplied source label for the actor (e.g.
   * "Autheory session", "Server-derived"). Rendered as a small text chip.
   */
  actorSource?: string;
  /** Event title. Adapters narrow to their native node type. */
  title: unknown;
  /** Optional body / details. Adapters narrow to their native node type. */
  body?: unknown;
  /** Optional leading icon. Decorative; adapters render with `aria-hidden`. */
  icon?: unknown;
  /** Optional tone hint. Defaults to `neutral`. */
  tone?: AuditTrailEventTone;
  /** Optional status. Drives role markers; `error` is announced as alert. */
  status?: AuditTrailEventStatus;
  /**
   * When set, the primitive renders this marker text instead of the
   * event body and suppresses `body`, `metadata`, and `externalLink`.
   * The host owns the marker copy ("[redacted by policy]", "[redacted —
   * mailbox secret]", etc.). The primitive renders it verbatim.
   */
  redactedMarker?: string;
  /** Optional external-step link, filtered via safeMetadataHref. */
  externalLink?: AuditTrailEventExternalLink;
  /** Optional key-value metadata rendered in detailed variant. */
  metadata?: AuditTrailEventMetadataEntry[];
}

/**
 * A grouping of audit events. Hosts compute groups (parse / reconciliation
 * / GitHub setup / email setup / final apply) and the disclosure state.
 */
export interface AuditTrailEventGroup {
  /** Stable identifier used for keying and `aria-controls` wiring. */
  id: string;
  /** Group heading label. Adapters narrow to their native node type. */
  label: unknown;
  /** Optional descriptive copy under the heading. */
  description?: unknown;
  /** Events rendered in caller-supplied chronological order. */
  events: AuditTrailEvent[];
  /**
   * Caller-controlled disclosure state. The primitive mirrors this in
   * `aria-expanded` and renders the events section as `hidden` when
   * `false`. The primitive does NOT toggle itself.
   */
  expanded?: boolean;
}

/** Audit trail variant. */
export type AuditTrailVariant = 'compact' | 'detailed';

export interface AuditTrail {
  /** Required stable group id used to wire root `aria-*` refs. */
  groupId: string;
  /** Optional heading label rendered above the groups. */
  label?: unknown;
  /** Optional descriptive copy under the heading. */
  description?: unknown;
  groups: AuditTrailEventGroup[];
  variant: AuditTrailVariant;
  /** Optional empty-state label rendered when no groups have events. */
  emptyLabel?: unknown;
  /** Explicit safety policy assertion rendered into the DOM. */
  safetyPolicy: WizardSafetyPolicy;
  /**
   * Optional already-server-resolved metadata badges for the trail as a
   * whole (authority / provenance / correlation / confidence / staleness).
   * Adapters render via `MetadataBadgeGroup`.
   */
  metadata?: OperatorVisibilityMetadata;
}

/**
 * Standalone `DisclosurePanel` props. The lower-level primitive renders a
 * keyboard-accessible disclosure (real `<button type="button">` toggle
 * with `aria-expanded` + `aria-controls`) and a panel with the standard
 * `hidden` attribute when collapsed. Hosts own `expanded` state.
 */
export interface DisclosurePanelProps {
  /** Required stable id used to wire `aria-controls` and the panel id. */
  panelId: string;
  /** Heading label. Adapters narrow to their native node type. */
  label: unknown;
  /** Optional descriptive copy rendered under the toggle. */
  description?: unknown;
  /** Caller-controlled expansion state. */
  expanded: boolean;
  /** Optional tone hint for the disclosure header. */
  tone?: AuditTrailEventTone;
  /** Optional status; `error` makes the panel announce as `role="alert"`. */
  status?: AuditTrailEventStatus;
  /** Explicit safety policy assertion. */
  safetyPolicy: WizardSafetyPolicy;
}
