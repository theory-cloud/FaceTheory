<script lang="ts">
  import Sidebar from './Sidebar.svelte';
  import Topbar from './Topbar.svelte';
  import type { NavItem } from './nav-types.js';

  export let nav: NavItem[] = [];
  export let activeKey: string | undefined = undefined;
  export let openKeys: string[] | undefined = undefined;
  export let collapsed = false;
  export let onNavigate: ((path: string, key: string) => void) | undefined = undefined;

  // Reflect the presence of consumer-provided topbar brand slots as booleans
  // for Topbar. Svelte 5 does not let slot-attributed elements live inside
  // `{#if}` blocks (and collapses `<slot name="x" slot="y" />` inside `{#if}`
  // into default-slot content), so we forward the slots unconditionally and
  // let Topbar decide whether to render the wrapper chrome based on these
  // boolean hints. Without this, Topbar's `$$slots.logo` would read truthy
  // whenever Shell is in the middle and produce phantom wrappers + gap
  // spacing on the left edge.
  $: showTopbarLogo = Boolean($$slots.topbarLogo);
  $: showTopbarSurfaceLabel = Boolean($$slots.topbarSurfaceLabel);
</script>

<div
  class="facetheory-stitch-shell"
  style="min-height:100vh;display:flex;background:var(--stitch-color-background, #faf8ff);"
>
  <Sidebar {nav} {activeKey} {openKeys} {collapsed} {onNavigate}>
    <div slot="brand"><slot name="brand" /></div>
    <div slot="footer"><slot name="sidebarFooter" /></div>
  </Sidebar>

  <div style="flex:1;display:flex;flex-direction:column;min-width:0;">
    <Topbar showLogo={showTopbarLogo} showSurfaceLabel={showTopbarSurfaceLabel}>
      <slot name="topbarLogo" slot="logo" />
      <slot name="topbarSurfaceLabel" slot="surfaceLabel" />
      <div slot="left"><slot name="topbarLeft" /></div>
      <div slot="center"><slot name="topbarCenter" /></div>
      <div slot="right"><slot name="topbarRight" /></div>
    </Topbar>

    <main class="facetheory-stitch-shell-content" style="padding:0;overflow:auto;flex:1;">
      <slot />
    </main>
  </div>
</div>
