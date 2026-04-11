<script lang="ts">
  import type { StatusVariant } from './types.js';

  export let variant: StatusVariant;
  export let label: unknown = undefined;

  const palette: Record<StatusVariant, { background: string; color: string; label: string }> = {
    active: {
      background: 'var(--stitch-color-tertiary-container, #004c45)',
      color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
      label: 'Active',
    },
    pending: {
      background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
      color: 'var(--stitch-color-on-surface-variant, #464553)',
      label: 'Pending',
    },
    suspended: {
      background: 'var(--stitch-color-error-container, #ffdad6)',
      color: 'var(--stitch-color-on-error-container, #93000a)',
      label: 'Suspended',
    },
    archived: {
      background: 'var(--stitch-color-surface-container, #eaedff)',
      color: 'var(--stitch-color-on-surface-variant, #464553)',
      label: 'Archived',
    },
    error: {
      background: 'var(--stitch-color-error-container, #ffdad6)',
      color: 'var(--stitch-color-on-error-container, #93000a)',
      label: 'Error',
    },
  };

  $: current = palette[variant];
</script>

<span
  class={`facetheory-stitch-status-tag facetheory-stitch-status-tag-${variant}`}
  style={`display:inline-flex;align-items:center;padding:2px 10px;font-size:12px;font-weight:500;letter-spacing:0.02em;border-radius:9999px;background:${current.background};color:${current.color};`}
>
  {#if label !== undefined}
    {label}
  {:else}
    {current.label}
  {/if}
</span>
