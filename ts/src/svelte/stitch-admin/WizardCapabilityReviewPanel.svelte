<script lang="ts">
  import type { WizardCapability, WizardCapabilityIntent, WizardCapabilityReview } from './types.js';

  let {
    title = 'Capability review',
    description = undefined,
    review,
    emptyLabel = 'No capabilities to review.',
  }: {
    title?: unknown;
    description?: unknown;
    review: WizardCapabilityReview;
    emptyLabel?: unknown;
  } = $props();

  const REDACTED_MARKER = '[redacted]';
  const INTENT_LABEL: Record<WizardCapabilityIntent, string> = {
    requested: 'Requested',
    granted: 'Granted',
    denied: 'Denied',
  };

  function isRedacted(capability: WizardCapability): boolean {
    return capability.sensitivity === 'redacted';
  }
  function isSensitive(capability: WizardCapability): boolean {
    return capability.sensitivity === 'sensitive';
  }
</script>

<section
  class="facetheory-stitch-wizard-capability-review"
  data-safety-policy={review.safetyPolicy}
  data-capability-count={String(review.capabilities.length)}
>
  <header>
    <h2>{title}</h2>
    {#if description !== undefined}<p>{description}</p>{/if}
  </header>
  {#if review.capabilities.length > 0}
    <ul role="list">
      {#each review.capabilities as capability (capability.key)}
        {@const redacted = isRedacted(capability)}
        {@const sensitive = isSensitive(capability)}
        <li
          class={`facetheory-stitch-wizard-capability facetheory-stitch-wizard-capability-${capability.intent} facetheory-stitch-wizard-capability-sensitivity-${capability.sensitivity}`}
          data-capability-key={capability.key}
          data-capability-intent={capability.intent}
          data-capability-sensitivity={capability.sensitivity}
        >
          <div>
            <strong>{capability.label}</strong>
            {#if !redacted && capability.description !== undefined}
              <p>{capability.description}</p>
            {/if}
            {#if redacted}
              <span class="facetheory-stitch-wizard-capability-redaction">{REDACTED_MARKER}</span>
            {:else if sensitive}
              <span class="facetheory-stitch-wizard-capability-sensitive">Detail suppressed (sensitive).</span>
            {:else if capability.detail !== undefined}
              <span>{capability.detail}</span>
            {/if}
          </div>
          <span
            class={`facetheory-stitch-wizard-capability-intent facetheory-stitch-wizard-capability-intent-${capability.intent}`}
            data-intent-chip={capability.intent}
          >{INTENT_LABEL[capability.intent]}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="facetheory-stitch-wizard-capability-review-empty" role="status">{emptyLabel}</div>
  {/if}
  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={review.safetyPolicy}
  >Safety policy: {review.safetyPolicy}</p>
</section>
