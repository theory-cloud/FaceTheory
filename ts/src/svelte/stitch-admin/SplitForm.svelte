<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();
</script>

<div
  class="facetheory-stitch-split-form"
  style="display:flex;flex-direction:column;gap:32px;"
>
  {@render children?.()}
</div>
