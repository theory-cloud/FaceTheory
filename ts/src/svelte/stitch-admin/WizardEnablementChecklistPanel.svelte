<script lang="ts">
  import type { WizardEnablementChecklist, WizardEnablementItemStatus } from './types.js';

  let {
    title = 'Enablement checklist',
    description = undefined,
    checklist,
    emptyLabel = 'No checklist items.',
  }: {
    title?: unknown;
    description?: unknown;
    checklist?: WizardEnablementChecklist;
    emptyLabel?: unknown;
  } = $props();

  const STATUS_LABEL: Record<WizardEnablementItemStatus, string> = {
    ready: 'Ready',
    attention: 'Needs attention',
    blocked: 'Blocked',
    'not-applicable': 'Not applicable',
  };

  const summary = $derived(
    checklist.summaryLabel ??
    (checklist.items.length > 0
      ? `${checklist.items.filter((i) => i.status === 'ready').length} of ${checklist.items.length} ready`
      : 'No checklist items'),
  );
  const allReady = $derived(
    checklist.allReady === true
      ? 'true'
      : checklist.allReady === false
        ? 'false'
        : 'unknown',
  );
</script>

<section
  class="facetheory-stitch-wizard-enablement-checklist"
  data-all-ready={allReady}
  data-item-count={String(checklist.items.length)}
>
  <header>
    <div>
      <h2>{title}</h2>
      {#if description !== undefined}<p>{description}</p>{/if}
    </div>
    <span class="facetheory-stitch-wizard-enablement-checklist-summary">{summary}</span>
  </header>
  {#if checklist.items.length > 0}
    <ul role="list">
      {#each checklist.items as item (item.key)}
        <li
          class={`facetheory-stitch-wizard-enablement-item facetheory-stitch-wizard-enablement-item-${item.status}`}
          data-item-key={item.key}
          data-item-status={item.status}
        >
          <div>
            <strong>{item.label}</strong>
            {#if item.description !== undefined}<p>{item.description}</p>{/if}
            {#if item.detail !== undefined}<span>{item.detail}</span>{/if}
          </div>
          <span
            class={`facetheory-stitch-wizard-enablement-item-status facetheory-stitch-wizard-enablement-item-status-${item.status}`}
            data-status-chip={item.status}
          >{STATUS_LABEL[item.status]}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="facetheory-stitch-wizard-enablement-checklist-empty" role="status">{emptyLabel}</div>
  {/if}
</section>
