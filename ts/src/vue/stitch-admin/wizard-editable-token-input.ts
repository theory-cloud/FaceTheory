import { defineComponent, h } from 'vue';
import type { PropType, VNodeChild } from 'vue';

import type {
  WizardEditableTokenInput,
  WizardEditableTokenInputFeedbackTone,
  WizardEditableTokenInputItem,
  WizardEditableTokenInputTone,
} from '../../stitch-admin/wizard-editable-token-input-types.js';
import { renderPropContent } from '../stitch-common.js';

const REDACTED_MARKER = '[redacted]';

interface ChipPalette {
  background: string;
  color: string;
  border: string;
}

const chipPalette: Record<WizardEditableTokenInputTone, ChipPalette> = {
  neutral: {
    background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
    color: 'var(--stitch-color-on-surface, #131b2e)',
    border: 'var(--stitch-color-outline-variant, #c6c5d0)',
  },
  info: {
    background: 'var(--stitch-color-primary-container, #e0e0ff)',
    color: 'var(--stitch-color-on-primary-container, #000066)',
    border: 'var(--stitch-color-primary-container, #e0e0ff)',
  },
  success: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    border: 'var(--stitch-color-tertiary-container, #004c45)',
  },
  warning: {
    background: 'var(--stitch-color-secondary-container, #ffecc0)',
    color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    border: 'var(--stitch-color-secondary-container, #ffecc0)',
  },
  danger: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    border: 'var(--stitch-color-error-container, #ffdad6)',
  },
};

const feedbackPalette: Record<WizardEditableTokenInputFeedbackTone, ChipPalette> = {
  info: chipPalette.info,
  success: chipPalette.success,
  warning: chipPalette.warning,
  danger: chipPalette.danger,
};

interface FeedbackState {
  message: string | undefined;
  tone: WizardEditableTokenInputFeedbackTone;
  source: 'caller' | 'validator' | 'duplicate' | 'max-tokens' | 'none';
}

function resolveFeedback(input: WizardEditableTokenInput): FeedbackState {
  if (input.feedbackMessage !== undefined && input.feedbackMessage !== '') {
    return {
      message: input.feedbackMessage,
      tone: input.feedbackTone ?? 'info',
      source: 'caller',
    };
  }
  const draft = input.draftValue ?? '';
  if (draft !== '' && input.validateToken !== undefined) {
    const result = input.validateToken(draft);
    if (!result.valid) {
      return {
        message: result.message ?? 'Token is not valid.',
        tone: 'danger',
        source: 'validator',
      };
    }
  }
  if (
    draft !== '' &&
    input.allowDuplicates !== true &&
    input.value.includes(draft)
  ) {
    return {
      message: `"${draft}" is already in the list.`,
      tone: 'warning',
      source: 'duplicate',
    };
  }
  if (
    input.maxTokens !== undefined &&
    input.value.length >= input.maxTokens
  ) {
    return {
      message: `Maximum ${input.maxTokens} tokens reached.`,
      tone: 'warning',
      source: 'max-tokens',
    };
  }
  return { message: undefined, tone: 'info', source: 'none' };
}

function metadataForToken(
  input: WizardEditableTokenInput,
  token: string,
): WizardEditableTokenInputItem | undefined {
  if (input.items === undefined) return undefined;
  return input.items.find((entry) => entry.value === token);
}

function deriveRemoveLabel(
  input: WizardEditableTokenInput,
  token: string,
): string {
  const kind = input.removeLabelKind ?? 'token';
  return `Remove ${kind} ${token}`;
}

function isReadOnly(input: WizardEditableTokenInput): boolean {
  return input.readOnly === true || input.disabled === true;
}

function isTokenRemovable(
  input: WizardEditableTokenInput,
  index: number,
  readOnly = isReadOnly(input),
): boolean {
  if (readOnly || index < 0 || index >= input.value.length) return false;
  const token = input.value[index];
  if (token === undefined) return false;
  const meta = metadataForToken(input, token);
  return meta?.removable !== false && meta?.disabled !== true;
}

