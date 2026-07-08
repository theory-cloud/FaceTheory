<script lang="ts">
  import type { Snippet } from 'svelte';
  import type {
    AuditTrailEventStatus,
    AuditTrailEventTone,
    DisclosurePanelProps,
  } from '../../stitch-admin/audit-trail-types.js';

  let {
    panel,
    onToggle = undefined,
    children,
  }: {
    panel: DisclosurePanelProps;
    onToggle?: ((nextExpanded: boolean) => void) | undefined;
    children?: Snippet;
  } = $props();

  const tone = $derived((panel.tone ?? 'neutral') as AuditTrailEventTone);
  const status = $derived(panel.status as AuditTrailEventStatus | undefined);
  const stateRole = $derived(status === 'error' ? 'alert' : undefined);
  const panelContentId = $derived(`${panel.panelId}-region`);

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
    onclick={handleToggle}
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
      {@render children?.()}
    {/if}
  </div>

  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={panel.safetyPolicy}
  >Safety policy: {panel.safetyPolicy}</p>
</section>
