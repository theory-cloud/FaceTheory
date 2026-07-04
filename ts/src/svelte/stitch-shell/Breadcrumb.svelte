<script lang="ts">
  import type { BreadcrumbNode } from './nav-types.js';

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
      {#if index > 0}
        <span
          aria-hidden="true"
          style="margin:0 8px;color:var(--stitch-color-on-surface-variant, #464553);"
          >›</span
        >
      {/if}

      {#if node.path}
        <a
          href={node.path}
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
