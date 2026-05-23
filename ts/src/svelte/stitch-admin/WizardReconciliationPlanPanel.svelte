<script lang="ts">
  import type {
    WizardReconciliationPlan,
    WizardReconciliationPlanCanonicalKind,
    WizardReconciliationPlanOperationKind,
    WizardReconciliationPlanRow,
  } from './types.js';
  import MetadataBadgeGroup from './MetadataBadgeGroup.svelte';

  export let title: unknown = 'Reconciliation plan';
  export let description: unknown = undefined;
  export let plan: WizardReconciliationPlan;
  export let emptyLabel: unknown = 'No plan rows.';
  export let onToggleRow: ((rowKey: string, nextExpanded: boolean) => void) | undefined = undefined;

  const REDACTED_MARKER = '[redacted]';

  const KIND_LABEL: Record<WizardReconciliationPlanCanonicalKind, string> = {
    create: 'Will create',
    update: 'Will update',
    satisfied: 'Already satisfied',
    conflict: 'Conflict',
    blocked: 'Blocked',
    external: 'External step required',
    noop: 'No-op',
  };
  const PROMINENT: Record<WizardReconciliationPlanCanonicalKind, boolean> = {
    create: false,
    update: false,
    satisfied: false,
    conflict: true,
    blocked: true,
    external: true,
    noop: false,
  };
  const CANONICAL_KINDS: WizardReconciliationPlanCanonicalKind[] = [
    'create',
    'update',
    'satisfied',
    'conflict',
    'blocked',
    'external',
    'noop',
  ];

  function canonicalize(
    kind: WizardReconciliationPlanOperationKind,
  ): WizardReconciliationPlanCanonicalKind {
    switch (kind) {
      case 'already_satisfied':
        return 'satisfied';
      case 'external_step_required':
        return 'external';
      case 'not_requested':
        return 'noop';
      default:
        return kind;
    }
  }
</script>

<section
  class="facetheory-stitch-wizard-reconciliation-plan"
  data-safety-policy={plan.safetyPolicy}
  data-row-count={String(plan.rows.length)}
  data-conflict-count={String(plan.totals.conflict)}
  data-blocked-count={String(plan.totals.blocked)}
  data-external-count={String(plan.totals.external)}
>
  <header>
    <div>
      <h2>{title}</h2>
      {#if description !== undefined}<p>{description}</p>{/if}
    </div>
    <div class="facetheory-stitch-wizard-reconciliation-plan-counts">
      {#each CANONICAL_KINDS as kind (kind)}
        <span
          class={`facetheory-stitch-wizard-reconciliation-plan-count facetheory-stitch-wizard-reconciliation-plan-count-${kind}`}
          data-kind-summary={kind}
          data-kind-count={String(plan.totals[kind])}
        >{KIND_LABEL[kind]}: {plan.totals[kind]}</span>
      {/each}
    </div>
  </header>
  {#if plan.rows.length > 0}
    <ul role="list">
      {#each plan.rows as row (row.key)}
        {@const canonical = canonicalize(row.kind)}
        {@const prominent = PROMINENT[canonical]}
        {@const statusLabel = row.statusLabel ?? KIND_LABEL[canonical]}
        {@const expanded = row.expanded === true}
        {@const detailPanelId = `facetheory-wizard-plan-row-${row.key}-details`}
        {@const hasDetails = Array.isArray(row.details) && row.details.length > 0}
        <li
          class={`facetheory-stitch-wizard-reconciliation-plan-row facetheory-stitch-wizard-reconciliation-plan-row-${canonical}${prominent ? ' facetheory-stitch-wizard-reconciliation-plan-row-prominent' : ''}${row.redacted ? ' facetheory-stitch-wizard-reconciliation-plan-row-redacted' : ''}`}
          data-row-key={row.key}
          data-row-kind={canonical}
          data-row-kind-input={row.kind}
          data-row-prominent={prominent ? 'true' : 'false'}
          data-row-expanded={expanded ? 'true' : 'false'}
          data-row-redacted={row.redacted ? 'true' : 'false'}
          role={prominent ? 'alert' : 'listitem'}
        >
          <div>
            <div>
              <strong>{row.label}</strong>
              {#if row.summary !== undefined}
                <span class="facetheory-stitch-wizard-reconciliation-plan-row-summary">{row.summary}</span>
              {/if}
            </div>
            <span
              class={`facetheory-stitch-wizard-reconciliation-plan-row-status facetheory-stitch-wizard-reconciliation-plan-row-status-${canonical}`}
              data-status-chip={canonical}
              aria-label={`Status: ${statusLabel}`}
            >{statusLabel}</span>
          </div>
          {#if row.reason !== undefined}
            <p
              class={`facetheory-stitch-wizard-reconciliation-plan-row-reason facetheory-stitch-wizard-reconciliation-plan-row-reason-${canonical}`}
            >{row.reason}</p>
          {/if}
          {#if row.metadata !== undefined}
            <MetadataBadgeGroup metadata={row.metadata} />
          {/if}
          {#if hasDetails}
            <button
              type="button"
              class="facetheory-stitch-wizard-reconciliation-plan-row-toggle"
              aria-expanded={expanded ? 'true' : 'false'}
              aria-controls={detailPanelId}
              aria-label={`${expanded ? 'Hide' : 'Show'} details for ${statusLabel}`}
              data-row-toggle-key={row.key}
              on:click={() => onToggleRow?.(row.key, !expanded)}
            >{expanded ? 'Hide details' : 'Show details'}</button>
            <div
              id={detailPanelId}
              class="facetheory-stitch-wizard-reconciliation-plan-row-details"
              role="region"
              aria-hidden={expanded ? 'false' : 'true'}
              hidden={!expanded}
            >
              {#if expanded}
                <dl class="facetheory-stitch-wizard-reconciliation-plan-detail-list">
                  {#each row.details ?? [] as detail (detail.key)}
                    {@const detailRedacted = detail.redacted === true || row.redacted === true}
                    <dt data-detail-key={detail.key}>{detail.label}</dt>
                    <dd data-detail-redacted={detailRedacted ? 'true' : 'false'}>
                      {detailRedacted ? REDACTED_MARKER : (detail.value ?? '')}
                    </dd>
                  {/each}
                </dl>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <div class="facetheory-stitch-wizard-reconciliation-plan-empty" role="status">{emptyLabel}</div>
  {/if}
  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={plan.safetyPolicy}
  >Safety policy: {plan.safetyPolicy}</p>
</section>
