<script lang="ts">
  export let label: unknown;
  export let count: number | undefined = undefined;
  export let active = true;
  export let removable = true;
  export let onClick: (() => void) | undefined = undefined;
  export let onRemove: (() => void) | undefined = undefined;

  const chipBaseClass = 'facetheory-stitch-filter-chip';

  $: colors = active
    ? {
        background: 'var(--stitch-color-primary-container, #e0e0ff)',
        color: 'var(--stitch-color-on-primary-container, #000066)',
      }
    : {
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
        color: 'var(--stitch-color-on-surface-variant, #464553)',
      };
</script>

<span class={chipBaseClass} style="display:inline-flex;align-items:center;">
  <button
    type="button"
    class={`${chipBaseClass}-body`}
    on:click={onClick}
    style={`display:inline-flex;align-items:center;gap:6px;padding:4px 10px;font-size:12px;font-weight:500;line-height:1.4;background:${colors.background};color:${colors.color};border:none;border-radius:9999px;cursor:${onClick !== undefined ? 'pointer' : 'default'};`}
  >
    <span>{label}</span>
    {#if count !== undefined}
      <span
        class={`${chipBaseClass}-count`}
        style="font-variant-numeric:tabular-nums;opacity:0.75;"
      >
        {count}
      </span>
    {/if}
  </button>

  {#if removable}
    <button
      type="button"
      aria-label="Remove filter"
      class={`${chipBaseClass}-remove`}
      on:click|stopPropagation={() => onRemove?.()}
      style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-left:4px;font-size:12px;line-height:1;color:inherit;background:transparent;border:none;border-radius:9999px;cursor:pointer;"
    >
      ×
    </button>
  {/if}
</span>
