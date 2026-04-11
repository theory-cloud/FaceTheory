<script lang="ts">
  import Sidebar from './Sidebar.svelte';
  import Topbar from './Topbar.svelte';
  import type { NavItem } from './nav-types.js';

  export let nav: NavItem[] = [];
  export let activeKey: string | undefined = undefined;
  export let openKeys: string[] | undefined = undefined;
  export let collapsed = false;
  export let onNavigate: ((path: string, key: string) => void) | undefined = undefined;
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
    <Topbar>
      <div slot="left"><slot name="topbarLeft" /></div>
      <div slot="center"><slot name="topbarCenter" /></div>
      <div slot="right"><slot name="topbarRight" /></div>
    </Topbar>

    <main class="facetheory-stitch-shell-content" style="padding:0;overflow:auto;flex:1;">
      <slot />
    </main>
  </div>
</div>
