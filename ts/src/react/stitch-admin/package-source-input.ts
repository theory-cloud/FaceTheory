import * as React from 'react';

import type {
  CodeDropzoneProps,
  PackageSourceInput,
  PackageSourceInputActions,
  PackageSourceInputError,
  PackageSourceInputErrorKind,
  PackageSourceInputFileMeta,
  PackageSourceInputMode,
  PackageSourceInputState,
} from '../../stitch-admin/package-source-input-types.js';
import type { WizardSafetyPolicy } from '../../stitch-admin/wizard-types.js';

const h = React.createElement;

export type {
  CodeDropzoneProps,
  PackageSourceInput,
  PackageSourceInputActions,
  PackageSourceInputError,
  PackageSourceInputErrorKind,
  PackageSourceInputFileMeta,
  PackageSourceInputMode,
  PackageSourceInputState,
};

const STATE_LABEL_DEFAULTS: Record<PackageSourceInputState, string> = {
  idle: 'Awaiting source',
  loading: 'Loading source',
  validating: 'Validating source',
  ready: 'Ready for server preview',
  invalid: 'Invalid source',
  forbidden: 'Source not allowed',
  redacted: 'Source contains redacted content',
};

const ERROR_KIND_LABEL: Record<PackageSourceInputErrorKind, string> = {
  'invalid-syntax': 'Invalid syntax',
  forbidden: 'Forbidden',
  redacted: 'Redacted',
  unsafe: 'Unsafe',
  other: 'Error',
};

const ALERT_STATES: ReadonlySet<PackageSourceInputState> = new Set([
  'invalid',
  'forbidden',
  'redacted',
]);

const STATUS_STATES: ReadonlySet<PackageSourceInputState> = new Set([
  'loading',
  'validating',
  'ready',
]);

function isAlertState(state: PackageSourceInputState): boolean {
  return ALERT_STATES.has(state);
}

function isStatusState(state: PackageSourceInputState): boolean {
  return STATUS_STATES.has(state);
}

function stateLabel(
  state: PackageSourceInputState,
  overrides?: PackageSourceInput['stateLabels'],
): string {
  if (overrides !== undefined && overrides[state] !== undefined) {
    return overrides[state] as string;
  }
  return STATE_LABEL_DEFAULTS[state];
}

function renderSafetyFootnote(policy: WizardSafetyPolicy): React.ReactElement {
  return h(
    'p',
    {
      className: 'facetheory-stitch-wizard-safety-footnote',
      'data-safety-policy': policy,
      style: {
        margin: 0,
        fontSize: '11px',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--stitch-color-on-surface-variant, #464553)',
      },
    },
    `Safety policy: ${policy}`,
  );
}

function renderErrors(
  errors: PackageSourceInputError[],
  groupId: string,
): React.ReactElement | null {
  if (errors.length === 0) return null;
  return h(
    'ul',
    {
      key: 'errors',
      className: 'facetheory-stitch-package-source-input-errors',
      role: 'list',
      'data-error-count': String(errors.length),
      style: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' },
    },
    errors.map((error) =>
      h(
        'li',
        {
          key: error.id,
          id: `${groupId}-error-${error.id}`,
          className: `facetheory-stitch-package-source-input-error facetheory-stitch-package-source-input-error-${error.kind}`,
          'data-error-kind': error.kind,
          'data-error-id': error.id,
          role: 'alert',
          'aria-live': 'polite',
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            padding: '8px 10px',
            borderRadius: 'var(--stitch-radius-sm, 8px)',
            background:
              error.kind === 'forbidden' || error.kind === 'redacted' || error.kind === 'unsafe'
                ? 'var(--stitch-color-error-container, #ffdad6)'
                : 'var(--stitch-color-secondary-container, #ffecc0)',
            color:
              error.kind === 'forbidden' || error.kind === 'redacted' || error.kind === 'unsafe'
                ? 'var(--stitch-color-on-error-container, #93000a)'
                : 'var(--stitch-color-on-secondary-container, #3f2e00)',
            fontSize: '12px',
            lineHeight: 1.5,
          },
        },
        h(
          'strong',
          {
            className: 'facetheory-stitch-package-source-input-error-kind',
            'data-error-kind-label': error.kind,
          },
          ERROR_KIND_LABEL[error.kind],
        ),
        h('span', { className: 'facetheory-stitch-package-source-input-error-message' }, error.message as React.ReactNode),
        error.evidence !== undefined && error.kind === 'invalid-syntax'
          ? h(
              'code',
              {
                className: 'facetheory-stitch-package-source-input-error-evidence',
                style: { fontSize: '11px', overflowWrap: 'anywhere' },
              },
              error.evidence,
            )
          : null,
      ),
    ),
  );
}

