/**
 * Authority state for operator-visible data. Operator dashboards often expose
 * imported or observed state before a later gate transition makes it
 * authoritative; model that explicitly instead of hiding it in display copy.
 */
export type AuthorityState = 'authoritative' | 'non-authoritative' | 'unknown';

/**
 * Caller-provided provenance for a value shown in an operator dashboard. Keep
 * values stable and serializable so SSR output and hydrated DOM agree.
 */
export interface ProvenanceMetadata {
  /** Human-readable system/source label, e.g. "Factory import". */
  source: string;
  /** Optional stable source identifier, batch id, or trace id. */
  sourceId?: string;
  /** Optional link to source evidence. Must already be sanitized/allowlisted. */
  href?: string;
  /** ISO-8601 timestamp for when the source observed or imported the data. */
  observedAt?: string;
  /** Human-readable actor/service label. */
  actor?: string;
}

/** Confidence signal for imported or inferred operator data. */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

export interface ConfidenceMetadata {
  level: ConfidenceLevel;
  /** Optional numeric score in the closed interval [0, 1]. */
  score?: number;
  /** Stable display label supplied by the caller. */
  label?: string;
  /** Short explanation of why this confidence applies. */
  reason?: string;
}

/** Staleness signal for operator-visible data. */
export type StalenessState = 'fresh' | 'stale' | 'unknown';

export interface StalenessMetadata {
  state: StalenessState;
  /** ISO-8601 timestamp for the last successful refresh/import. */
  refreshedAt?: string;
  /** ISO-8601 timestamp after which the data should be considered stale. */
  staleAt?: string;
  /**
   * Stable caller-computed age label, e.g. "refreshed 12 minutes ago".
   * Do not compute this from Date.now() during render.
   */
  ageLabel?: string;
  /** Short explanation of why the value is stale or freshness is unknown. */
  reason?: string;
}

/**
 * Caller-provided correlation identifiers for operator support workflows.
 * Values are normalized before render so badge output is deterministic across
 * SSR and client hydration.
 */
export interface OperatorCorrelationMetadata {
  /** Normalized correlation identifier shown/copied by operators. */
  correlationId: string;
  /** Where the selected correlation ID came from. */
  correlationSource?: string;
  /** Workload/trigger surface, e.g. "http", "eventbridge", or "dynamodb_stream". */
  trigger?: string;
  /** Invocation/request ID when distinct from correlationId. */
  requestId?: string;
}

/**
 * Shared metadata envelope for authority, provenance, confidence, staleness,
 * and correlation. Adapter primitives can render this consistently across
 * React, Vue, and Svelte without each adapter inventing its own data shape.
 */
export interface OperatorVisibilityMetadata {
  authority?: AuthorityState;
  provenance?: ProvenanceMetadata;
  confidence?: ConfidenceMetadata;
  staleness?: StalenessMetadata;
  correlation?: OperatorCorrelationMetadata;
}

/** Guard states for caller-supplied operator authorization. */
export type OperatorGuardState =
  | 'authorized'
  | 'unauthorized'
  | 'loading'
  | 'error';

export interface OperatorGuardStatus {
  state: OperatorGuardState;
  /** Stable label for the signed-in principal when available. */
  principalLabel?: string;
  /** Stable explanation for unauthorized/error states. */
  reason?: string;
  /** Optional request/correlation identifier for support workflows. */
  requestId?: string;
}

/** Health state for a backend/API capability shown to operators. */
export type OperatorHealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface OperatorHealthRow {
  key: string;
  label: string;
  status: OperatorHealthStatus;
  description?: string;
  /** Stable caller-supplied detail such as latency, region, or response code. */
  detail?: string;
  /** ISO-8601 timestamp for the health observation. */
  checkedAt?: string;
  metadata?: OperatorVisibilityMetadata;
}

/** Dimension header for an entity × dimension visibility matrix. */
export interface VisibilityMatrixDimension {
  key: string;
  label: string;
  description?: string;
}

/** Entity row header for an entity × dimension visibility matrix. */
export interface VisibilityMatrixEntity {
  key: string;
  label: string;
  description?: string;
  metadata?: OperatorVisibilityMetadata;
}

export type VisibilityMatrixCellState =
  | 'visible'
  | 'not-visible'
  | 'partial'
  | 'blocked'
  | 'unknown';

export interface VisibilityMatrixCell {
  /** Matches `VisibilityMatrixEntity.key`. */
  entityKey: string;
  /** Matches `VisibilityMatrixDimension.key`. */
  dimensionKey: string;
  state: VisibilityMatrixCellState;
  /** Stable display label, e.g. "Visible" or "No imported record". */
  label?: string;
  /** Optional stable detail copy. */
  detail?: string;
  metadata?: OperatorVisibilityMetadata;
}

export interface VisibilityMatrixRow {
  entity: VisibilityMatrixEntity;
  cells: VisibilityMatrixCell[];
}

/** Intent behind an empty/placeholder operator state. */
export type OperatorEmptyStateIntent =
  | 'no-data'
  | 'not-authorized'
  | 'not-configured'
  | 'filtered-empty'
  | 'loading'
  | 'error';

/**
 * Explicit policy marker for placeholders. Operator dashboards must not use
 * production-looking fake partner, tenant, release, or version values.
 */
export type OperatorPlaceholderDataPolicy = 'no-production-like-data';

export interface OperatorEmptyStateConfig {
  intent: OperatorEmptyStateIntent;
  title: string;
  description?: string;
  actionLabel?: string;
  placeholderDataPolicy: OperatorPlaceholderDataPolicy;
}
