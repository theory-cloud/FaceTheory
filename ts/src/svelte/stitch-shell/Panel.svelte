<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    padded = true,
    elevated = true,
    children,
  }: {
    padded?: boolean;
    elevated?: boolean;
    children?: Snippet;
  } = $props();
</script>

<div
  class="facetheory-stitch-panel"
  style={`background:${
    elevated
      ? 'var(--stitch-color-surface-container-lowest, #ffffff)'
      : 'var(--stitch-color-surface-container-low, #f2f3ff)'
  };border-radius:var(--stitch-radius-xl, 16px);padding:${padded ? '24px' : '0'};`}
>
  {@render children?.()}
</div>
