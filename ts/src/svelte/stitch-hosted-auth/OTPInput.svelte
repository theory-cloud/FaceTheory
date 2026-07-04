<script lang="ts">
  import {
    authOtpInputClassName,
    splitAuthOtpValue,
    updateAuthOtpValueAtIndex,
  } from '../../stitch-hosted-auth/index.js';

  let {
    length = 6,
    value = undefined,
    onChange = undefined,
    onComplete = undefined,
    disabled = false,
    invalid = false,
    autoFocus = true,
  }: {
    length?: number;
    value?: string | undefined;
    onChange?: ((value: string) => void) | undefined;
    onComplete?: ((value: string) => void) | undefined;
    disabled?: boolean;
    invalid?: boolean;
    autoFocus?: boolean;
  } = $props();

  let internalValue = $state(value ?? '');

  const currentValue = $derived(value ?? internalValue);

  function updateIndex(index: number, nextChar: string): void {
    const nextValue = updateAuthOtpValueAtIndex(
      currentValue,
      length,
      index,
      nextChar,
    );
    internalValue = nextValue;
    onChange?.(nextValue);
    if (nextValue.length === length) onComplete?.(nextValue);
  }
</script>

<div
  class={authOtpInputClassName(invalid)}
  style="display:flex;gap:8px;"
>
  {#each splitAuthOtpValue(currentValue, length) as char, index (index)}
    <input
      value={char}
      maxlength="1"
      inputmode="numeric"
      pattern="[0-9]*"
      disabled={disabled}
      autofocus={autoFocus && index === 0}
      aria-invalid={invalid ? 'true' : undefined}
      oninput={(event) => updateIndex(index, (event.currentTarget as HTMLInputElement).value)}
      style={`width:44px;height:48px;text-align:center;border-radius:var(--stitch-radius-md, 6px);border:${
        invalid
          ? '1px solid var(--stitch-color-error, #ba1a1a)'
          : '1px solid transparent'
      };background:var(--stitch-color-surface-container-high, #e2e7ff);font-size:18px;color:var(--stitch-color-on-surface, #131b2e);`}
    />
  {/each}
</div>