function commitDraft(
  input: WizardEditableTokenInput,
  raw: string,
  onChange: (next: string[]) => void,
  onDraftChange: ((next: string) => void) | undefined,
): void {
  const trimmed = raw.trim();
  if (trimmed === '') {
    if (onDraftChange !== undefined) onDraftChange('');
    return;
  }
  let next = trimmed;
  if (input.validateToken !== undefined) {
    const result = input.validateToken(trimmed);
    if (!result.valid) return;
    if (result.normalized !== undefined) next = result.normalized;
  }
  if (input.allowDuplicates !== true && input.value.includes(next)) return;
  if (input.maxTokens !== undefined && input.value.length >= input.maxTokens) {
    return;
  }
  onChange([...input.value, next]);
  if (onDraftChange !== undefined) onDraftChange('');
}

function removeAt(
  input: WizardEditableTokenInput,
  index: number,
  onChange: (next: string[]) => void,
): void {
  if (!isTokenRemovable(input, index)) return;
  onChange(input.value.slice(0, index).concat(input.value.slice(index + 1)));
}

export interface WizardEditableTokenInputPanelProps {
  input: WizardEditableTokenInput;
  onChange: (next: string[]) => void;
  onDraftChange?: (next: string) => void;
}

/**
 * Vue parity for the React `WizardEditableTokenInputPanel`. Renders the same
 * DOM, classes, data-* attributes, and ARIA wiring so consumers see a
 * matching primitive across adapters. Controlled — no hidden state, no
 * `Math.random()`, no `Date.now()`, no `window` reads, no server validation
 * at render time.
 */
export const WizardEditableTokenInputPanel = defineComponent({
  name: 'FaceTheoryVueWizardEditableTokenInputPanel',
  props: {
    input: {
      type: Object as PropType<WizardEditableTokenInput>,
      required: true,
    },
    onChange: {
      type: Function as PropType<(next: string[]) => void>,
      required: true,
    },
    onDraftChange: {
      type: Function as PropType<(next: string) => void>,
      required: false,
    },
  },
  setup(props) {
    return () => {
      const input = props.input;
      const onChange = props.onChange;
      const onDraftChange = props.onDraftChange;
      const readOnly = isReadOnly(input);
      const disabled = input.disabled === true;
      const feedback = resolveFeedback(input);
      const feedbackId = `${input.inputId}-feedback`;
      const descriptionId =
        input.description !== undefined
          ? `${input.inputId}-description`
          : undefined;
      const labelId =
        input.label !== undefined ? `${input.inputId}-label` : undefined;
      const draftValue = input.draftValue ?? '';
      const tokenPrefix = input.tokenPrefix;
      const ariaDescribedBy =
        [descriptionId, feedback.message !== undefined ? feedbackId : undefined]
          .filter((id): id is string => typeof id === 'string')
          .join(' ') || undefined;

      return h(
        'section',
        {
          class: `facetheory-stitch-wizard-editable-token-input facetheory-stitch-wizard-editable-token-input-${readOnly ? 'readonly' : 'editable'}${disabled ? ' facetheory-stitch-wizard-editable-token-input-disabled' : ''}`,
          'data-safety-policy': input.safetyPolicy,
          'data-input-id': input.inputId,
          'data-token-count': String(input.value.length),
          'data-allow-duplicates': input.allowDuplicates === true ? 'true' : 'false',
          'data-max-tokens':
            input.maxTokens !== undefined ? String(input.maxTokens) : undefined,
          'data-disabled': disabled ? 'true' : 'false',
          'data-read-only': input.readOnly === true ? 'true' : 'false',
          'data-feedback-source': feedback.source,
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '12px',
            borderRadius: 'var(--stitch-radius-lg, 12px)',
            background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
            color: 'var(--stitch-color-on-surface, #131b2e)',
          },
        },
        [
          renderHeader(input, labelId, descriptionId),
          renderChipRow(input, onChange, readOnly, tokenPrefix),
          !readOnly
            ? renderInputRow(
                input,
                onChange,
                onDraftChange,
                ariaDescribedBy,
                draftValue,
                disabled,
                labelId,
              )
            : renderReadOnlyState(input),
          feedback.message !== undefined
            ? renderFeedback(feedback, feedbackId)
            : null,
          renderSafetyFootnote(input.safetyPolicy),
        ],
      );
    };
  },
});

/** ChipList alias matching the React adapter's alternate naming. */
export const WizardChipListPanel = WizardEditableTokenInputPanel;
export type WizardChipListPanelProps = WizardEditableTokenInputPanelProps;

