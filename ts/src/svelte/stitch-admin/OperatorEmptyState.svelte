<script lang="ts">
  import type { OperatorEmptyStateConfig, OperatorEmptyStateIntent } from './types.js';

  export let config: OperatorEmptyStateConfig;
  export let action: unknown = undefined;

  const intentLabels: Record<OperatorEmptyStateIntent, string> = {
    'no-data': 'No data',
    'not-authorized': 'Not authorized',
    'not-configured': 'Not configured',
    'filtered-empty': 'No matching results',
    loading: 'Loading',
    error: 'Unavailable',
  };

  $: actionContent = action ?? config.actionLabel;
</script>

<section
  class={`facetheory-stitch-operator-empty-state facetheory-stitch-operator-empty-state-${config.intent}`}
  data-empty-intent={config.intent}
  data-placeholder-policy={config.placeholderDataPolicy}
  role={config.intent === 'error' ? 'alert' : 'status'}
  style="display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:24px;border-radius:var(--stitch-radius-lg, 12px);background:var(--stitch-color-surface-container-low, #f2f3ff);color:var(--stitch-color-on-surface, #131b2e);"
>
  <span
    class="facetheory-stitch-operator-empty-state-intent"
    style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--stitch-color-on-surface-variant, #464553);"
  >
    {intentLabels[config.intent]}
  </span>
  <strong style="font-size:16px;">{config.title}</strong>
  {#if config.description !== undefined}
    <p
      style="margin:0;font-size:14px;line-height:1.5;color:var(--stitch-color-on-surface-variant, #464553);"
    >
      {config.description}
    </p>
  {/if}
  {#if $$slots.action || actionContent !== undefined}
    <div class="facetheory-stitch-operator-empty-state-action" style="margin-top:4px;">
      <slot name="action">{actionContent}</slot>
    </div>
  {/if}
</section>
