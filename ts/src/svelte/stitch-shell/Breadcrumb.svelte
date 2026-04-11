<script lang="ts">
  import type { BreadcrumbNode } from './nav-types.js';

  export let items: BreadcrumbNode[] = [];
  export let onNavigate: ((node: BreadcrumbNode) => void) | undefined = undefined;
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

      {#if node.path && onNavigate}
        <a
          href={node.path}
          on:click|preventDefault={() => onNavigate?.(node)}
        >
          {node.label}
        </a>
      {:else}
        <span>{node.label}</span>
      {/if}
    {/each}
  </nav>
{/if}