function renderFileMeta(
  fileMeta: PackageSourceInputFileMeta,
): React.ReactElement {
  return h(
    'dl',
    {
      key: 'file-meta',
      className: 'facetheory-stitch-package-source-input-file-meta',
      'data-file-name': fileMeta.name,
      style: { margin: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: '12px' },
    },
    h(
      'div',
      { key: 'name' },
      h('dt', { key: 'dt' }, 'File'),
      h('dd', { key: 'dd' }, fileMeta.name),
    ),
    fileMeta.sizeBytes !== undefined
      ? h(
          'div',
          { key: 'size' },
          h('dt', { key: 'dt' }, 'Size'),
          h('dd', { key: 'dd' }, `${fileMeta.sizeBytes} B`),
        )
      : null,
    fileMeta.mediaType !== undefined
      ? h(
          'div',
          { key: 'media' },
          h('dt', { key: 'dt' }, 'Media type'),
          h('dd', { key: 'dd' }, fileMeta.mediaType),
        )
      : null,
    fileMeta.sha256 !== undefined
      ? h(
          'div',
          { key: 'sha' },
          h('dt', { key: 'dt' }, 'sha256'),
          h(
            'dd',
            { key: 'dd' },
            h(
              'code',
              { style: { fontSize: '11px', overflowWrap: 'anywhere' } },
              fileMeta.sha256,
            ),
          ),
        )
      : null,
  );
}

function renderActions(
  actions: PackageSourceInputActions | undefined,
  onClear: (() => void) | undefined,
  onReplace: (() => void) | undefined,
  onCopy: ((copyValue: string) => void) | undefined,
): React.ReactElement | null {
  if (actions === undefined) return null;
  const buttons: React.ReactElement[] = [];
  if (actions.clear === true) {
    buttons.push(
      h(
        'button',
        {
          key: 'clear',
          type: 'button',
          className: 'facetheory-stitch-package-source-input-action facetheory-stitch-package-source-input-action-clear',
          'data-action': 'clear',
          'aria-label': 'Clear package source',
          onClick: onClear,
        },
        'Clear',
      ),
    );
  }
  if (actions.replace === true) {
    buttons.push(
      h(
        'button',
        {
          key: 'replace',
          type: 'button',
          className: 'facetheory-stitch-package-source-input-action facetheory-stitch-package-source-input-action-replace',
          'data-action': 'replace',
          'aria-label': 'Replace package source',
          onClick: onReplace,
        },
        'Replace',
      ),
    );
  }
  if (actions.copy === true && actions.copyValue !== undefined) {
    const copyValue = actions.copyValue;
    buttons.push(
      h(
        'button',
        {
          key: 'copy',
          type: 'button',
          className: 'facetheory-stitch-package-source-input-action facetheory-stitch-package-source-input-action-copy',
          'data-action': 'copy',
          'data-copy-value': copyValue,
          'aria-label': 'Copy package source',
          onClick: onCopy !== undefined ? () => onCopy(copyValue) : undefined,
        },
        'Copy',
      ),
    );
  }
  if (buttons.length === 0) return null;
  return h(
    'div',
    {
      key: 'actions',
      className: 'facetheory-stitch-package-source-input-actions',
      style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    },
    buttons,
  );
}

/* -------------------------------------------------------------------------- */
/* PackageSourceInputPanel                                                    */
/* -------------------------------------------------------------------------- */

