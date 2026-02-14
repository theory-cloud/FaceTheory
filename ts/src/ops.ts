import type { FaceMode } from './types.js';

export type FaceLogLevel = 'debug' | 'info' | 'warn' | 'error';

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
}

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
  log?: (record: FaceRequestCompletedLogRecord) => void;

  /**
   * Minimal metrics sink (counters / histograms depending on backend).
   */
  metric?: (record: FaceMetricRecord) => void;
}

export function logLevelForStatus(status: number): FaceLogLevel {
  const code = Math.trunc(Number(status));
  if (!Number.isFinite(code)) return 'info';
  if (code >= 500) return 'error';
  if (code >= 400) return 'warn';
  return 'info';
}

