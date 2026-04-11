<script lang="ts">
  export let label: unknown;
  export let description: unknown = undefined;
  export let required = false;
  export let error: unknown = undefined;
</script>

<div
  class="facetheory-stitch-form-row"
  style="display:grid;grid-template-columns:minmax(200px, 280px) 1fr;column-gap:32px;row-gap:8px;align-items:start;"
>
  <div style="display:flex;flex-direction:column;gap:4px;">
    <span
      style="font-size:14px;font-weight:500;color:var(--stitch-color-on-surface, #131b2e);"
    >
      {label}
      {#if required}
        <span
          aria-hidden="true"
          style="color:var(--stitch-color-error, #ba1a1a);margin-left:4px;"
          >*</span
        >
      {/if}
    </span>

    {#if description !== undefined}
      <span
        style="font-size:12px;color:var(--stitch-color-on-surface-variant, #464553);line-height:1.5;"
      >
        {description}
      </span>
    {/if}
  </div>

  <div style="display:flex;flex-direction:column;gap:6px;">
    <slot />
    {#if error !== undefined}
      <span role="alert" style="font-size:12px;color:var(--stitch-color-error, #ba1a1a);">
        {error}
      </span>
    {/if}
  </div>
</div>
