<script lang="ts">
  import type { WizardFinding, WizardFindingList, WizardFindingSeverity } from './types.js';

  export let title: unknown = 'Validation findings';
  export let description: unknown = undefined;
  export let list: WizardFindingList;
  export let emptyLabel: unknown = 'No findings reported.';

  const SEVERITY_LABEL: Record<WizardFindingSeverity, string> = {
    info: 'Info',
    warning: 'Warning',
    error: 'Error',
    blocker: 'Blocker',
  };
  const SEVERITIES: WizardFindingSeverity[] = ['info', 'warning', 'error', 'blocker'];

  function counts(findings: WizardFinding[]): Record<WizardFindingSeverity, number> {
    return findings.reduce<Record<WizardFindingSeverity, number>>(
      (acc, finding) => {
        acc[finding.severity] += 1;
        return acc;
      },
      { info: 0, warning: 0, error: 0, blocker: 0 },
    );
  }

  $: severityCounts = counts(list.findings);
</script>

<section
  class="facetheory-stitch-wizard-finding-list"
  data-safety-policy={list.safetyPolicy}
  data-finding-count={String(list.findings.length)}
>
  <header>
    <div>
      <h2>{title}</h2>
      {#if description !== undefined}<p>{description}</p>{/if}
    </div>
    <div class="facetheory-stitch-wizard-finding-counts">
      {#each SEVERITIES as severity (severity)}
        <span
          class={`facetheory-stitch-wizard-finding-count facetheory-stitch-wizard-finding-count-${severity}`}
          data-severity-summary={severity}
        >{SEVERITY_LABEL[severity]}: {severityCounts[severity]}</span>
      {/each}
    </div>
  </header>
  {#if list.findings.length > 0}
    <ul role="list">
      {#each list.findings as finding (finding.id)}
        <li
          class={`facetheory-stitch-wizard-finding facetheory-stitch-wizard-finding-${finding.severity}`}
          data-finding-id={finding.id}
          data-finding-severity={finding.severity}
        >
          <div>
            <span
              class={`facetheory-stitch-wizard-finding-severity facetheory-stitch-wizard-finding-severity-${finding.severity}`}
              data-severity-chip={finding.severity}
            >{SEVERITY_LABEL[finding.severity]}</span>
            {#if finding.source !== undefined}<span>{finding.source}</span>{/if}
          </div>
          <strong>{finding.title}</strong>
          {#if finding.description !== undefined}<p>{finding.description}</p>{/if}
          {#if finding.evidence !== undefined}
            <code class="facetheory-stitch-wizard-finding-evidence">{finding.evidence}</code>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <div class="facetheory-stitch-wizard-finding-list-empty" role="status">{emptyLabel}</div>
  {/if}
  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={list.safetyPolicy}
  >Safety policy: {list.safetyPolicy}</p>
</section>