export interface PackageSourceInputPanelProps {
  input: PackageSourceInput;
  /** Required when 'paste' mode is exposed. */
  onValueChange?: (next: string) => void;
  /**
   * Called when the host should accept new file metadata (drag/drop or
   * file-picker). The primitive never reads the File body; the host parses
   * the file outside and pushes back state.
   */
  onFiles?: (files: PackageSourceInputFileMeta[]) => void;
  onClear?: () => void;
  onReplace?: () => void;
  /** Copy the host-supplied actions.copyValue payload. */
  onCopy?: (copyValue: string) => void;
}

export function PackageSourceInputPanel(
  props: PackageSourceInputPanelProps,
): React.ReactElement {
  const { input, onValueChange, onFiles, onClear, onReplace, onCopy } = props;
  const labelId = input.label !== undefined ? `${input.groupId}-label` : undefined;
  const descriptionId =
    input.description !== undefined ? `${input.groupId}-description` : undefined;
  const stateAnnouncementId = `${input.groupId}-state`;
  const errorIds = input.errors.map((e) => `${input.groupId}-error-${e.id}`);
  const ariaDescribedBy =
    [descriptionId, stateAnnouncementId, ...errorIds]
      .filter((id): id is string => typeof id === 'string')
      .join(' ') || undefined;
  const allowPaste = input.modes.includes('paste');
  const allowUpload = input.modes.includes('upload');
  const allowDropzone = input.modes.includes('dropzone');
  const announceLabel = stateLabel(input.state, input.stateLabels);
  const stateRole = isAlertState(input.state)
    ? 'alert'
    : isStatusState(input.state)
      ? 'status'
      : undefined;

  return h(
    'section',
    {
      className: `facetheory-stitch-package-source-input facetheory-stitch-package-source-input-state-${input.state}`,
      'data-safety-policy': input.safetyPolicy,
      'data-group-id': input.groupId,
      'data-state': input.state,
      'data-modes': input.modes.join(' '),
      'data-error-count': String(input.errors.length),
      'data-has-file': input.fileMeta !== undefined ? 'true' : 'false',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
        color: 'var(--stitch-color-on-surface, #131b2e)',
      },
    },
    input.label !== undefined || input.description !== undefined
      ? h(
          'header',
          { key: 'header', style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
          input.label !== undefined
            ? h(
                'label',
                {
                  id: labelId,
                  htmlFor: allowPaste ? `${input.groupId}-paste` : undefined,
                  style: { fontSize: '13px', fontWeight: 600 },
                },
                input.label as React.ReactNode,
              )
            : null,
          input.description !== undefined
            ? h(
                'p',
                {
                  id: descriptionId,
                  style: {
                    margin: 0,
                    fontSize: '12px',
                    lineHeight: 1.5,
                    color: 'var(--stitch-color-on-surface-variant, #464553)',
                  },
                },
                input.description as React.ReactNode,
              )
            : null,
        )
      : null,
    allowPaste
      ? h(
          'textarea',
          {
            key: 'paste',
            id: `${input.groupId}-paste`,
            className: 'facetheory-stitch-package-source-input-paste',
            'data-mode': 'paste',
            value: input.value,
            placeholder: input.placeholder,
            'aria-labelledby': labelId,
            'aria-describedby': ariaDescribedBy,
            'aria-invalid': isAlertState(input.state) ? 'true' : 'false',
            onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
              if (onValueChange !== undefined) onValueChange(event.target.value);
            },
            style: {
              width: '100%',
              minHeight: '120px',
              padding: '10px',
              fontFamily: 'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)',
              fontSize: '13px',
              border: '1px solid var(--stitch-color-outline-variant, #c6c5d0)',
              borderRadius: 'var(--stitch-radius-sm, 8px)',
              background: 'var(--stitch-color-surface-container, #eaedff)',
              color: 'inherit',
              resize: 'vertical',
            },
          },
        )
      : null,
    allowDropzone
      ? renderDropzoneInner(input, onFiles, ariaDescribedBy)
      : null,
    allowUpload
      ? h(
          'div',
          {
            key: 'upload',
            className: 'facetheory-stitch-package-source-input-upload',
            'data-mode': 'upload',
            style: { display: 'flex', alignItems: 'center', gap: '8px' },
          },
          h(
            'label',
            {
              htmlFor: `${input.groupId}-file`,
              style: { fontSize: '12px', color: 'var(--stitch-color-on-surface-variant, #464553)' },
            },
            'Choose a file:',
          ),
          h('input', {
            id: `${input.groupId}-file`,
            type: 'file',
            className: 'facetheory-stitch-package-source-input-file',
            'aria-describedby': ariaDescribedBy,
            accept: input.fileAccept,
            onChange:
              onFiles !== undefined
                ? (event: React.ChangeEvent<HTMLInputElement>) => {
                    const files = event.target.files;
                    if (files === null) return;
                    const meta: PackageSourceInputFileMeta[] = [];
                    for (let i = 0; i < files.length; i += 1) {
                      const file = files.item(i);
                      if (file === null) continue;
                      const entry: PackageSourceInputFileMeta = {
                        name: file.name,
                        sizeBytes: file.size,
                      };
                      if (file.type) entry.mediaType = file.type;
                      meta.push(entry);
                    }
                    onFiles(meta);
                  }
                : undefined,
          }),
        )
      : null,
    input.fileMeta !== undefined ? renderFileMeta(input.fileMeta) : null,
    h(
      'p',
      {
        key: 'state',
        id: stateAnnouncementId,
        className: `facetheory-stitch-package-source-input-state facetheory-stitch-package-source-input-state-label-${input.state}`,
        'data-state-label': input.state,
        role: stateRole,
        'aria-live': stateRole === 'status' ? 'polite' : undefined,
        style: {
          margin: 0,
          fontSize: '12px',
          fontWeight: 600,
          color: isAlertState(input.state)
            ? 'var(--stitch-color-on-error-container, #93000a)'
            : 'var(--stitch-color-on-surface-variant, #464553)',
        },
      },
      announceLabel,
    ),
    renderErrors(input.errors, input.groupId),
    renderActions(input.actions, onClear, onReplace, onCopy),
    renderSafetyFootnote(input.safetyPolicy),
  );
}

