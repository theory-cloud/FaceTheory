<script lang="ts">
  import {
    BrandHeader,
    Shell,
  } from '../../../src/svelte/stitch-shell/index.js';

  export let message: string;

  const nav = [
    { key: '/dashboard', label: 'Dashboard', path: '/dashboard' },
  ];
</script>

<!--
  Minimal positive fixture for the Shell -> Topbar `topbarLogo` /
  `topbarSurfaceLabel` slot-forwarding path. Used alongside App.svelte so the
  example test can assert both the omission (App.svelte, no topbar brand
  slots) and the forwarding (AppBrand.svelte, topbar brand slots filled)
  behaviors of the Svelte adapter.
-->
<Shell {nav} activeKey="/dashboard">
  <div slot="topbarLogo" data-testid="topbar-logo">
    <BrandHeader
      logo="◆"
      wordmark="Theory Cloud"
      surfaceTone="tertiary"
    />
  </div>
  <span slot="topbarSurfaceLabel" data-testid="topbar-surface">[Auth]</span>
  <span slot="topbarRight">Jane Doe</span>
  <p>Hello {message}</p>
</Shell>
