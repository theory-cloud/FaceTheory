<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { WizardRecoveryState, WizardRecoveryStatus } from './types.js';
  import MetadataBadgeGroup from './MetadataBadgeGroup.svelte';

  let {
    title = 'Wizard recovery',
    status,
    actions,
  }: {
    title?: unknown;
    status: WizardRecoveryStatus;
    actions?: Snippet;
  } = $props();

  const RECOVERY_LABEL: Record<WizardRecoveryState, string> = {
    fresh: 'Fresh session',
    resumable: 'Resumable',
    expired: 'Expired',
    failed: 'Failed',
    unknown: 'Recovery unknown',
  };

  const role = $derived(status.state === 'failed' ? 'alert' : 'status');
  const chipLabel = $derived(status.label ?? RECOVERY_LABEL[status.state]);
</script>

<section
  class={`facetheory-stitch-wizard-recovery facetheory-stitch-wizard-recovery-${status.state}`}
  data-recovery-state={status.state}
  {role}
>
  <header>
    <h2>{title}</h2>
    <span
      class={`facetheory-stitch-wizard-recovery-chip facetheory-stitch-wizard-recovery-chip-${status.state}`}
      data-recovery-chip={status.state}
    >{chipLabel}</span>
  </header>
  {#if status.description !== undefined}
    <p>{status.description}</p>
  {/if}
  {#if status.lastSavedAt !== undefined || status.ageLabel !== undefined}
    <dl class="facetheory-stitch-wizard-recovery-metadata">
      {#if status.lastSavedAt !== undefined}
        <dt>Last saved</dt><dd>{status.lastSavedAt}</dd>
      {/if}
      {#if status.ageLabel !== undefined}
        <dt>Age</dt><dd>{status.ageLabel}</dd>
      {/if}
    </dl>
  {/if}
  {#if status.resumeTokenReference !== undefined}
    <div
      class="facetheory-stitch-wizard-recovery-resume-token"
      data-resume-token-redacted={status.resumeTokenReference.redacted ? 'true' : 'false'}
    >
      <span>Resume token</span>
      <code>{status.resumeTokenReference.label}</code>
    </div>
  {/if}
  {#if status.metadata !== undefined}
    <MetadataBadgeGroup metadata={status.metadata} />
  {/if}
  {@render actions?.()}
</section>
