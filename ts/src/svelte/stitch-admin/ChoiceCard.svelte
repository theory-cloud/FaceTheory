<script lang="ts">
  import type {
    ChoiceCardProps,
    SelectableCardGridSelection,
    SelectableCardOption,
    SelectableCardTone,
  } from './types.js';
  import MetadataBadgeGroup from './MetadataBadgeGroup.svelte';

  let {
    card,
    onChange = undefined,
  }: {
    card?: ChoiceCardProps;
    onChange?: ((selected: boolean) => void) | undefined;
  } = $props();

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

  function handleClick(): void {
    if (isOptionDisabled(card.option) || onChange === undefined) return;
    onChange(!card.selected);
  }

  function handleKey(event: KeyboardEvent): void {
    if (isOptionDisabled(card.option) || onChange === undefined) return;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      onChange(!card.selected);
    }
  }

  const option = $derived(card.option);
  const selected = $derived(card.selected);
  const cardId = $derived(card.cardId);
  const safetyPolicy = $derived(card.safetyPolicy);
  const selection = $derived(card.selection as SelectableCardGridSelection);
  const disabled = $derived(isOptionDisabled(option));
  const role = $derived(selection === 'single' ? 'radio' : 'checkbox');
  const reasonId = $derived(
    option.disabledReason !== undefined ? `${cardId}-reason` : undefined,
  );
  const tone = $derived(option.tone ?? 'neutral');
</script>

<div
  id={cardId}
  class={`${deriveCardClassName(option, selected)} facetheory-stitch-choice-card`}
  {role}
  aria-checked={selected ? 'true' : 'false'}
  aria-disabled={disabled ? 'true' : undefined}
  aria-describedby={reasonId}
  tabindex={disabled ? -1 : 0}
  data-safety-policy={safetyPolicy}
  data-option-key={option.key}
  data-option-tone={tone}
  data-option-selected={selected ? 'true' : 'false'}
  data-option-disabled={disabled ? 'true' : 'false'}
  data-option-blocked={option.blocked === true ? 'true' : 'false'}
  data-option-recommended={option.recommended === true ? 'true' : 'false'}
  data-selection-family={selection}
  onclick={handleClick}
  onkeydown={handleKey}
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
        <span class="facetheory-stitch-selectable-card-pill facetheory-stitch-selectable-card-pill-recommended" data-pill="recommended">Recommended</span>
      {/if}
      {#if option.blocked === true}
        <span class="facetheory-stitch-selectable-card-pill facetheory-stitch-selectable-card-pill-blocked" data-pill="blocked">Blocked</span>
      {/if}
      {#if option.riskLabel !== undefined && option.riskLabel !== ''}
        <span class="facetheory-stitch-selectable-card-pill facetheory-stitch-selectable-card-pill-risk" data-pill="risk">{option.riskLabel}</span>
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
