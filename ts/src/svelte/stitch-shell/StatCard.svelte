<script lang="ts">
  import Panel from './Panel.svelte';

  export let label: unknown;
  export let value: unknown;
  export let delta: { value: unknown; trend?: 'up' | 'down' | 'flat' } | undefined = undefined;

  const trendColor: Record<'up' | 'down' | 'flat', string> = {
    up: 'var(--stitch-color-tertiary, #00332e)',
    down: 'var(--stitch-color-error, #ba1a1a)',
    flat: 'var(--stitch-color-on-surface-variant, #464553)',
  };
</script>

<Panel padded={true}>
  <div class="facetheory-stitch-stat-card" style="display:flex;align-items:flex-start;gap:16px;">
    <div class="facetheory-stitch-stat-card-icon" style="font-size:20px;flex-shrink:0;">
      <slot name="icon" />
    </div>

    <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;">
      <span
        class="facetheory-stitch-stat-card-label"
        style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:var(--stitch-color-on-surface-variant, #464553);"
      >
        {label}
      </span>
      <span
        class="facetheory-stitch-stat-card-value"
        style="font-size:28px;font-weight:600;line-height:1.2;color:var(--stitch-color-on-surface, #131b2e);"
      >
        {value}
      </span>
      {#if delta}
        <span
          class="facetheory-stitch-stat-card-delta"
          style={`font-size:12px;color:${trendColor[delta.trend ?? 'flat']};`}
        >
          {delta.value}
        </span>
      {/if}
    </div>
  </div>
</Panel>
