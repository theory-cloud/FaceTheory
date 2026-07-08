<script lang="ts">
  import type { Snippet } from 'svelte';
  import { resolveAuthPageBackground } from '../../stitch-hosted-auth/index.js';
  import type { AuthPageBackground } from '../../stitch-hosted-auth/index.js';

  let {
    background = 'surface',
    brand,
    footer,
    children,
  }: {
    background?: AuthPageBackground;
    brand?: Snippet;
    footer?: Snippet;
    children?: Snippet;
  } = $props();

  const backgroundStyle = $derived(resolveAuthPageBackground(background));
</script>

<div
  class="facetheory-stitch-auth-page"
  style={`min-height:100vh;display:flex;flex-direction:column;background:${backgroundStyle};`}
>
  <header class="facetheory-stitch-auth-page-brand" style="padding:24px 32px;">
    {@render brand?.()}
  </header>

  <main
    class="facetheory-stitch-auth-page-main"
    style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px;"
  >
    {@render children?.()}
  </main>

  <footer
    class="facetheory-stitch-auth-page-footer"
    style="padding:16px 32px 24px;display:flex;justify-content:center;gap:16px;"
  >
    {@render footer?.()}
  </footer>
</div>
