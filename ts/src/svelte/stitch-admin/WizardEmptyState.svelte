<script lang="ts">
  import type { OperatorEmptyStateIntent, WizardEmptyStateConfig } from './types.js';

  export let config: WizardEmptyStateConfig;
  export let action: unknown = undefined;

  const INTENT_LABEL: Record<OperatorEmptyStateIntent, string> = {
    'no-data': 'No data',
    'not-authorized': 'Not authorized',
    'not-configured': 'Not configured',
    'filtered-empty': 'No matching results',
    loading: 'Loading',
    error: 'Unavailable',
  };

  $: actionContent = action ?? config.actionLabel;
  $: role = config.intent === 'error' ? 'alert' : 'status';
</script>

<section
  class={`facetheory-stitch-wizard-empty-state facetheory-stitch-wizard-empty-state-${config.intent}`}
  data-empty-intent={config.intent}
  data-safety-policy={config.safetyPolicy}
  {role}
>
  <span class="facetheory-stitch-wizard-empty-state-intent">{INTENT_LABEL[config.intent]}</span>
  <strong>{config.title}</strong>
  {#if config.description !== undefined}<p>{config.description}</p>{/if}
  {#if $$slots.action || actionContent !== undefined}
    <div class="facetheory-stitch-wizard-empty-state-action">
      <slot name="action">{actionContent}</slot>
    </div>
  {/if}
  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={config.safetyPolicy}
  >Safety policy: {config.safetyPolicy}</p>
</section>
