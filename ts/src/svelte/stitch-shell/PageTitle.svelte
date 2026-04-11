<script lang="ts">
  export let description: unknown = undefined;
</script>

<div
  class="facetheory-stitch-page-title"
  style="display:flex;flex-direction:column;gap:4px;"
>
  <h1 style="margin:0;font-size:28px;line-height:1.2;">
    <slot />
  </h1>

  {#if description !== undefined}
    <p
      style="margin:0;font-size:14px;color:var(--stitch-color-on-surface-variant, #464553);"
    >
      {description}
    </p>
  {/if}
</div>