function renderDropzoneInner(
  input: PackageSourceInput,
  onFiles: PackageSourceInputPanelProps['onFiles'],
  ariaDescribedBy: string | undefined,
): React.ReactElement {
  const announceLabel = stateLabel(input.state, input.stateLabels);
  return h(
    'div',
    {
      key: 'dropzone',
      role: 'group',
      className: `facetheory-stitch-package-source-input-dropzone facetheory-stitch-package-source-input-dropzone-state-${input.state}`,
      'data-mode': 'dropzone',
      'data-dropzone-state': input.state,
      'aria-label': announceLabel,
      'aria-describedby': ariaDescribedBy,
      'aria-disabled': input.state === 'loading' ? 'true' : undefined,
      tabIndex: 0,
      onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
      },
      onDrop: (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (onFiles === undefined) return;
        const files = event.dataTransfer?.files;
        if (files === undefined || files === null) return;
        const meta: PackageSourceInputFileMeta[] = [];
        for (let i = 0; i < files.length; i += 1) {
          const file = files.item(i);
          if (file === null) continue;
          const entry: PackageSourceInputFileMeta = {
            name: file.name,
            sizeBytes: file.size,
          };
          if (file.type) entry.mediaType = file.type;
          meta.push(entry);
        }
        onFiles(meta);
      },
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        border: '2px dashed var(--stitch-color-outline-variant, #c6c5d0)',
        borderRadius: 'var(--stitch-radius-md, 10px)',
        background: 'var(--stitch-color-surface-container, #eaedff)',
        textAlign: 'center',
      },
    },
    h('strong', { style: { fontSize: '13px' } }, 'Drop files here or use the picker'),
    h(
      'span',
      { style: { fontSize: '11px', color: 'var(--stitch-color-on-surface-variant, #464553)' } },
      'Files are parsed by TheoryMCP, not by FaceTheory.',
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Standalone CodeDropzone                                                    */
/* -------------------------------------------------------------------------- */

export interface CodeDropzonePanelProps {
  dropzone: CodeDropzoneProps;
  onFiles?: (files: PackageSourceInputFileMeta[]) => void;
}

export function CodeDropzone(props: CodeDropzonePanelProps): React.ReactElement {
  const { dropzone, onFiles } = props;
  const labelId = dropzone.label !== undefined ? `${dropzone.dropzoneId}-label` : undefined;
  const descriptionId =
    dropzone.description !== undefined ? `${dropzone.dropzoneId}-description` : undefined;
  const errorIds = (dropzone.errors ?? []).map((e) => `${dropzone.dropzoneId}-error-${e.id}`);
  const ariaDescribedBy =
    [descriptionId, ...errorIds]
      .filter((id): id is string => typeof id === 'string')
      .join(' ') || undefined;
  const announceLabel = stateLabel(dropzone.state, dropzone.stateLabels);
  const stateRole = isAlertState(dropzone.state)
    ? 'alert'
    : isStatusState(dropzone.state)
      ? 'status'
      : undefined;

  return h(
    'section',
    {
      id: dropzone.dropzoneId,
      className: `facetheory-stitch-code-dropzone facetheory-stitch-code-dropzone-state-${dropzone.state}`,
      'data-safety-policy': dropzone.safetyPolicy,
      'data-dropzone-id': dropzone.dropzoneId,
      'data-state': dropzone.state,
      'data-has-file': dropzone.fileMeta !== undefined ? 'true' : 'false',
      role: stateRole,
      'aria-labelledby': labelId,
      'aria-describedby': ariaDescribedBy,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
      },
    },
    dropzone.label !== undefined
      ? h(
          'div',
          { id: labelId, style: { fontSize: '13px', fontWeight: 600 } },
          dropzone.label as React.ReactNode,
        )
      : null,
    dropzone.description !== undefined
      ? h(
          'p',
          { id: descriptionId, style: { margin: 0, fontSize: '12px', lineHeight: 1.5, color: 'var(--stitch-color-on-surface-variant, #464553)' } },
          dropzone.description as React.ReactNode,
        )
      : null,
    h(
      'div',
      {
        role: 'group',
        className: `facetheory-stitch-code-dropzone-target facetheory-stitch-code-dropzone-target-state-${dropzone.state}`,
        'data-dropzone-state': dropzone.state,
        'aria-label': announceLabel,
        tabIndex: 0,
        onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
          event.preventDefault();
        },
        onDrop: (event: React.DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          if (onFiles === undefined) return;
          const files = event.dataTransfer?.files;
          if (files === undefined || files === null) return;
          const meta: PackageSourceInputFileMeta[] = [];
          for (let i = 0; i < files.length; i += 1) {
            const file = files.item(i);
            if (file === null) continue;
            const entry: PackageSourceInputFileMeta = {
              name: file.name,
              sizeBytes: file.size,
            };
            if (file.type) entry.mediaType = file.type;
            meta.push(entry);
          }
          onFiles(meta);
        },
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          border: '2px dashed var(--stitch-color-outline-variant, #c6c5d0)',
          borderRadius: 'var(--stitch-radius-md, 10px)',
          background: 'var(--stitch-color-surface-container, #eaedff)',
          textAlign: 'center',
        },
      },
      h(
        'strong',
        { style: { fontSize: '13px' } },
        dropzone.emptyLabel ?? 'Drop files here',
      ),
      h(
        'span',
        { style: { fontSize: '11px', color: 'var(--stitch-color-on-surface-variant, #464553)' } },
        'Files are parsed by TheoryMCP, not by FaceTheory.',
      ),
    ),
    dropzone.fileMeta !== undefined ? renderFileMeta(dropzone.fileMeta) : null,
    h(
      'p',
      {
        className: `facetheory-stitch-code-dropzone-state-label facetheory-stitch-code-dropzone-state-label-${dropzone.state}`,
        'data-state-label': dropzone.state,
        role: stateRole,
        'aria-live': stateRole === 'status' ? 'polite' : undefined,
        style: { margin: 0, fontSize: '12px', fontWeight: 600 },
      },
      announceLabel,
    ),
    (dropzone.errors ?? []).length > 0
      ? renderErrors(dropzone.errors ?? [], dropzone.dropzoneId)
      : null,
    renderSafetyFootnote(dropzone.safetyPolicy),
  );
}
