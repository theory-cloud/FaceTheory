/**
 * Vue parity for `PackageSourceInputPanel` and `CodeDropzone`. Mirrors the
 * React adapter's class names, data-* attributes, role markers, ARIA
 * wiring, and safety-policy footnote.
 */

import { defineComponent, h } from 'vue';
import type { PropType, VNodeChild } from 'vue';

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
import { renderPropContent } from '../stitch-common.js';

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

const ALERT_STATES = new Set<PackageSourceInputState>(['invalid', 'forbidden', 'redacted']);
const STATUS_STATES = new Set<PackageSourceInputState>(['loading', 'validating', 'ready']);

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

function renderSafetyFootnote(policy: WizardSafetyPolicy): VNodeChild {
  return h(
    'p',
    {
      class: 'facetheory-stitch-wizard-safety-footnote',
      'data-safety-policy': policy,
    },
    `Safety policy: ${policy}`,
  );
}

function renderErrors(
  errors: PackageSourceInputError[],
  groupId: string,
): VNodeChild {
  if (errors.length === 0) return null;
  return h(
    'ul',
    {
      class: 'facetheory-stitch-package-source-input-errors',
      role: 'list',
      'data-error-count': String(errors.length),
    },
    errors.map((error) =>
      h(
        'li',
        {
          key: error.id,
          id: `${groupId}-error-${error.id}`,
          class: `facetheory-stitch-package-source-input-error facetheory-stitch-package-source-input-error-${error.kind}`,
          'data-error-kind': error.kind,
          'data-error-id': error.id,
          role: 'alert',
          'aria-live': 'polite',
        },
        [
          h(
            'strong',
            {
              class: 'facetheory-stitch-package-source-input-error-kind',
              'data-error-kind-label': error.kind,
            },
            ERROR_KIND_LABEL[error.kind],
          ),
          h(
            'span',
            { class: 'facetheory-stitch-package-source-input-error-message' },
            renderPropContent(error.message as VNodeChild),
          ),
          error.evidence !== undefined && error.kind !== 'redacted'
            ? h(
                'code',
                { class: 'facetheory-stitch-package-source-input-error-evidence' },
                error.evidence,
              )
            : null,
        ],
      ),
    ),
  );
}

function renderFileMeta(fileMeta: PackageSourceInputFileMeta): VNodeChild {
  return h(
    'dl',
    {
      class: 'facetheory-stitch-package-source-input-file-meta',
      'data-file-name': fileMeta.name,
    },
    [
      h('div', { key: 'name' }, [h('dt', null, 'File'), h('dd', null, fileMeta.name)]),
      fileMeta.sizeBytes !== undefined
        ? h('div', { key: 'size' }, [
            h('dt', null, 'Size'),
            h('dd', null, `${fileMeta.sizeBytes} B`),
          ])
        : null,
      fileMeta.mediaType !== undefined
        ? h('div', { key: 'media' }, [
            h('dt', null, 'Media type'),
            h('dd', null, fileMeta.mediaType),
          ])
        : null,
      fileMeta.sha256 !== undefined
        ? h('div', { key: 'sha' }, [
            h('dt', null, 'sha256'),
            h('dd', null, h('code', null, fileMeta.sha256)),
          ])
        : null,
    ],
  );
}

