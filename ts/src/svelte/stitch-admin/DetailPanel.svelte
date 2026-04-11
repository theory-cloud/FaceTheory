<script lang="ts">
  import PropertyGrid from './PropertyGrid.svelte';
  import type { PropertyItem } from './types.js';

  export let title: unknown = undefined;
  export let description: unknown = undefined;
  export let properties: PropertyItem[] = [];
  export let columns = 2;
</script>

<section
  class="facetheory-stitch-detail-panel"
  style="background:var(--stitch-color-surface-container-lowest, #ffffff);border-radius:var(--stitch-radius-xl, 16px);padding:24px 32px;display:flex;flex-direction:column;gap:20px;"
>
  {#if title !== undefined || description !== undefined}
    <header
      style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;"
    >
      <div style="display:flex;flex-direction:column;gap:4px;">
        {#if title !== undefined}
          <h2
            style="margin:0;font-size:18px;line-height:1.3;color:var(--stitch-color-on-surface, #131b2e);"
          >
            {title}
          </h2>
        {/if}
        {#if description !== undefined}
          <p
            style="margin:0;font-size:13px;color:var(--stitch-color-on-surface-variant, #464553);"
          >
            {description}
          </p>
        {/if}
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;">
        <slot name="actions" />
      </div>
    </header>
  {/if}

  <PropertyGrid items={properties} {columns} />
</section>
