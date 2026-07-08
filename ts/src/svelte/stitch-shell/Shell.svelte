<script lang="ts">
  import type { Snippet } from 'svelte';
  import Sidebar from './Sidebar.svelte';
  import Topbar from './Topbar.svelte';
  import type { NavItem } from './nav-types.js';

  // Consumer-facing snippets are destructured under `*Slot` local names so the
  // `{#snippet name()}` blocks forwarded to Sidebar/Topbar below (which must be
  // named for the child's snippet prop, e.g. `brand`, `logo`) do not shadow the
  // consumer's own `brand`/`topbarLogo`/... snippets while rendering them.
  let {
    nav = [],
    activeKey = undefined,
    openKeys = undefined,
    collapsed = false,
    onNavigate = undefined,
    brand: brandSlot,
    sidebarFooter: sidebarFooterSlot,
    topbarLogo: topbarLogoSlot,
    topbarSurfaceLabel: topbarSurfaceLabelSlot,
    topbarLeft: topbarLeftSlot,
    topbarCenter: topbarCenterSlot,
    topbarRight: topbarRightSlot,
    children,
  }: {
    nav?: NavItem[];
    activeKey?: string | undefined;
    openKeys?: string[] | undefined;
    collapsed?: boolean;
    onNavigate?: ((path: string, key: string) => void) | undefined;
    brand?: Snippet;
    sidebarFooter?: Snippet;
    topbarLogo?: Snippet;
    topbarSurfaceLabel?: Snippet;
    topbarLeft?: Snippet;
    topbarCenter?: Snippet;
    topbarRight?: Snippet;
    children?: Snippet;
  } = $props();

  // Reflect the presence of consumer-provided topbar brand snippets as booleans
  // for Topbar. Shell forwards the snippets to Topbar unconditionally, so
  // Topbar's own `logo`/`surfaceLabel` snippet props always read truthy; these
  // hints let Topbar decide whether to render the wrapper chrome and avoid
  // phantom wrappers + gap spacing on the left edge.
  const showTopbarLogo = $derived(Boolean(topbarLogoSlot));
  const showTopbarSurfaceLabel = $derived(Boolean(topbarSurfaceLabelSlot));
</script>

<div
  class="facetheory-stitch-shell"
  style="min-height:100vh;display:flex;background:var(--stitch-color-background, #faf8ff);"
>
  <Sidebar {nav} {activeKey} {openKeys} {collapsed} {onNavigate}>
    {#snippet brand()}<div>{@render brandSlot?.()}</div>{/snippet}
    {#snippet footer()}<div>{@render sidebarFooterSlot?.()}</div>{/snippet}
  </Sidebar>

  <div style="flex:1;display:flex;flex-direction:column;min-width:0;">
    <Topbar showLogo={showTopbarLogo} showSurfaceLabel={showTopbarSurfaceLabel}>
      {#snippet logo()}{@render topbarLogoSlot?.()}{/snippet}
      {#snippet surfaceLabel()}{@render topbarSurfaceLabelSlot?.()}{/snippet}
      {#snippet left()}<div>{@render topbarLeftSlot?.()}</div>{/snippet}
      {#snippet center()}<div>{@render topbarCenterSlot?.()}</div>{/snippet}
      {#snippet right()}<div>{@render topbarRightSlot?.()}</div>{/snippet}
    </Topbar>

    <main class="facetheory-stitch-shell-content" style="padding:0;overflow:auto;flex:1;">
      {@render children?.()}
    </main>
  </div>
</div>
