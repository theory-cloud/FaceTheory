<script lang="ts">
  export let label: unknown;
  export let description: unknown = undefined;
  export let granted = false;
</script>

<li
  class="facetheory-stitch-consent-item"
  style={`display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:${
    granted
      ? 'var(--stitch-color-surface-container-low, #f2f3ff)'
      : 'var(--stitch-color-surface-container-lowest, #ffffff)'
  };border-radius:var(--stitch-radius-md, 6px);opacity:${granted ? 0.7 : 1};`}
>
  <span
    aria-hidden="true"
    style="font-size:18px;color:var(--stitch-color-primary, #1f108e);flex-shrink:0;margin-top:2px;"
  >
    <slot name="icon" />
  </span>

  <div style="display:flex;flex-direction:column;gap:2px;flex:1;">
    <span
      style="font-size:14px;font-weight:500;color:var(--stitch-color-on-surface, #131b2e);"
    >
      {label}
    </span>
    {#if description !== undefined}
      <span
        style="font-size:12px;color:var(--stitch-color-on-surface-variant, #464553);"
      >
        {description}
      </span>
    {/if}
  </div>
</li>
