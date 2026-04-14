<script lang="ts">
  import FilterChip from './FilterChip.svelte';
  import type { FilterChipConfig } from './types.js';

  export let chips: FilterChipConfig[] = [];
  export let onChipClick: ((key: string) => void) | undefined = undefined;
  export let onChipRemove: ((key: string) => void) | undefined = undefined;
  export let trailing: unknown = undefined;
</script>

<div
  class="facetheory-stitch-filter-chip-group"
  style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;"
>
  {#each chips as chip (chip.key)}
    <FilterChip
      label={chip.label}
      count={chip.count}
      active={chip.active ?? true}
      removable={chip.removable ?? true}
      onClick={onChipClick ? () => onChipClick(chip.key) : undefined}
      onRemove={onChipRemove ? () => onChipRemove(chip.key) : undefined}
    />
  {/each}

  {#if $$slots.trailing}
    <span
      class="facetheory-stitch-filter-chip-group-trailing"
      style="margin-left:auto;display:inline-flex;"
    >
      <slot name="trailing" />
    </span>
  {:else if trailing !== undefined}
    <span
      class="facetheory-stitch-filter-chip-group-trailing"
      style="margin-left:auto;display:inline-flex;"
    >
      {trailing}
    </span>
  {/if}
</div>
