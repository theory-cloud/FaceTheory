<script lang="ts">
  import type {
    AuditTrailEventStatus,
    AuditTrailEventTone,
    DisclosurePanelProps,
  } from '../../stitch-admin/audit-trail-types.js';

  export let panel: DisclosurePanelProps;
  export let onToggle: ((nextExpanded: boolean) => void) | undefined =
    undefined;

  $: tone = (panel.tone ?? 'neutral') as AuditTrailEventTone;
  $: status = panel.status as AuditTrailEventStatus | undefined;
  $: stateRole = status === 'error' ? 'alert' : undefined;
  $: panelContentId = `${panel.panelId}-region`;

  function handleToggle(): void {
    if (onToggle === undefined) return;
    onToggle(!panel.expanded);
  }
</script>

<section
  class={`facetheory-stitch-disclosure-panel facetheory-stitch-disclosure-panel-tone-${tone}${
    status !== undefined
      ? ` facetheory-stitch-disclosure-panel-status-${status}`
      : ''
  }`}
  data-disclosure-id={panel.panelId}
  data-disclosure-expanded={panel.expanded ? 'true' : 'false'}
  data-disclosure-tone={tone}
  data-disclosure-status={status ?? ''}
  data-safety-policy={panel.safetyPolicy}
  role={stateRole}
>
  <button
    type="button"
    id={panel.panelId}
    class="facetheory-stitch-disclosure-panel-toggle"
    aria-expanded={panel.expanded ? 'true' : 'false'}
    aria-controls={panelContentId}
    data-disclosure-toggle={panel.panelId}
    on:click={handleToggle}
  >
    <span class="facetheory-stitch-disclosure-panel-label">{panel.label}</span>
    <span
      class="facetheory-stitch-disclosure-panel-state"
      data-disclosure-state-label={panel.expanded ? 'expanded' : 'collapsed'}
    >{panel.expanded ? 'Hide' : 'Show'}</span>
  </button>

  {#if panel.description !== undefined}
    <p class="facetheory-stitch-disclosure-panel-description">{panel.description}</p>
  {/if}

  <div
    id={panelContentId}
    class="facetheory-stitch-disclosure-panel-content"
    role="region"
    aria-labelledby={panel.panelId}
    aria-hidden={panel.expanded ? 'false' : 'true'}
    hidden={!panel.expanded}
  >
    {#if panel.expanded}
      <slot />
    {/if}
  </div>

  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={panel.safetyPolicy}
  >Safety policy: {panel.safetyPolicy}</p>
</section>
