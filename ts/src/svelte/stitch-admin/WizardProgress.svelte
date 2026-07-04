<script lang="ts">
  import type { WizardProgressState, WizardStep, WizardStepStatus } from './types.js';

  let {
    title = 'Wizard progress',
    description = undefined,
    state,
  }: {
    title?: unknown;
    description?: unknown;
    state?: WizardProgressState;
  } = $props();

  const STEP_LABEL: Record<WizardStepStatus, string> = {
    pending: 'Pending',
    'in-progress': 'In progress',
    complete: 'Complete',
    blocked: 'Blocked',
    skipped: 'Skipped',
  };

  const totalCount = $derived(state.steps.length);
  const completedCount = $derived(state.steps.filter((step) => step.status === 'complete').length);
  const progressLabel = $derived(state.progressLabel ?? `${completedCount} of ${totalCount} complete`);
  function isActive(step: WizardStep, currentStepKey?: string): boolean {
    return step.active === true || (currentStepKey !== undefined && currentStepKey === step.key);
  }
</script>

<section
  class="facetheory-stitch-wizard-progress"
  data-step-count={String(totalCount)}
  data-completed-count={String(completedCount)}
>
  <header>
    <div>
      <h2>{title}</h2>
      {#if description !== undefined}
        <p>{description}</p>
      {/if}
    </div>
    <span class="facetheory-stitch-wizard-progress-label">{progressLabel}</span>
  </header>
  <ol role="list">
    {#each state.steps as step, index (step.key)}
      {@const active = isActive(step, state.currentStepKey)}
      <li
        class={`facetheory-stitch-wizard-step facetheory-stitch-wizard-step-${step.status}${active ? ' facetheory-stitch-wizard-step-active' : ''}`}
        data-step-key={step.key}
        data-step-status={step.status}
        data-step-active={active ? 'true' : 'false'}
      >
        <div>
          <span>Step {index + 1}</span>
          <span
            class={`facetheory-stitch-wizard-step-status facetheory-stitch-wizard-step-status-${step.status}`}
            data-status-chip={step.status}
          >{STEP_LABEL[step.status]}</span>
        </div>
        <strong>{step.label}</strong>
        {#if step.description !== undefined}
          <p>{step.description}</p>
        {/if}
        {#if step.hint !== undefined}
          <span class="facetheory-stitch-wizard-step-hint">{step.hint}</span>
        {/if}
      </li>
    {/each}
  </ol>
</section>
