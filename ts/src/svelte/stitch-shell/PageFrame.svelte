<script lang="ts">
  import Breadcrumb from './Breadcrumb.svelte';
  import PageTitle from './PageTitle.svelte';
  import type { BreadcrumbNode } from './nav-types.js';

  export let title: unknown = undefined;
  export let description: unknown = undefined;
  export let breadcrumbs: BreadcrumbNode[] | undefined = undefined;
  export let onBreadcrumbNavigate: ((node: BreadcrumbNode) => void) | undefined = undefined;
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
        <slot name="actions" />
      </div>
    </div>
  {:else}
    <slot name="actions" />
  {/if}

  <div
    class="facetheory-stitch-page-frame-body"
    style="display:flex;flex-direction:column;gap:24px;"
  >
    <slot />
  </div>
</div>
