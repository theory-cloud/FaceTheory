<script lang="ts">
  export let title: unknown = undefined;
  export let description: unknown = undefined;
</script>

<div
  class="facetheory-stitch-form-section"
  style="display:flex;flex-direction:column;gap:16px;"
>
  {#if title !== undefined || description !== undefined}
    <header style="display:flex;flex-direction:column;gap:4px;">
      {#if title !== undefined}
        <h3 style="margin:0;font-size:15px;color:var(--stitch-color-on-surface, #131b2e);">
          {title}
        </h3>
      {/if}
      {#if description !== undefined}
        <p
          style="margin:0;font-size:13px;color:var(--stitch-color-on-surface-variant, #464553);"
        >
          {description}
        </p>
      {/if}
    </header>
  {/if}

  <div style="display:flex;flex-direction:column;gap:24px;">
    <slot />
  </div>
</div>
