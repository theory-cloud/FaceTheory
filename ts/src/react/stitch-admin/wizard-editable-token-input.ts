import * as React from 'react';

import type {
  WizardChipList,
  WizardChipListFeedbackTone,
  WizardChipListItem,
  WizardChipListTone,
  WizardChipListValidationResult,
  WizardEditableTokenInput,
  WizardEditableTokenInputFeedbackTone,
  WizardEditableTokenInputItem,
  WizardEditableTokenInputTone,
  WizardEditableTokenInputValidationResult,
} from '../../stitch-admin/wizard-editable-token-input-types.js';
import type { WizardSafetyPolicy } from '../../stitch-admin/wizard-types.js';

const h = React.createElement;

export type {
  WizardChipList,
  WizardChipListFeedbackTone,
  WizardChipListItem,
  WizardChipListTone,
  WizardChipListValidationResult,
  WizardEditableTokenInput,
  WizardEditableTokenInputFeedbackTone,
  WizardEditableTokenInputItem,
  WizardEditableTokenInputTone,
  WizardEditableTokenInputValidationResult,
};

interface ChipPalette {
  background: string;
  color: string;
  border: string;
}

const CHIP_PALETTE: Record<WizardEditableTokenInputTone, ChipPalette> = {
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

const FEEDBACK_PALETTE: Record<WizardEditableTokenInputFeedbackTone, ChipPalette> = {
  info: CHIP_PALETTE.info,
  success: CHIP_PALETTE.success,
  warning: CHIP_PALETTE.warning,
  danger: CHIP_PALETTE.danger,
};

export interface WizardEditableTokenInputPanelProps {
  input: WizardEditableTokenInput;
  /**
   * Required. Called whenever the primitive wants to propose a new token
   * list (commit on Enter/comma, remove via Backspace, remove via chip
   * button). The host owns acceptance; the primitive does not enforce.
   */
  onChange: (next: string[]) => void;
  /**
   * Called whenever the draft text changes (input typing or commit clear).
   * If omitted, the input still renders and is keyboard-controlled, but
   * the host must wire draft state separately.
   */
  onDraftChange?: (next: string) => void;
}

/**
 * Resolved feedback state for render. Pure function of the input props.
 */
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

function commitDraft(
  input: WizardEditableTokenInput,
  raw: string,
  onChange: WizardEditableTokenInputPanelProps['onChange'],
  onDraftChange: WizardEditableTokenInputPanelProps['onDraftChange'],
): void {
  const trimmed = raw.trim();
  if (trimmed === '') {
    if (onDraftChange !== undefined) onDraftChange('');
    return;
  }
  let next = trimmed;
  if (input.validateToken !== undefined) {
    const result = input.validateToken(trimmed);
    if (!result.valid) {
      // Leave the draft in place so the user can correct it.
      return;
    }
    if (result.normalized !== undefined) {
      next = result.normalized;
    }
  }
  if (input.allowDuplicates !== true && input.value.includes(next)) {
    return;
  }
  if (input.maxTokens !== undefined && input.value.length >= input.maxTokens) {
    return;
  }
  onChange([...input.value, next]);
  if (onDraftChange !== undefined) onDraftChange('');
}

function removeAt(
  input: WizardEditableTokenInput,
  index: number,
  onChange: WizardEditableTokenInputPanelProps['onChange'],
): void {
  if (index < 0 || index >= input.value.length) return;
  const next = input.value.slice(0, index).concat(input.value.slice(index + 1));
  onChange(next);
}

export function WizardEditableTokenInputPanel(
  props: WizardEditableTokenInputPanelProps,
): React.ReactElement {
  const { input, onChange, onDraftChange } = props;
  const readOnly = isReadOnly(input);
  const disabled = input.disabled === true;
  const feedback = resolveFeedback(input);
  const feedbackId = `${input.inputId}-feedback`;
  const descriptionId = input.description !== undefined ? `${input.inputId}-description` : undefined;
  const labelId = input.label !== undefined ? `${input.inputId}-label` : undefined;
  const draftValue = input.draftValue ?? '';
  const tokenPrefix = input.tokenPrefix;
  const ariaDescribedBy = [descriptionId, feedback.message !== undefined ? feedbackId : undefined]
    .filter((id): id is string => typeof id === 'string')
    .join(' ') || undefined;

  return h(
    'section',
    {
      className: `facetheory-stitch-wizard-editable-token-input facetheory-stitch-wizard-editable-token-input-${readOnly ? 'readonly' : 'editable'}${disabled ? ' facetheory-stitch-wizard-editable-token-input-disabled' : ''}`,
      'data-safety-policy': input.safetyPolicy,
      'data-input-id': input.inputId,
      'data-token-count': String(input.value.length),
      'data-allow-duplicates': input.allowDuplicates === true ? 'true' : 'false',
      'data-max-tokens': input.maxTokens !== undefined ? String(input.maxTokens) : undefined,
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
    renderHeader(input, labelId, descriptionId),
    renderChipRow(input, onChange, readOnly, tokenPrefix),
    !readOnly
      ? renderInputRow(input, onChange, onDraftChange, ariaDescribedBy, draftValue, disabled, labelId)
      : renderReadOnlyState(input),
    feedback.message !== undefined
      ? renderFeedback(feedback, feedbackId)
      : null,
    renderSafetyFootnote(input.safetyPolicy),
  );
}

/** Stable alias for callers who prefer the ChipList naming. */
export const WizardChipListPanel = WizardEditableTokenInputPanel;
export type WizardChipListPanelProps = WizardEditableTokenInputPanelProps;

function renderHeader(
  input: WizardEditableTokenInput,
  labelId: string | undefined,
  descriptionId: string | undefined,
): React.ReactElement | null {
  if (input.label === undefined && input.description === undefined) return null;
  return h(
    'header',
    {
      style: { display: 'flex', flexDirection: 'column', gap: '4px' },
    },
    input.label !== undefined
      ? h(
          'label',
          {
            id: labelId,
            htmlFor: input.inputId,
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
    input.disabled === true
      ? h(
          'span',
          {
            className: 'facetheory-stitch-wizard-editable-token-input-state',
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
              className: 'facetheory-stitch-wizard-editable-token-input-state',
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
  );
}

function renderChipRow(
  input: WizardEditableTokenInput,
  onChange: WizardEditableTokenInputPanelProps['onChange'],
  readOnly: boolean,
  tokenPrefix: string | undefined,
): React.ReactElement {
  if (input.value.length === 0) {
    return h(
      'div',
      {
        className: 'facetheory-stitch-wizard-editable-token-input-empty',
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
      className: 'facetheory-stitch-wizard-editable-token-input-chips',
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
  onChange: WizardEditableTokenInputPanelProps['onChange'],
  readOnly: boolean,
  tokenPrefix: string | undefined,
): React.ReactElement {
  const meta = metadataForToken(input, token);
  const tone: WizardEditableTokenInputTone = meta?.tone ?? 'neutral';
  const palette = CHIP_PALETTE[tone];
  const isRemovable =
    !readOnly && meta?.removable !== false && meta?.disabled !== true;
  const removeLabel = deriveRemoveLabel(input, token);

  return h(
    'li',
    {
      key: `${token}::${index}`,
      className: `facetheory-stitch-wizard-editable-token-input-chip facetheory-stitch-wizard-editable-token-input-chip-tone-${tone}${meta?.disabled === true ? ' facetheory-stitch-wizard-editable-token-input-chip-disabled' : ''}`,
      'data-token-value': token,
      'data-token-index': String(index),
      'data-token-tone': tone,
      'data-token-removable': isRemovable ? 'true' : 'false',
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
        fontFamily: 'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)',
      },
      title: meta?.title,
    },
    tokenPrefix !== undefined && tokenPrefix !== ''
      ? h(
          'span',
          {
            className: 'facetheory-stitch-wizard-editable-token-input-chip-prefix',
            'aria-hidden': 'true',
          },
          tokenPrefix,
        )
      : null,
    h(
      'span',
      {
        className: 'facetheory-stitch-wizard-editable-token-input-chip-value',
      },
      token,
    ),
    isRemovable
      ? h(
          'button',
          {
            type: 'button',
            className: 'facetheory-stitch-wizard-editable-token-input-chip-remove',
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
  );
}

function renderInputRow(
  input: WizardEditableTokenInput,
  onChange: WizardEditableTokenInputPanelProps['onChange'],
  onDraftChange: WizardEditableTokenInputPanelProps['onDraftChange'],
  ariaDescribedBy: string | undefined,
  draftValue: string,
  disabled: boolean,
  labelId: string | undefined,
): React.ReactElement {
  return h(
    'div',
    {
      className: 'facetheory-stitch-wizard-editable-token-input-input-row',
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
      'aria-invalid': false,
      // Always wire an onChange so React does not treat the input as
      // accidentally uncontrolled when the host omits `onDraftChange`.
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        if (onDraftChange !== undefined) {
          onDraftChange(event.target.value);
        }
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
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
          event.preventDefault();
          removeAt(input, input.value.length - 1, onChange);
        }
      },
      className: 'facetheory-stitch-wizard-editable-token-input-input',
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

function renderReadOnlyState(input: WizardEditableTokenInput): React.ReactElement {
  return h(
    'div',
    {
      className: 'facetheory-stitch-wizard-editable-token-input-readonly-state',
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
): React.ReactElement {
  const palette = FEEDBACK_PALETTE[feedback.tone];
  return h(
    'p',
    {
      id: feedbackId,
      className: `facetheory-stitch-wizard-editable-token-input-feedback facetheory-stitch-wizard-editable-token-input-feedback-${feedback.tone}`,
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