function renderActions(
  actions: PackageSourceInputActions | undefined,
  onClear: (() => void) | undefined,
  onReplace: (() => void) | undefined,
  onCopy: ((copyValue: string) => void) | undefined,
): VNodeChild {
  if (actions === undefined) return null;
  const buttons: VNodeChild[] = [];
  if (actions.clear === true) {
    buttons.push(
      h(
        'button',
        {
          key: 'clear',
          type: 'button',
          class: 'facetheory-stitch-package-source-input-action facetheory-stitch-package-source-input-action-clear',
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
          class: 'facetheory-stitch-package-source-input-action facetheory-stitch-package-source-input-action-replace',
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
          class: 'facetheory-stitch-package-source-input-action facetheory-stitch-package-source-input-action-copy',
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
    { class: 'facetheory-stitch-package-source-input-actions' },
    buttons,
  );
}

function renderDropzoneInner(
  input: PackageSourceInput,
  ariaDescribedBy: string | undefined,
  onFiles: ((files: PackageSourceInputFileMeta[]) => void) | undefined,
): VNodeChild {
  const announceLabel = stateLabel(input.state, input.stateLabels);
  const props: Record<string, unknown> = {
    role: 'group',
    class: `facetheory-stitch-package-source-input-dropzone facetheory-stitch-package-source-input-dropzone-state-${input.state}`,
    'data-mode': 'dropzone',
    'data-dropzone-state': input.state,
    'aria-label': announceLabel,
    tabindex: 0,
  };
  if (ariaDescribedBy !== undefined) props['aria-describedby'] = ariaDescribedBy;
  if (input.state === 'loading') props['aria-disabled'] = 'true';
  if (onFiles !== undefined) {
    props.onDragover = (event: DragEvent) => event.preventDefault();
    props.onDrop = (event: DragEvent) => {
      event.preventDefault();
      const files = event.dataTransfer?.files;
      if (files === undefined || files === null) return;
      const meta: PackageSourceInputFileMeta[] = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files.item(i);
        if (file === null) continue;
        const entry: PackageSourceInputFileMeta = { name: file.name, sizeBytes: file.size };
        if (file.type) entry.mediaType = file.type;
        meta.push(entry);
      }
      onFiles(meta);
    };
  }
  return h(
    'div',
    props,
    [
      h('strong', null, 'Drop files here or use the picker'),
      h('span', null, 'Files are parsed by TheoryMCP, not by FaceTheory.'),
    ],
  );
}

export interface PackageSourceInputPanelProps {
  input: PackageSourceInput;
  onValueChange?: (next: string) => void;
  onFiles?: (files: PackageSourceInputFileMeta[]) => void;
  onClear?: () => void;
  onReplace?: () => void;
  onCopy?: (copyValue: string) => void;
}

export const PackageSourceInputPanel = defineComponent({
  name: 'FaceTheoryVuePackageSourceInputPanel',
  props: {
    input: { type: Object as PropType<PackageSourceInput>, required: true },
    onValueChange: {
      type: Function as PropType<(next: string) => void>,
      required: false,
    },
    onFiles: {
      type: Function as PropType<(files: PackageSourceInputFileMeta[]) => void>,
      required: false,
    },
    onClear: {
      type: Function as PropType<() => void>,
      required: false,
    },
    onReplace: {
      type: Function as PropType<() => void>,
      required: false,
    },
    onCopy: {
      type: Function as PropType<(copyValue: string) => void>,
      required: false,
    },
  },
  setup(props) {
    return () => {
      const input = props.input;
      const onValueChange = props.onValueChange;
      const onFiles = props.onFiles;
      const labelId =
        input.label !== undefined ? `${input.groupId}-label` : undefined;
      const descriptionId =
        input.description !== undefined
          ? `${input.groupId}-description`
          : undefined;
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

      const textareaProps: Record<string, unknown> = {
        id: `${input.groupId}-paste`,
        class: 'facetheory-stitch-package-source-input-paste',
        'data-mode': 'paste',
        value: input.value,
        placeholder: input.placeholder,
        'aria-invalid': isAlertState(input.state) ? 'true' : 'false',
      };
      if (labelId !== undefined) textareaProps['aria-labelledby'] = labelId;
      if (ariaDescribedBy !== undefined)
        textareaProps['aria-describedby'] = ariaDescribedBy;
      if (onValueChange !== undefined) {
        textareaProps.onInput = (event: Event) =>
          onValueChange((event.target as HTMLTextAreaElement).value);
      }

      const fileProps: Record<string, unknown> = {
        id: `${input.groupId}-file`,
        type: 'file',
        class: 'facetheory-stitch-package-source-input-file',
      };
      if (ariaDescribedBy !== undefined)
        fileProps['aria-describedby'] = ariaDescribedBy;
      if (input.fileAccept !== undefined) fileProps.accept = input.fileAccept;
      if (onFiles !== undefined) {
        fileProps.onChange = (event: Event) => {
          const target = event.target as HTMLInputElement;
          const files = target.files;
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
        };
      }

      const stateProps: Record<string, unknown> = {
        id: stateAnnouncementId,
        class: `facetheory-stitch-package-source-input-state facetheory-stitch-package-source-input-state-label-${input.state}`,
        'data-state-label': input.state,
      };
      if (stateRole !== undefined) stateProps.role = stateRole;
      if (stateRole === 'status') stateProps['aria-live'] = 'polite';

      return h(
        'section',
        {
          class: `facetheory-stitch-package-source-input facetheory-stitch-package-source-input-state-${input.state}`,
          'data-safety-policy': input.safetyPolicy,
          'data-group-id': input.groupId,
          'data-state': input.state,
          'data-modes': input.modes.join(' '),
          'data-error-count': String(input.errors.length),
          'data-has-file': input.fileMeta !== undefined ? 'true' : 'false',
        },
        [
          input.label !== undefined || input.description !== undefined
            ? h(
                'header',
                null,
                [
                  input.label !== undefined
                    ? h(
                        'label',
                        {
                          id: labelId,
                          for: allowPaste ? `${input.groupId}-paste` : undefined,
                        },
                        renderPropContent(input.label as VNodeChild),
                      )
                    : null,
                  input.description !== undefined
                    ? h(
                        'p',
                        { id: descriptionId },
                        renderPropContent(input.description as VNodeChild),
                      )
                    : null,
                ],
              )
            : null,
          allowPaste ? h('textarea', textareaProps) : null,
          allowDropzone ? renderDropzoneInner(input, ariaDescribedBy, onFiles) : null,
          allowUpload
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-package-source-input-upload',
                  'data-mode': 'upload',
                },
                [
                  h(
                    'label',
                    { for: `${input.groupId}-file` },
                    'Choose a file:',
                  ),
                  h('input', fileProps),
                ],
              )
            : null,
          input.fileMeta !== undefined ? renderFileMeta(input.fileMeta) : null,
          h('p', stateProps, announceLabel),
          renderErrors(input.errors, input.groupId),
          renderActions(
            input.actions,
            props.onClear,
            props.onReplace,
            props.onCopy,
          ),
          renderSafetyFootnote(input.safetyPolicy),
        ],
      );
    };
  },
});

