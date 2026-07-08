<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    description = undefined,
    children,
  }: {
    description?: unknown;
    children?: Snippet;
  } = $props();
</script>

<div
  class="facetheory-stitch-page-title"
  style="display:flex;flex-direction:column;gap:4px;"
>
  <h1 style="margin:0;font-size:28px;line-height:1.2;">
    {@render children?.()}
  </h1>

  {#if description !== undefined}
    <p
      style="margin:0;font-size:14px;color:var(--stitch-color-on-surface-variant, #464553);"
    >
      {description}
    </p>
  {/if}
</div>
