<script lang="ts">
  export let length = 6;
  export let value: string | undefined = undefined;
  export let onChange: ((value: string) => void) | undefined = undefined;
  export let onComplete: ((value: string) => void) | undefined = undefined;
  export let disabled = false;
  export let invalid = false;
  export let autoFocus = true;

  let internalValue = value ?? '';

  $: currentValue = value ?? internalValue;

  function splitValue(raw: string): string[] {
    const chars = raw.slice(0, length).split('');
    while (chars.length < length) chars.push('');
    return chars;
  }

  function updateIndex(index: number, nextChar: string): void {
    const chars = splitValue(currentValue);
    chars[index] = nextChar.slice(-1);
    const nextValue = chars.join('').slice(0, length).trimEnd();
    internalValue = nextValue;
    onChange?.(nextValue);
    if (nextValue.length === length) onComplete?.(nextValue);
  }
</script>

<div
  class:facetheory-stitch-otp-input={true}
  class:facetheory-stitch-otp-input-invalid={invalid}
  style="display:flex;gap:8px;"
>
  {#each splitValue(currentValue) as char, index (index)}
    <input
      value={char}
      maxlength="1"
      inputmode="numeric"
      pattern="[0-9]*"
      disabled={disabled}
      autofocus={autoFocus && index === 0}
      aria-invalid={invalid ? 'true' : undefined}
      on:input={(event) => updateIndex(index, (event.currentTarget as HTMLInputElement).value)}
      style={`width:44px;height:48px;text-align:center;border-radius:var(--stitch-radius-md, 6px);border:${
        invalid
          ? '1px solid var(--stitch-color-error, #ba1a1a)'
          : '1px solid transparent'
      };background:var(--stitch-color-surface-container-high, #e2e7ff);font-size:18px;color:var(--stitch-color-on-surface, #131b2e);`}
    />
  {/each}
</div>
