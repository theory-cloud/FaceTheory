<script lang="ts">
  import type { BreadcrumbNode } from './nav-types.js';
  import { safeNavHref } from '../../stitch-shell/safe-nav-href.js';

  let {
    items = [],
    onNavigate = undefined,
  }: {
    items?: BreadcrumbNode[];
    onNavigate?: ((node: BreadcrumbNode) => void) | undefined;
  } = $props();
</script>

{#if items.length > 0}
  <nav class="facetheory-stitch-breadcrumb" aria-label="Breadcrumb">
    {#each items as node, index (node.key)}
      {@const safePath = safeNavHref(node.path)}
      {#if index > 0}
        <span
          aria-hidden="true"
          style="margin:0 8px;color:var(--stitch-color-on-surface-variant, #464553);"
          >›</span
        >
      {/if}

      {#if safePath}
        <a
          href={safePath}
          onclick={(event) => {
            if (!onNavigate) return;
            event.preventDefault();
            onNavigate(node);
          }}
        >
          {node.label}
        </a>
      {:else}
        <span>{node.label}</span>
      {/if}
    {/each}
  </nav>
{/if}
