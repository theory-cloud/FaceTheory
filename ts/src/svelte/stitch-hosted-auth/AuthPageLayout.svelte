<script lang="ts">
  export let background: 'surface' | 'gradient' = 'surface';

  $: backgroundStyle =
    background === 'gradient'
      ? 'linear-gradient(135deg, var(--stitch-color-primary, #1f108e) 0%, var(--stitch-color-primary-container, #3730a3) 100%)'
      : 'var(--stitch-color-surface, #faf8ff)';
</script>

<div
  class="facetheory-stitch-auth-page"
  style={`min-height:100vh;display:flex;flex-direction:column;background:${backgroundStyle};`}
>
  <header class="facetheory-stitch-auth-page-brand" style="padding:24px 32px;">
    <slot name="brand" />
  </header>

  <main
    class="facetheory-stitch-auth-page-main"
    style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px;"
  >
    <slot />
  </main>

  <footer
    class="facetheory-stitch-auth-page-footer"
    style="padding:16px 32px 24px;display:flex;justify-content:center;gap:16px;"
  >
    <slot name="footer" />
  </footer>
</div>
