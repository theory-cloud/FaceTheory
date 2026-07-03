import type { FaceMode } from './types.js';

export type FaceLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type FaceErrorPhase =
  | 'resource'
  | 'render'
  | 'stream-preflight'
  | 'ssr-hydration-sidecar'
  | 'control-plane-section'
  | 'control-plane-section-validation'
  | 'isr-metadata';

export interface FaceErrorContext {
  requestId: string;
  method: string;
  path: string;
  routePattern: string;
  mode: FaceMode | 'none';
  phase: FaceErrorPhase;
  status: number | null;
  errorClass: string;
  isrState: string | null;
  sectionId?: string | undefined;
}

export interface FaceRequestCompletedLogRecord {
  level: FaceLogLevel;
  event: 'facetheory.request.completed';
  requestId: string;
  method: string;
  path: string;
  routePattern: string;
  mode: FaceMode | 'none';
  status: number;
  durationMs: number;
  renderMs: number | null;
  isrState: string | null;
  isStream: boolean;
  errorClass: string | null;
}

export interface FaceStreamErrorLogRecord {
  level: 'error';
  event: 'facetheory.stream_error';
  requestId: string;
  method: string;
  path: string;
  routePattern: string;
  mode: FaceMode | 'none';
  errorClass: string;
}

export type FaceObservabilityLogRecord =
  | FaceRequestCompletedLogRecord
  | FaceStreamErrorLogRecord;

export interface FaceMetricRecord {
  name: string;
  value: number;
  tags: Record<string, string>;
}

export interface FaceObservabilityHooks {
  /**
   * Override the clock used for durations.
   * Default: `Date.now`.
   */
  now?: () => number;

  /**
   * Structured log sink.
   */
  log?: (record: FaceObservabilityLogRecord) => void;

  /**
   * Minimal metrics sink (counters / histograms depending on backend).
   */
  metric?: (record: FaceMetricRecord) => void;

  /**
   * Error sink for failures that FaceTheory converts into deterministic
   * responses, fallback fragments, or degraded ISR states. The original thrown
   * value is delivered unchanged so hosts can preserve stack/cause fidelity in
   * their own telemetry without leaking it into rendered HTML.
   */
  onError?: (err: unknown, ctx: FaceErrorContext) => void;
}

export function logLevelForStatus(status: number): FaceLogLevel {
  const code = Math.trunc(Number(status));
  if (!Number.isFinite(code)) return 'info';
  if (code >= 500) return 'error';
  if (code >= 400) return 'warn';
  return 'info';
}

export function errorClassFor(err: unknown): string {
  if (err && typeof err === 'object') {
    const name = (err as { name?: unknown }).name;
    const normalizedName = normalizeErrorClassPart(name);
    if (normalizedName) return normalizedName;
    const ctorName = normalizeErrorClassPart(
      (err as { constructor?: { name?: unknown } }).constructor?.name,
    );
    if (ctorName) return ctorName;
    return 'Object';
  }

  const typeName = normalizeErrorClassPart(typeof err);
  return typeName ? `NonError_${typeName}` : 'Unknown';
}

export function reportFaceError(
  hooks: FaceObservabilityHooks | null | undefined,
  err: unknown,
  ctx: Omit<FaceErrorContext, 'errorClass'>,
): string {
  const errorClass = errorClassFor(err);
  hooks?.onError?.(err, { ...ctx, errorClass });
  return errorClass;
}

function normalizeErrorClassPart(value: unknown): string | null {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized.length > 0 ? normalized : null;
}
