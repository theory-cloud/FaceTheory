<script lang="ts">
  import type { Snippet } from 'svelte';
  import SidebarItems from './SidebarItems.svelte';
  import type { NavItem } from './nav-types.js';

  let {
    nav = [],
    activeKey = undefined,
    openKeys = undefined,
    collapsed = false,
    onNavigate = undefined,
    brand,
    footer,
  }: {
    nav?: NavItem[];
    activeKey?: string | undefined;
    openKeys?: string[] | undefined;
    collapsed?: boolean;
    onNavigate?: ((path: string, key: string) => void) | undefined;
    brand?: Snippet;
    footer?: Snippet;
  } = $props();
</script>

<aside
  class="facetheory-stitch-sidebar"
  style={`width:${collapsed ? '72px' : '264px'};display:flex;flex-direction:column;min-height:100vh;padding:16px 8px;gap:12px;background:var(--stitch-color-surface-container-low, #f2f3ff);`}
>
  <div class="facetheory-stitch-sidebar-brand" style="padding:8px 12px;">
    {@render brand?.()}
  </div>

  <div class="facetheory-stitch-sidebar-menu" style="flex:1;overflow-y:auto;">
    <ul style="display:flex;flex-direction:column;gap:4px;margin:0;padding:0;">
      <SidebarItems items={nav} {activeKey} {openKeys} {onNavigate} />
    </ul>
  </div>

  <div class="facetheory-stitch-sidebar-footer" style="padding:8px 12px;">
    {@render footer?.()}
  </div>
</aside>
