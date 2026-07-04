<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    columns = 'auto',
    children,
  }: {
    columns?: number | 'auto';
    children?: Snippet;
  } = $props();

  const gridTemplateColumns = $derived(
    columns === 'auto'
      ? 'repeat(auto-fit, minmax(220px, 1fr))'
      : `repeat(${columns}, 1fr)`,
  );
</script>

<div
  class="facetheory-stitch-summary-strip"
  style={`display:grid;grid-template-columns:${gridTemplateColumns};gap:16px;`}
>
  {@render children?.()}
</div>
