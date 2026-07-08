<script lang="ts">
  import type { Snippet } from 'svelte';
  import Breadcrumb from './Breadcrumb.svelte';
  import PageTitle from './PageTitle.svelte';
  import type { BreadcrumbNode } from './nav-types.js';

  let {
    title = undefined,
    description = undefined,
    breadcrumbs = undefined,
    onBreadcrumbNavigate = undefined,
    actions,
    children,
  }: {
    title?: unknown;
    description?: unknown;
    breadcrumbs?: BreadcrumbNode[] | undefined;
    onBreadcrumbNavigate?: ((node: BreadcrumbNode) => void) | undefined;
    actions?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<div
  class="facetheory-stitch-page-frame"
  style="display:flex;flex-direction:column;gap:24px;padding:32px 48px;"
>
  {#if breadcrumbs && breadcrumbs.length > 0}
    <Breadcrumb items={breadcrumbs} onNavigate={onBreadcrumbNavigate} />
  {/if}

  {#if title !== undefined}
    <div
      class="facetheory-stitch-page-frame-header"
      style="display:flex;align-items:flex-start;justify-content:space-between;gap:24px;"
    >
      <PageTitle {description}>{title}</PageTitle>

      <div
        class="facetheory-stitch-page-frame-actions"
        style="display:flex;gap:12px;flex-shrink:0;"
      >
        {@render actions?.()}
      </div>
    </div>
  {:else}
    {@render actions?.()}
  {/if}

  <div
    class="facetheory-stitch-page-frame-body"
    style="display:flex;flex-direction:column;gap:24px;"
  >
    {@render children?.()}
  </div>
</div>
