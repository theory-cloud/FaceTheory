<script lang="ts">
  import type { WizardPackageSummary } from './types.js';
  import MetadataBadgeGroup from './MetadataBadgeGroup.svelte';

  export let title: unknown = undefined;
  export let summary: WizardPackageSummary;
  export let emptyLabel: unknown = 'No files in this package.';

  $: heading = title ?? summary.name;
</script>

<section
  class="facetheory-stitch-wizard-package-summary"
  data-package-name={summary.name}
  data-package-version={summary.version}
  data-safety-policy={summary.safetyPolicy}
  data-file-count={String(summary.totals.fileCount)}
>
  <header>
    <div>
      <h2>{heading}</h2>
      {#if summary.version !== undefined}
        <span class="facetheory-stitch-wizard-package-summary-version">Version {summary.version}</span>
      {/if}
      {#if summary.description !== undefined}
        <p>{summary.description}</p>
      {/if}
    </div>
    <dl class="facetheory-stitch-wizard-package-summary-totals">
      <div><dt>Files</dt><dd>{String(summary.totals.fileCount)}</dd></div>
      {#if summary.totals.byteCount !== undefined}
        <div><dt>Bytes</dt><dd>{String(summary.totals.byteCount)}</dd></div>
      {/if}
    </dl>
  </header>
  {#if summary.metadata !== undefined}
    <MetadataBadgeGroup metadata={summary.metadata} />
  {/if}
  {#if summary.files.length > 0}
    <ul role="list">
      {#each summary.files as file (file.key)}
        <li
          class="facetheory-stitch-wizard-package-summary-file"
          data-file-role={file.role}
        >
          <div>
            <code>{file.path}</code>
            {#if file.note !== undefined}
              <span>{file.note}</span>
            {/if}
          </div>
          <div>
            {#if file.role !== undefined}<span>{file.role}</span>{/if}
            {#if file.mediaType !== undefined}<span>{file.mediaType}</span>{/if}
            {#if file.sizeBytes !== undefined}<span>{file.sizeBytes} B</span>{/if}
            {#if file.sha256 !== undefined}<code>{file.sha256}</code>{/if}
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="facetheory-stitch-wizard-package-summary-empty" role="status">{emptyLabel}</div>
  {/if}
  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={summary.safetyPolicy}
  >Safety policy: {summary.safetyPolicy}</p>
</section>
