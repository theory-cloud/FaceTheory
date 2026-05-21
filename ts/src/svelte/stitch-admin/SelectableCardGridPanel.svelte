<script lang="ts">
  import type {
    SelectableCardGrid,
    SelectableCardGridLayout,
    SelectableCardGridSelection,
    SelectableCardGridSize,
    SelectableCardOption,
    SelectableCardTone,
  } from './types.js';
  import MetadataBadgeGroup from './MetadataBadgeGroup.svelte';

  export let grid: SelectableCardGrid;
  export let onChange: (nextSelectedKeys: string[]) => void;

  function isOptionDisabled(option: SelectableCardOption): boolean {
    return option.blocked === true || option.disabledReason !== undefined;
  }

  function deriveCardClassName(
    option: SelectableCardOption,
    selected: boolean,
  ): string {
    const tone: SelectableCardTone = option.tone ?? 'neutral';
    const disabled = isOptionDisabled(option);
    const cls = [
      'facetheory-stitch-selectable-card',
      `facetheory-stitch-selectable-card-tone-${tone}`,
    ];
    if (selected) cls.push('facetheory-stitch-selectable-card-selected');
    if (disabled) cls.push('facetheory-stitch-selectable-card-disabled');
    if (option.blocked === true) cls.push('facetheory-stitch-selectable-card-blocked');
    if (option.recommended === true)
      cls.push('facetheory-stitch-selectable-card-recommended');
    return cls.join(' ');
  }

  function handleActivate(option: SelectableCardOption): void {
    if (isOptionDisabled(option)) return;
    if (grid.selection === 'single') {
      onChange([option.key]);
      return;
    }
    const isSelected = grid.selectedKeys.includes(option.key);
    const next = isSelected
      ? grid.selectedKeys.filter((k) => k !== option.key)
      : [...grid.selectedKeys, option.key];
    onChange(next);
  }

  function handleKey(event: KeyboardEvent, option: SelectableCardOption): void {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      handleActivate(option);
    }
  }

  $: layout = (grid.layout ?? 'grid') as SelectableCardGridLayout;
  $: size = (grid.size ?? 'md') as SelectableCardGridSize;
  $: groupRole = grid.selection === 'single' ? 'radiogroup' : 'group';
  $: labelId = grid.label !== undefined ? `${grid.groupId}-label` : undefined;
  $: descriptionId =
    grid.description !== undefined ? `${grid.groupId}-description` : undefined;
</script>

<section
  class={`facetheory-stitch-selectable-card-grid facetheory-stitch-selectable-card-grid-${grid.selection} facetheory-stitch-selectable-card-grid-layout-${layout} facetheory-stitch-selectable-card-grid-size-${size}`}
  data-safety-policy={grid.safetyPolicy}
  data-group-id={grid.groupId}
  data-selection={grid.selection}
  data-layout={layout}
  data-size={size}
  data-option-count={String(grid.options.length)}
  data-selected-count={String(grid.selectedKeys.length)}
>
  {#if grid.label !== undefined || grid.description !== undefined}
    <header class="facetheory-stitch-selectable-card-grid-header">
      {#if grid.label !== undefined}
        <div id={labelId} class="facetheory-stitch-selectable-card-grid-label">
          {grid.label}
        </div>
      {/if}
      {#if grid.description !== undefined}
        <p id={descriptionId} class="facetheory-stitch-selectable-card-grid-description">
          {grid.description}
        </p>
      {/if}
    </header>
  {/if}

  <div
    role={groupRole}
    aria-labelledby={labelId}
    aria-describedby={descriptionId}
    class="facetheory-stitch-selectable-card-grid-options"
  >
    {#each grid.options as option (option.key)}
      {@const selected = grid.selectedKeys.includes(option.key)}
      {@const disabled = isOptionDisabled(option)}
      {@const role = grid.selection === 'single' ? 'radio' : 'checkbox'}
      {@const reasonId = option.disabledReason !== undefined ? `${grid.groupId}-${option.key}-reason` : undefined}
      {@const tone = option.tone ?? 'neutral'}
      <div
        class={deriveCardClassName(option, selected)}
        {role}
        aria-checked={selected ? 'true' : 'false'}
        aria-disabled={disabled ? 'true' : undefined}
        aria-describedby={reasonId}
        tabindex={disabled ? -1 : (selected || grid.selection === 'multi' ? 0 : -1)}
        data-option-key={option.key}
        data-option-tone={tone}
        data-option-selected={selected ? 'true' : 'false'}
        data-option-disabled={disabled ? 'true' : 'false'}
        data-option-blocked={option.blocked === true ? 'true' : 'false'}
        data-option-recommended={option.recommended === true ? 'true' : 'false'}
        on:click={() => !disabled && handleActivate(option)}
        on:keydown={(event) => !disabled && handleKey(event, option)}
      >
        <div class="facetheory-stitch-selectable-card-header">
          {#if option.icon !== undefined}
            <span class="facetheory-stitch-selectable-card-icon" aria-hidden="true">{option.icon}</span>
          {/if}
          <strong class="facetheory-stitch-selectable-card-title">{option.title}</strong>
          {#if option.badge !== undefined}
            <span class="facetheory-stitch-selectable-card-badge">{option.badge}</span>
          {/if}
        </div>
        {#if option.description !== undefined}
          <p class="facetheory-stitch-selectable-card-description">{option.description}</p>
        {/if}
        {#if option.recommended === true || option.blocked === true || (option.riskLabel !== undefined && option.riskLabel !== '')}
          <div class="facetheory-stitch-selectable-card-pills">
            {#if option.recommended === true}
              <span
                class="facetheory-stitch-selectable-card-pill facetheory-stitch-selectable-card-pill-recommended"
                data-pill="recommended"
              >Recommended</span>
            {/if}
            {#if option.blocked === true}
              <span
                class="facetheory-stitch-selectable-card-pill facetheory-stitch-selectable-card-pill-blocked"
                data-pill="blocked"
              >Blocked</span>
            {/if}
            {#if option.riskLabel !== undefined && option.riskLabel !== ''}
              <span
                class="facetheory-stitch-selectable-card-pill facetheory-stitch-selectable-card-pill-risk"
                data-pill="risk"
              >{option.riskLabel}</span>
            {/if}
          </div>
        {/if}
        {#if option.blocked === true && option.blockedReason !== undefined}
          <p class="facetheory-stitch-selectable-card-blocked-reason">{option.blockedReason}</p>
        {/if}
        {#if option.disabledReason !== undefined}
          <p
            id={reasonId}
            class="facetheory-stitch-selectable-card-disabled-reason"
            data-disabled-reason="true"
          >{option.disabledReason}</p>
        {/if}
        {#if option.metadata !== undefined}
          <MetadataBadgeGroup metadata={option.metadata} />
        {/if}
      </div>
    {/each}
  </div>

  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={grid.safetyPolicy}
  >Safety policy: {grid.safetyPolicy}</p>
</section>
