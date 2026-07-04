<script lang="ts">
  import {
    BrandHeader,
    Shell,
  } from '@theory-cloud/facetheory/svelte/stitch-shell';

  export let message: string;

  const nav = [
    { key: '/dashboard', label: 'Dashboard', path: '/dashboard' },
  ];
</script>

<!--
  Minimal positive fixture for the Shell -> Topbar `topbarLogo` /
  `topbarSurfaceLabel` snippet-forwarding path. Used alongside App.svelte so the
  example test can assert both the omission (App.svelte, no topbar brand
  snippets) and the forwarding (AppBrand.svelte, topbar brand snippets filled)
  behaviors of the Svelte adapter. Svelte 5 runes: named content is passed with
  `{#snippet name()}...{/snippet}` in place of the legacy `slot="name"` syntax.
-->
<Shell {nav} activeKey="/dashboard">
  {#snippet topbarLogo()}
    <div data-testid="topbar-logo">
      <BrandHeader logo="◆" wordmark="Theory Cloud" surfaceTone="tertiary" />
    </div>
  {/snippet}
  {#snippet topbarSurfaceLabel()}<span data-testid="topbar-surface">[Auth]</span>{/snippet}
  {#snippet topbarRight()}<span>Jane Doe</span>{/snippet}
  <p>Hello {message}</p>
</Shell>
