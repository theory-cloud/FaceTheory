/**
 * Severity levels rendered by the Stitch LogStream primitive. Each level
 * maps to a token-bound color in the framework adapters so tenant themes
 * re-skin log output automatically.
 */
export type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error';

/**
 * A single log/audit row. Consumers build this array from whatever backing
 * store they use (CloudWatch tail, DynamoDB stream, an in-memory audit
 * buffer, ...) — the primitive only cares about the row shape.
 */
export interface LogEntry {
  /** Stable identifier for React keying and dedupe. */
  id: string;
  /**
   * Absolute timestamp. Use an ISO-8601 string or a millisecond epoch
   * number; the adapter renders whichever form you provide.
   */
  timestamp: string | number;
  /** Severity level; drives the row color. */
  level: LogLevel;
  /** The log message body. Adapters narrow this to their node type. */
  message: unknown;
  /**
   * Optional actor/source label (e.g. principal, agent email, service name).
   * Adapters narrow this to their node type.
   */
  actor?: unknown;
}
