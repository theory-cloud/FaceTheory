<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();
</script>

<ul
  class="facetheory-stitch-consent-list"
  style="display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none;"
>
  {@render children?.()}
</ul>