function renderHeader(
  input: WizardEditableTokenInput,
  labelId: string | undefined,
  descriptionId: string | undefined,
): VNodeChild {
  if (input.label === undefined && input.description === undefined) return null;
  return h(
    'header',
    {
      style: { display: 'flex', flexDirection: 'column', gap: '4px' },
    },
    [
      input.label !== undefined
        ? h(
            'label',
            {
              id: labelId,
              for: input.inputId,
              style: { fontSize: '13px', fontWeight: 600 },
            },
            renderPropContent(input.label as VNodeChild),
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
            renderPropContent(input.description as VNodeChild),
          )
        : null,
      input.disabled === true
        ? h(
            'span',
            {
              class: 'facetheory-stitch-wizard-editable-token-input-state',
              'data-state': 'disabled',
              'aria-label': 'Disabled',
              style: {
                alignSelf: 'flex-start',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--stitch-color-on-surface-variant, #464553)',
              },
            },
            'Disabled',
          )
        : input.readOnly === true
          ? h(
              'span',
              {
                class: 'facetheory-stitch-wizard-editable-token-input-state',
                'data-state': 'readonly',
                'aria-label': 'Read-only',
                style: {
                  alignSelf: 'flex-start',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--stitch-color-on-surface-variant, #464553)',
                },
              },
              'Read-only',
            )
          : null,
    ],
  );
}

function renderChipRow(
  input: WizardEditableTokenInput,
  onChange: (next: string[]) => void,
  readOnly: boolean,
  tokenPrefix: string | undefined,
): VNodeChild {
  if (input.value.length === 0) {
    return h(
      'div',
      {
        class: 'facetheory-stitch-wizard-editable-token-input-empty',
        role: 'status',
        style: {
          fontSize: '12px',
          color: 'var(--stitch-color-on-surface-variant, #464553)',
        },
      },
      'No tokens yet.',
    );
  }
  return h(
    'ul',
    {
      class: 'facetheory-stitch-wizard-editable-token-input-chips',
      role: 'list',
      style: {
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
      },
    },
    input.value.map((token, index) =>
      renderChip(input, token, index, onChange, readOnly, tokenPrefix),
    ),
  );
}

function renderChip(
  input: WizardEditableTokenInput,
  token: string,
  index: number,
  onChange: (next: string[]) => void,
  readOnly: boolean,
  tokenPrefix: string | undefined,
): VNodeChild {
  const meta = metadataForToken(input, token);
  const tone: WizardEditableTokenInputTone = meta?.tone ?? 'neutral';
  const palette = chipPalette[tone];
  const isRemovable = isTokenRemovable(input, index, readOnly);
  const removeLabel = deriveRemoveLabel(input, token);
  return h(
    'li',
    {
      key: `${token}::${index}`,
      class: `facetheory-stitch-wizard-editable-token-input-chip facetheory-stitch-wizard-editable-token-input-chip-tone-${tone}${meta?.disabled === true ? ' facetheory-stitch-wizard-editable-token-input-chip-disabled' : ''}`,
      'data-token-value': token,
      'data-token-index': String(index),
      'data-token-tone': tone,
      'data-token-removable': isRemovable ? 'true' : 'false',
      title: meta?.title,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 8px',
        borderRadius: '9999px',
        background: palette.background,
        color: palette.color,
        border: `1px solid ${palette.border}`,
        fontSize: '12px',
        lineHeight: 1.4,
        fontFamily:
          'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)',
      },
    },
    [
      tokenPrefix !== undefined && tokenPrefix !== ''
        ? h(
            'span',
            {
              class: 'facetheory-stitch-wizard-editable-token-input-chip-prefix',
              'aria-hidden': 'true',
            },
            tokenPrefix,
          )
        : null,
      h(
        'span',
        {
          class: 'facetheory-stitch-wizard-editable-token-input-chip-value',
        },
        token,
      ),
      isRemovable
        ? h(
            'button',
            {
              type: 'button',
              class: 'facetheory-stitch-wizard-editable-token-input-chip-remove',
              'aria-label': removeLabel,
              'data-remove-token-index': String(index),
              'data-remove-token-value': token,
              disabled: meta?.disabled === true,
              onClick: () => removeAt(input, index, onChange),
              style: {
                appearance: 'none',
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: '14px',
                lineHeight: 1,
                padding: '0 2px',
              },
            },
            '×',
          )
        : null,
    ],
  );
}

