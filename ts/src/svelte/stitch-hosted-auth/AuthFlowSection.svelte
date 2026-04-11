<script lang="ts">
  export let eyebrow: unknown = undefined;
  export let title: unknown = undefined;
  export let description: unknown = undefined;
</script>

<div
  class="facetheory-stitch-auth-flow-section"
  style="display:flex;flex-direction:column;gap:16px;"
>
  {#if eyebrow !== undefined}
    <span
      style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:var(--stitch-color-on-surface-variant, #464553);"
    >
      {eyebrow}
    </span>
  {/if}

  {#if title !== undefined}
    <h2
      style="margin:0;font-size:18px;line-height:1.3;color:var(--stitch-color-on-surface, #131b2e);"
    >
      {title}
    </h2>
  {/if}

  {#if description !== undefined}
    <p
      style="margin:0;font-size:14px;line-height:1.5;color:var(--stitch-color-on-surface-variant, #464553);"
    >
      {description}
    </p>
  {/if}

  <div style="display:flex;flex-direction:column;gap:12px;">
    <slot />
  </div>
</div>
