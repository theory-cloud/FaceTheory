/**
 * Framework-neutral types for the FaceTheory `PackageSourceInput` and
 * lower-level `CodeDropzone` primitives. The TheoryMCP Agent Import &
 * Completion Wizard uses these on the "where does the package come from"
 * step (paste, file upload, or drag/drop). Hosts may enable any subset of
 * modes.
 *
 * Trust boundary (load-bearing):
 *
 *   - Presentation-only. FaceTheory does NOT parse package bodies,
 *     validate syntax, scan for secrets, check entitlements, check GitHub
 *     or email policy, or authorize packages.
 *   - theory-mcp-server (the host) remains authoritative server-side
 *     before preview/apply.
 *   - Hosts may pass convenience parse/validation status; the primitive
 *     displays it. Hosts must pre-redact any error evidence — the
 *     primitive renders `evidence` verbatim and never asks for or displays
 *     raw secret values.
 *   - `state`, `errors`, and `fileMeta` are all caller-supplied. The
 *     primitive routes events back to the host via callbacks and never
 *     toggles its own state.
 */

import type { WizardSafetyPolicy } from './wizard-types.js';

/** Which input modes the host wants exposed in the primitive's UI. */
export type PackageSourceInputMode = 'paste' | 'upload' | 'dropzone';

/**
 * Caller-supplied state machine. The primitive renders ARIA / role markers
 * based on the value but never computes the transition. Most-recent host
 * value wins; the primitive treats `state` as authoritative for display.
 */
export type PackageSourceInputState =
  | 'idle'
  | 'loading'
  | 'validating'
  | 'ready'
  | 'invalid'
  | 'forbidden'
  | 'redacted';

/** Kind of error rendered below the input. */
export type PackageSourceInputErrorKind =
  | 'invalid-syntax'
  | 'forbidden'
  | 'redacted'
  | 'unsafe'
  | 'other';

/**
 * A single error to render.
 *
 * The primitive enforces a strict evidence-suppression rule: **only
 * `invalid-syntax` errors render `evidence`**. For every other kind
 * (`forbidden`, `redacted`, `unsafe`, `other`) the primitive ignores
 * `evidence` and renders only the `message`. This protects against hosts
 * accidentally passing secret-like content in `evidence` for any of the
 * sensitive kinds.
 *
 * Hosts should treat `evidence` as a safe place to surface parse-location
 * info (line / column / offset) for `invalid-syntax`. For every other
 * kind, pre-redact aggressively or pass `evidence: undefined`.
 */
export interface PackageSourceInputError {
  /** Stable identifier used for keying. */
  id: string;
  kind: PackageSourceInputErrorKind;
  /** Short human-readable message. Adapters narrow to their native node type. */
  message: unknown;
  /**
   * Optional caller-supplied evidence. Rendered verbatim **only** when
   * `kind === 'invalid-syntax'`; suppressed for every other kind. Hosts
   * must still treat this as a presentation field — FaceTheory does NOT
   * try to clean evidence or redact secrets by inspection.
   */
  evidence?: string;
}

/**
 * SSR-safe description of an attached file. The primitive never holds a
 * real `File` object across renders — hosts pass this caller-controlled
 * metadata so SSR markup is deterministic.
 */
export interface PackageSourceInputFileMeta {
  name: string;
  /** Optional caller-supplied size in bytes. */
  sizeBytes?: number;
  /** Optional caller-supplied media type. */
  mediaType?: string;
  /** Optional caller-supplied content sha. */
  sha256?: string;
}

/**
 * Which actions the primitive should render alongside the input. The host
 * still owns the actual behavior — the primitive only renders the buttons
 * and emits callbacks.
 */
export interface PackageSourceInputActions {
  /** Render a "Clear" button that calls `onClear`. */
  clear?: boolean;
  /** Render a "Replace" button that calls `onReplace`. */
  replace?: boolean;
  /**
   * Render a "Copy" button that calls `onCopy`. The primitive does NOT
   * write to the clipboard; the host wires the actual copy. The button
   * carries `data-copy-value="<host-supplied-payload>"` only when
   * `actions.copyValue` is provided as a string.
   */
  copy?: boolean;
  /**
   * Caller-supplied copy payload for the Copy button. The primitive does
   * NOT extract this from `value` (which may contain secrets).
   */
  copyValue?: string;
}

/**
 * The PackageSourceInput envelope. Hosts compute selection state, errors,
 * and file metadata; the primitive only displays them.
 */
export interface PackageSourceInput {
  /** Stable HTML id used to wire `<label>` / `aria-describedby`. */
  groupId: string;
  /**
   * Current paste-mode value. The host owns it; the primitive renders it
   * inside the `<textarea>` and routes change events back via
   * `onValueChange`.
   */
  value: string;
  /** Authoritative display state. */
  state: PackageSourceInputState;
  /** Errors to render below the input. */
  errors: PackageSourceInputError[];
  /** Which input modes are exposed. The order is the render order. */
  modes: PackageSourceInputMode[];
  /** Optional attached-file metadata (SSR-safe). */
  fileMeta?: PackageSourceInputFileMeta;
  /** Optional placeholder for the paste textarea. */
  placeholder?: string;
  /** Optional label rendered above the input. */
  label?: unknown;
  /** Optional descriptive copy wired via `aria-describedby`. */
  description?: unknown;
  /**
   * Optional caller-supplied "validating" / "ready" announcement text.
   * Defaults to standard strings; hosts override for localization.
   */
  stateLabels?: Partial<Record<PackageSourceInputState, string>>;
  /** Action buttons to render. */
  actions?: PackageSourceInputActions;
  /**
   * Optional `accept` attribute for the file picker (MIME types or
   * extensions). Caller-supplied; the primitive does NOT compute it.
   */
  fileAccept?: string;
  /** Explicit safety policy assertion rendered into the DOM. */
  safetyPolicy: WizardSafetyPolicy;
}

/**
 * Standalone CodeDropzone props — the dropzone surface rendered outside
 * the larger PackageSourceInput envelope. Same trust boundary applies.
 */
export interface CodeDropzoneProps {
  /** Required stable id used to wire label / aria-describedby refs. */
  dropzoneId: string;
  /** Display label. Adapters narrow to their native node type. */
  label?: unknown;
  /** Helper copy / accessible description for the drop target. */
  description?: unknown;
  /** Authoritative state for the dropzone affordance. */
  state: PackageSourceInputState;
  /** Optional caller-supplied file metadata if a file is attached. */
  fileMeta?: PackageSourceInputFileMeta;
  /** Optional placeholder copy for the empty state. */
  emptyLabel?: string;
  /** Optional accept attribute for the underlying file picker. */
  fileAccept?: string;
  /** Optional state-to-label overrides. */
  stateLabels?: Partial<Record<PackageSourceInputState, string>>;
  /** Errors to surface inside the dropzone (typically `invalid-syntax`). */
  errors?: PackageSourceInputError[];
  /** Explicit safety policy assertion. */
  safetyPolicy: WizardSafetyPolicy;
}
