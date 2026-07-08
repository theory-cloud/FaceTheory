<script lang="ts">
  import type { Snippet } from 'svelte';
  import FilterChip from './FilterChip.svelte';
  import type { FilterChipConfig } from './types.js';

  let {
    chips = [],
    onChipClick = undefined,
    onChipRemove = undefined,
    trailing,
  }: {
    chips?: FilterChipConfig[];
    onChipClick?: ((key: string) => void) | undefined;
    onChipRemove?: ((key: string) => void) | undefined;
    trailing?: Snippet;
  } = $props();
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

  {#if trailing}
    <span
      class="facetheory-stitch-filter-chip-group-trailing"
      style="margin-left:auto;display:inline-flex;"
    >
      {@render trailing()}
    </span>
  {/if}
</div>