function renderInputRow(
  input: WizardEditableTokenInput,
  onChange: (next: string[]) => void,
  onDraftChange: ((next: string) => void) | undefined,
  ariaDescribedBy: string | undefined,
  draftValue: string,
  disabled: boolean,
  labelId: string | undefined,
): VNodeChild {
  return h(
    'div',
    {
      class: 'facetheory-stitch-wizard-editable-token-input-input-row',
      style: { display: 'flex', alignItems: 'center', gap: '8px' },
    },
    h('input', {
      id: input.inputId,
      type: 'text',
      value: draftValue,
      placeholder: input.placeholder,
      disabled,
      'aria-labelledby': labelId,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': 'false',
      onInput: (event: Event) => {
        if (onDraftChange !== undefined) {
          onDraftChange((event.target as HTMLInputElement).value);
        }
      },
      onKeydown: (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ',') {
          event.preventDefault();
          commitDraft(input, draftValue, onChange, onDraftChange);
          return;
        }
        if (
          event.key === 'Backspace' &&
          draftValue === '' &&
          input.value.length > 0
        ) {
          const lastTokenIndex = input.value.length - 1;
          if (isTokenRemovable(input, lastTokenIndex)) {
            event.preventDefault();
            removeAt(input, lastTokenIndex, onChange);
          }
        }
      },
      class: 'facetheory-stitch-wizard-editable-token-input-input',
      style: {
        flex: '1 1 auto',
        minWidth: 0,
        appearance: 'none',
        background: 'var(--stitch-color-surface-container, #eaedff)',
        border: '1px solid var(--stitch-color-outline-variant, #c6c5d0)',
        borderRadius: 'var(--stitch-radius-sm, 8px)',
        padding: '6px 10px',
        fontSize: '13px',
        color: 'var(--stitch-color-on-surface, #131b2e)',
        fontFamily: 'inherit',
      },
    }),
  );
}

function renderReadOnlyState(input: WizardEditableTokenInput): VNodeChild {
  return h(
    'div',
    {
      class: 'facetheory-stitch-wizard-editable-token-input-readonly-state',
      role: 'status',
      'data-state': input.disabled === true ? 'disabled' : 'readonly',
      style: {
        fontSize: '12px',
        color: 'var(--stitch-color-on-surface-variant, #464553)',
        fontStyle: 'italic',
      },
    },
    input.disabled === true
      ? 'Token entry is disabled.'
      : 'Token entry is read-only.',
  );
}

function renderFeedback(
  feedback: FeedbackState,
  feedbackId: string,
): VNodeChild {
  const palette = feedbackPalette[feedback.tone];
  return h(
    'p',
    {
      id: feedbackId,
      class: `facetheory-stitch-wizard-editable-token-input-feedback facetheory-stitch-wizard-editable-token-input-feedback-${feedback.tone}`,
      role: 'alert',
      'aria-live': 'polite',
      'data-feedback-source': feedback.source,
      'data-feedback-tone': feedback.tone,
      style: {
        margin: 0,
        padding: '6px 10px',
        borderRadius: 'var(--stitch-radius-sm, 8px)',
        background: palette.background,
        color: palette.color,
        border: `1px solid ${palette.border}`,
        fontSize: '12px',
        lineHeight: 1.5,
      },
    },
    feedback.message,
  );
}

function renderSafetyFootnote(policy: string): VNodeChild {
  return h(
    'p',
    {
      class: 'facetheory-stitch-wizard-safety-footnote',
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

// Re-export shared types for vue consumers (mirrors react adapter shape).
export type {
  WizardEditableTokenInput,
  WizardEditableTokenInputFeedbackTone,
  WizardEditableTokenInputItem,
  WizardEditableTokenInputTone,
} from '../../stitch-admin/wizard-editable-token-input-types.js';

// Note: `REDACTED_MARKER` reserved for future redaction wiring; the editable
// token input is value-only and does not surface secret-like data, but the
// constant is kept aligned with the React/Svelte adapters.
void REDACTED_MARKER;
