<script lang="ts">
  import type {
    WizardEditableTokenInput,
    WizardEditableTokenInputFeedbackTone,
    WizardEditableTokenInputItem,
    WizardEditableTokenInputTone,
  } from './types.js';

  let {
    input,
    onChange,
    onDraftChange = undefined,
  }: {
    input: WizardEditableTokenInput;
    onChange: (next: string[]) => void;
    onDraftChange?: ((next: string) => void) | undefined;
  } = $props();

  const chipPalette: Record<WizardEditableTokenInputTone, { background: string; color: string; border: string }> = {
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

  const feedbackPalette: Record<WizardEditableTokenInputFeedbackTone, { background: string; color: string; border: string }> = {
    info: chipPalette.info,
    success: chipPalette.success,
    warning: chipPalette.warning,
    danger: chipPalette.danger,
  };

  type FeedbackSource = 'caller' | 'validator' | 'duplicate' | 'max-tokens' | 'none';
  interface FeedbackState {
    message: string | undefined;
    tone: WizardEditableTokenInputFeedbackTone;
    source: FeedbackSource;
  }

  function resolveFeedback(current: WizardEditableTokenInput): FeedbackState {
    if (current.feedbackMessage !== undefined && current.feedbackMessage !== '') {
      return {
        message: current.feedbackMessage,
        tone: current.feedbackTone ?? 'info',
        source: 'caller',
      };
    }
    const draft = current.draftValue ?? '';
    if (draft !== '' && current.validateToken !== undefined) {
      const result = current.validateToken(draft);
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
      current.allowDuplicates !== true &&
      current.value.includes(draft)
    ) {
      return {
        message: `"${draft}" is already in the list.`,
        tone: 'warning',
        source: 'duplicate',
      };
    }
    if (
      current.maxTokens !== undefined &&
      current.value.length >= current.maxTokens
    ) {
      return {
        message: `Maximum ${current.maxTokens} tokens reached.`,
        tone: 'warning',
        source: 'max-tokens',
      };
    }
    return { message: undefined, tone: 'info', source: 'none' };
  }

  function metadataForToken(
    current: WizardEditableTokenInput,
    token: string,
  ): WizardEditableTokenInputItem | undefined {
    if (current.items === undefined) return undefined;
    return current.items.find((entry) => entry.value === token);
  }

  function deriveRemoveLabel(current: WizardEditableTokenInput, token: string): string {
    const kind = current.removeLabelKind ?? 'token';
    return `Remove ${kind} ${token}`;
  }

  function isReadOnly(current: WizardEditableTokenInput): boolean {
    return current.readOnly === true || current.disabled === true;
  }

  function isTokenRemovable(
    current: WizardEditableTokenInput,
    index: number,
  ): boolean {
    if (
      isReadOnly(current) ||
      index < 0 ||
      index >= current.value.length
    ) {
      return false;
    }
    const token = current.value[index];
    if (token === undefined) return false;
    const meta = metadataForToken(current, token);
    return meta?.removable !== false && meta?.disabled !== true;
  }

  function commitDraft(
    current: WizardEditableTokenInput,
    raw: string,
    change: (next: string[]) => void,
    draftChange: ((next: string) => void) | undefined,
  ): void {
    const trimmed = raw.trim();
    if (trimmed === '') {
      if (draftChange !== undefined) draftChange('');
      return;
    }
    let next = trimmed;
    if (current.validateToken !== undefined) {
      const result = current.validateToken(trimmed);
      if (!result.valid) return;
      if (result.normalized !== undefined) next = result.normalized;
    }
    if (current.allowDuplicates !== true && current.value.includes(next)) return;
    if (
      current.maxTokens !== undefined &&
      current.value.length >= current.maxTokens
    ) {
      return;
    }
    change([...current.value, next]);
    if (draftChange !== undefined) draftChange('');
  }

  function removeAt(
    current: WizardEditableTokenInput,
    index: number,
    change: (next: string[]) => void,
  ): void {
    if (!isTokenRemovable(current, index)) return;
    change(current.value.slice(0, index).concat(current.value.slice(index + 1)));
  }

  function chipStyle(tone: WizardEditableTokenInputTone): string {
    const palette = chipPalette[tone];
    return `display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:9999px;background:${palette.background};color:${palette.color};border:1px solid ${palette.border};font-size:12px;line-height:1.4;font-family:var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace);`;
  }

  function feedbackStyle(tone: WizardEditableTokenInputFeedbackTone): string {
    const palette = feedbackPalette[tone];
    return `margin:0;padding:6px 10px;border-radius:var(--stitch-radius-sm, 8px);background:${palette.background};color:${palette.color};border:1px solid ${palette.border};font-size:12px;line-height:1.5;`;
  }

  function handleKeydown(event: KeyboardEvent): void {
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
  }

  function handleInput(event: Event): void {
    if (onDraftChange !== undefined) {
      onDraftChange((event.target as HTMLInputElement).value);
    }
  }

  const readOnly = $derived(isReadOnly(input));
  const disabled = $derived(input.disabled === true);
  const feedback = $derived(resolveFeedback(input));
  const feedbackId = $derived(`${input.inputId}-feedback`);
  const descriptionId = $derived(
    input.description !== undefined ? `${input.inputId}-description` : undefined,
  );
  const labelId = $derived(
    input.label !== undefined ? `${input.inputId}-label` : undefined,
  );
  const draftValue = $derived(input.draftValue ?? '');
  const tokenPrefix = $derived(input.tokenPrefix);
  const ariaDescribedBy = $derived(
    [descriptionId, feedback.message !== undefined ? feedbackId : undefined]
      .filter((id): id is string => typeof id === 'string')
      .join(' ') || undefined,
  );
</script>

<section
  class={`facetheory-stitch-wizard-editable-token-input facetheory-stitch-wizard-editable-token-input-${readOnly ? 'readonly' : 'editable'}${disabled ? ' facetheory-stitch-wizard-editable-token-input-disabled' : ''}`}
  data-safety-policy={input.safetyPolicy}
  data-input-id={input.inputId}
  data-token-count={String(input.value.length)}
  data-allow-duplicates={input.allowDuplicates === true ? 'true' : 'false'}
  data-max-tokens={input.maxTokens !== undefined ? String(input.maxTokens) : undefined}
  data-disabled={disabled ? 'true' : 'false'}
  data-read-only={input.readOnly === true ? 'true' : 'false'}
  data-feedback-source={feedback.source}
  style="display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:var(--stitch-radius-lg, 12px);background:var(--stitch-color-surface-container-low, #f2f3ff);color:var(--stitch-color-on-surface, #131b2e);"
>
  {#if input.label !== undefined || input.description !== undefined}
    <header style="display:flex;flex-direction:column;gap:4px;">
      {#if input.label !== undefined}
        <label id={labelId} for={input.inputId} style="font-size:13px;font-weight:600;">
          {input.label}
        </label>
      {/if}
      {#if input.description !== undefined}
        <p
          id={descriptionId}
          style="margin:0;font-size:12px;line-height:1.5;color:var(--stitch-color-on-surface-variant, #464553);"
        >
          {input.description}
        </p>
      {/if}
      {#if input.disabled === true}
        <span
          class="facetheory-stitch-wizard-editable-token-input-state"
          data-state="disabled"
          aria-label="Disabled"
          style="align-self:flex-start;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--stitch-color-on-surface-variant, #464553);"
        >Disabled</span>
      {:else if input.readOnly === true}
        <span
          class="facetheory-stitch-wizard-editable-token-input-state"
          data-state="readonly"
          aria-label="Read-only"
          style="align-self:flex-start;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--stitch-color-on-surface-variant, #464553);"
        >Read-only</span>
      {/if}
    </header>
  {/if}

  {#if input.value.length === 0}
    <div
      class="facetheory-stitch-wizard-editable-token-input-empty"
      role="status"
      style="font-size:12px;color:var(--stitch-color-on-surface-variant, #464553);"
    >No tokens yet.</div>
  {:else}
    <ul
      class="facetheory-stitch-wizard-editable-token-input-chips"
      role="list"
      style="margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px;"
    >
      {#each input.value as token, index (token + '::' + index)}
        {@const meta = metadataForToken(input, token)}
        {@const tone = meta?.tone ?? 'neutral'}
        {@const removable = isTokenRemovable(input, index)}
        <li
          class={`facetheory-stitch-wizard-editable-token-input-chip facetheory-stitch-wizard-editable-token-input-chip-tone-${tone}${meta?.disabled === true ? ' facetheory-stitch-wizard-editable-token-input-chip-disabled' : ''}`}
          data-token-value={token}
          data-token-index={String(index)}
          data-token-tone={tone}
          data-token-removable={removable ? 'true' : 'false'}
          title={meta?.title}
          style={chipStyle(tone)}
        >
          {#if tokenPrefix !== undefined && tokenPrefix !== ''}
            <span
              class="facetheory-stitch-wizard-editable-token-input-chip-prefix"
              aria-hidden="true"
            >{tokenPrefix}</span>
          {/if}
          <span class="facetheory-stitch-wizard-editable-token-input-chip-value">{token}</span>
          {#if removable}
            <button
              type="button"
              class="facetheory-stitch-wizard-editable-token-input-chip-remove"
              aria-label={deriveRemoveLabel(input, token)}
              data-remove-token-index={String(index)}
              data-remove-token-value={token}
              disabled={meta?.disabled === true}
              onclick={() => removeAt(input, index, onChange)}
              style="appearance:none;background:transparent;border:none;color:inherit;cursor:pointer;font-size:14px;line-height:1;padding:0 2px;"
            >×</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if !readOnly}
    <div
      class="facetheory-stitch-wizard-editable-token-input-input-row"
      style="display:flex;align-items:center;gap:8px;"
    >
      <input
        id={input.inputId}
        type="text"
        value={draftValue}
        placeholder={input.placeholder}
        {disabled}
        aria-labelledby={labelId}
        aria-describedby={ariaDescribedBy}
        aria-invalid="false"
        oninput={handleInput}
        onkeydown={handleKeydown}
        class="facetheory-stitch-wizard-editable-token-input-input"
        style="flex:1 1 auto;min-width:0;appearance:none;background:var(--stitch-color-surface-container, #eaedff);border:1px solid var(--stitch-color-outline-variant, #c6c5d0);border-radius:var(--stitch-radius-sm, 8px);padding:6px 10px;font-size:13px;color:var(--stitch-color-on-surface, #131b2e);font-family:inherit;"
      />
    </div>
  {:else}
    <div
      class="facetheory-stitch-wizard-editable-token-input-readonly-state"
      role="status"
      data-state={input.disabled === true ? 'disabled' : 'readonly'}
      style="font-size:12px;color:var(--stitch-color-on-surface-variant, #464553);font-style:italic;"
    >
      {input.disabled === true ? 'Token entry is disabled.' : 'Token entry is read-only.'}
    </div>
  {/if}

  {#if feedback.message !== undefined}
    <p
      id={feedbackId}
      class={`facetheory-stitch-wizard-editable-token-input-feedback facetheory-stitch-wizard-editable-token-input-feedback-${feedback.tone}`}
      role="alert"
      aria-live="polite"
      data-feedback-source={feedback.source}
      data-feedback-tone={feedback.tone}
      style={feedbackStyle(feedback.tone)}
    >{feedback.message}</p>
  {/if}

  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={input.safetyPolicy}
    style="margin:0;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:var(--stitch-color-on-surface-variant, #464553);"
  >Safety policy: {input.safetyPolicy}</p>
</section>
