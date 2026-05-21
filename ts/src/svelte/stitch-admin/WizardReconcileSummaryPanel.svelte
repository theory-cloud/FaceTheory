<script lang="ts">
  import type { WizardReconcileEntry, WizardReconcileSummary } from './types.js';

  export let title: unknown = 'Reconcile summary';
  export let description: unknown = undefined;
  export let summary: WizardReconcileSummary;
  export let emptyLabel: unknown = 'Nothing to reconcile.';

  const REDACTED_MARKER = '[redacted]';
  const KIND_LABEL: Record<WizardReconcileEntry['kind'], string> = {
    added: 'Added',
    removed: 'Removed',
    changed: 'Changed',
    unchanged: 'Unchanged',
    redacted: 'Redacted',
  };
  const KINDS: WizardReconcileEntry['kind'][] = ['added', 'removed', 'changed', 'unchanged', 'redacted'];

  function isRedacted(entry: WizardReconcileEntry): boolean {
    return entry.redacted === true || entry.kind === 'redacted';
  }
</script>

<section
  class="facetheory-stitch-wizard-reconcile-summary"
  data-safety-policy={summary.safetyPolicy}
  data-entry-count={String(summary.entries.length)}
>
  <header>
    <div>
      <h2>{title}</h2>
      {#if description !== undefined}<p>{description}</p>{/if}
    </div>
    <div class="facetheory-stitch-wizard-reconcile-counts">
      {#each KINDS as kind (kind)}
        <span
          class={`facetheory-stitch-wizard-reconcile-count facetheory-stitch-wizard-reconcile-count-${kind}`}
          data-kind-summary={kind}
        >{KIND_LABEL[kind]}: {summary.totals[kind]}</span>
      {/each}
    </div>
  </header>
  {#if summary.entries.length > 0}
    <ul role="list">
      {#each summary.entries as entry (entry.key)}
        {@const redacted = isRedacted(entry)}
        <li
          class={`facetheory-stitch-wizard-reconcile-entry facetheory-stitch-wizard-reconcile-entry-${entry.kind}${redacted ? ' facetheory-stitch-wizard-reconcile-entry-redacted' : ''}`}
          data-entry-key={entry.key}
          data-entry-kind={entry.kind}
          data-entry-redacted={redacted ? 'true' : 'false'}
        >
          <div>
            <strong>{entry.label}</strong>
            {#if redacted}
              <span class="facetheory-stitch-wizard-reconcile-entry-redaction">{REDACTED_MARKER}</span>
            {:else if entry.detail !== undefined}
              <span>{entry.detail}</span>
            {/if}
          </div>
          <span
            class={`facetheory-stitch-wizard-reconcile-entry-kind facetheory-stitch-wizard-reconcile-entry-kind-${entry.kind}`}
            data-kind-chip={entry.kind}
          >{KIND_LABEL[entry.kind]}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="facetheory-stitch-wizard-reconcile-summary-empty" role="status">{emptyLabel}</div>
  {/if}
  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={summary.safetyPolicy}
  >Safety policy: {summary.safetyPolicy}</p>
</section>
