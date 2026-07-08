<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title = undefined,
    description = undefined,
    actions,
    children,
  }: {
    title?: unknown;
    description?: unknown;
    actions?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<section class="facetheory-stitch-section" style="display:flex;flex-direction:column;gap:12px;">
  {#if title !== undefined || description !== undefined}
    <header
      class="facetheory-stitch-section-header"
      style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;"
    >
      <div style="display:flex;flex-direction:column;gap:2px;">
        {#if title !== undefined}
          <h2 style="margin:0;font-size:18px;line-height:1.3;">{title}</h2>
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
        {@render actions?.()}
      </div>
    </header>
  {/if}

  {@render children?.()}
</section>
