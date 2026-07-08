<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { OperatorEmptyStateIntent, WizardEmptyStateConfig } from './types.js';

  let {
    config,
    action = undefined,
  }: {
    config: WizardEmptyStateConfig;
    action?: unknown;
  } = $props();

  const INTENT_LABEL: Record<OperatorEmptyStateIntent, string> = {
    'no-data': 'No data',
    'not-authorized': 'Not authorized',
    'not-configured': 'Not configured',
    'filtered-empty': 'No matching results',
    loading: 'Loading',
    error: 'Unavailable',
  };

  const actionContent = $derived(action ?? config.actionLabel);
  const actionContentNode = $derived(
    typeof actionContent === 'function' ? (actionContent as Snippet) : undefined,
  );
  const role = $derived(config.intent === 'error' ? 'alert' : 'status');
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
  {#if actionContent !== undefined}
    <div class="facetheory-stitch-wizard-empty-state-action">
      {#if actionContentNode}{@render actionContentNode()}{:else}{actionContent}{/if}
    </div>
  {/if}
  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={config.safetyPolicy}
  >Safety policy: {config.safetyPolicy}</p>
</section>