export interface CodeDropzonePanelProps {
  dropzone: CodeDropzoneProps;
  onFiles?: (files: PackageSourceInputFileMeta[]) => void;
}

export const CodeDropzone = defineComponent({
  name: 'FaceTheoryVueCodeDropzone',
  props: {
    dropzone: { type: Object as PropType<CodeDropzoneProps>, required: true },
    onFiles: {
      type: Function as PropType<(files: PackageSourceInputFileMeta[]) => void>,
      required: false,
    },
  },
  setup(props) {
    return () => {
      const dropzone = props.dropzone;
      const onFiles = props.onFiles;
      const labelId =
        dropzone.label !== undefined
          ? `${dropzone.dropzoneId}-label`
          : undefined;
      const descriptionId =
        dropzone.description !== undefined
          ? `${dropzone.dropzoneId}-description`
          : undefined;
      const errorIds = (dropzone.errors ?? []).map(
        (e) => `${dropzone.dropzoneId}-error-${e.id}`,
      );
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
      const sectionProps: Record<string, unknown> = {
        id: dropzone.dropzoneId,
        class: `facetheory-stitch-code-dropzone facetheory-stitch-code-dropzone-state-${dropzone.state}`,
        'data-safety-policy': dropzone.safetyPolicy,
        'data-dropzone-id': dropzone.dropzoneId,
        'data-state': dropzone.state,
        'data-has-file': dropzone.fileMeta !== undefined ? 'true' : 'false',
      };
      if (stateRole !== undefined) sectionProps.role = stateRole;
      if (labelId !== undefined) sectionProps['aria-labelledby'] = labelId;
      if (ariaDescribedBy !== undefined)
        sectionProps['aria-describedby'] = ariaDescribedBy;
      const targetProps: Record<string, unknown> = {
        role: 'group',
        class: `facetheory-stitch-code-dropzone-target facetheory-stitch-code-dropzone-target-state-${dropzone.state}`,
        'data-dropzone-state': dropzone.state,
        'aria-label': announceLabel,
        tabindex: 0,
      };
      if (onFiles !== undefined) {
        targetProps.onDragover = (event: DragEvent) => event.preventDefault();
        targetProps.onDrop = (event: DragEvent) => {
          event.preventDefault();
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
        };
      }
      const stateProps: Record<string, unknown> = {
        class: `facetheory-stitch-code-dropzone-state-label facetheory-stitch-code-dropzone-state-label-${dropzone.state}`,
        'data-state-label': dropzone.state,
      };
      if (stateRole !== undefined) stateProps.role = stateRole;
      if (stateRole === 'status') stateProps['aria-live'] = 'polite';
      return h(
        'section',
        sectionProps,
        [
          dropzone.label !== undefined
            ? h('div', { id: labelId }, renderPropContent(dropzone.label as VNodeChild))
            : null,
          dropzone.description !== undefined
            ? h('p', { id: descriptionId }, renderPropContent(dropzone.description as VNodeChild))
            : null,
          h(
            'div',
            targetProps,
            [
              h('strong', null, dropzone.emptyLabel ?? 'Drop files here'),
              h('span', null, 'Files are parsed by TheoryMCP, not by FaceTheory.'),
            ],
          ),
          dropzone.fileMeta !== undefined ? renderFileMeta(dropzone.fileMeta) : null,
          h('p', stateProps, announceLabel),
          (dropzone.errors ?? []).length > 0
            ? renderErrors(dropzone.errors ?? [], dropzone.dropzoneId)
            : null,
          renderSafetyFootnote(dropzone.safetyPolicy),
        ],
      );
    };
  },
});
