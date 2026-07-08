<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    code,
    copyLabel = 'Copy',
    size = 'md',
    onCopy = undefined,
    children,
  }: {
    code?: string;
    copyLabel?: string;
    size?: 'sm' | 'md';
    onCopy?: ((code: string) => void) | undefined;
    children?: Snippet;
  } = $props();

  function handleCopy(): void {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.clipboard?.writeText === 'function'
    ) {
      void navigator.clipboard.writeText(code ?? '');
    }
    onCopy?.(code ?? '');
  }

  const padding = $derived(size === 'sm' ? '2px 8px' : '4px 10px');
  const fontSize = $derived(size === 'sm' ? '11px' : '12px');
</script>

<span
  class="facetheory-stitch-copyable-code"
  style={`display:inline-flex;align-items:center;gap:6px;padding:${padding};font-size:${fontSize};font-family:var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--stitch-color-on-surface, #131b2e);background:var(--stitch-color-surface-container-low, #f2f3ff);border-radius:var(--stitch-radius-md, 8px);max-width:100%;`}
>
  <code
    class="facetheory-stitch-copyable-code-value"
    style="font-family:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;"
  >
    {#if children}{@render children()}{:else}{code}{/if}
  </code>
  <button
    type="button"
    aria-label={copyLabel}
    class="facetheory-stitch-copyable-code-button"
    onclick={handleCopy}
    style="display:inline-flex;align-items:center;justify-content:center;padding:2px 6px;font-size:11px;font-weight:600;color:var(--stitch-color-on-surface-variant, #464553);background:transparent;border:none;border-radius:6px;cursor:pointer;"
  >
    {copyLabel}
  </button>
</span>
