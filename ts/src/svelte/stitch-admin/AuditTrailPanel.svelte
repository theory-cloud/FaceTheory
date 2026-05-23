<script lang="ts">
  import type {
    AuditTrail,
    AuditTrailEvent,
    AuditTrailEventGroup,
    AuditTrailEventStatus,
    AuditTrailEventTone,
    AuditTrailVariant,
  } from '../../stitch-admin/audit-trail-types.js';
  import MetadataBadgeGroup from './MetadataBadgeGroup.svelte';

  export let trail: AuditTrail;
  export let onToggleGroup:
    | ((groupId: string, nextExpanded: boolean) => void)
    | undefined = undefined;

  const STATUS_LABEL: Record<AuditTrailEventStatus, string> = {
    info: 'Info',
    success: 'Success',
    warning: 'Warning',
    error: 'Error',
  };
  const TONE_LABEL: Record<AuditTrailEventTone, string> = {
    neutral: 'Neutral',
    info: 'Info',
    success: 'Success',
    warning: 'Warning',
    danger: 'Danger',
  };

  function isRedacted(event: AuditTrailEvent): boolean {
    return event.redactedMarker !== undefined && event.redactedMarker !== '';
  }
  function eventRole(event: AuditTrailEvent): 'alert' | 'listitem' {
    return event.status === 'error' ? 'alert' : 'listitem';
  }
  // Mirrors `stitch-admin/safe-url.ts#safeMetadataHref` — kept inline so the
  // Svelte SSR test harness doesn't need to resolve sibling JS modules across
  // the temp-dir boundary used by the unit-test compiler shim.
  const SAFE_HREF_BASE = 'https://facetheory.invalid';
  function safeLinkHref(href: string): string | undefined {
    const value = String(href ?? '').trim();
    if (value === '') return undefined;
    try {
      const parsed = new URL(value, SAFE_HREF_BASE);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return undefined;
      }
      return value;
    } catch {
      return undefined;
    }
  }
  function groupErrorCount(group: AuditTrailEventGroup): number {
    return group.events.filter((e) => e.status === 'error').length;
  }
  function totalEvents(t: AuditTrail): number {
    return t.groups.reduce((acc, g) => acc + g.events.length, 0);
  }
  function totalErrors(t: AuditTrail): number {
    return t.groups.reduce(
      (acc, g) => acc + g.events.filter((e) => e.status === 'error').length,
      0,
    );
  }
  function handleToggleGroup(groupId: string, expanded: boolean): void {
    if (onToggleGroup === undefined) return;
    onToggleGroup(groupId, !expanded);
  }

  $: variant = trail.variant as AuditTrailVariant;
  $: labelId = trail.label !== undefined ? `${trail.groupId}-label` : undefined;
  $: descriptionId =
    trail.description !== undefined ? `${trail.groupId}-description` : undefined;
  $: eventCount = totalEvents(trail);
  $: errorCount = totalErrors(trail);
  $: isEmpty = eventCount === 0;
</script>

<section
  class={`facetheory-stitch-audit-trail facetheory-stitch-audit-trail-variant-${variant}`}
  data-safety-policy={trail.safetyPolicy}
  data-group-id={trail.groupId}
  data-variant={variant}
  data-group-count={String(trail.groups.length)}
  data-event-count={String(eventCount)}
  data-error-count={String(errorCount)}
  aria-labelledby={labelId}
  aria-describedby={descriptionId}
>
  {#if trail.label !== undefined || trail.description !== undefined}
    <header>
      {#if trail.label !== undefined}
        <h2 id={labelId} class="facetheory-stitch-audit-trail-label">{trail.label}</h2>
      {/if}
      {#if trail.description !== undefined}
        <p id={descriptionId} class="facetheory-stitch-audit-trail-description">{trail.description}</p>
      {/if}
    </header>
  {/if}

  {#if trail.metadata !== undefined}
    <MetadataBadgeGroup metadata={trail.metadata} />
  {/if}

  {#if isEmpty}
    <div class="facetheory-stitch-audit-trail-empty" role="status">
      {#if trail.emptyLabel !== undefined}{trail.emptyLabel}{:else}No audit events.{/if}
    </div>
  {:else}
    <ul role="list" class="facetheory-stitch-audit-trail-groups">
      {#each trail.groups as group (group.id)}
        {@const expanded = group.expanded === true}
        {@const eventsRegionId = `${group.id}-events`}
        {@const hasErrors = groupErrorCount(group) > 0}
        <li
          class={`facetheory-stitch-audit-trail-group${hasErrors ? ' facetheory-stitch-audit-trail-group-has-error' : ''}`}
          data-group-id={group.id}
          data-group-expanded={expanded ? 'true' : 'false'}
          data-group-event-count={String(group.events.length)}
          data-group-error-count={String(groupErrorCount(group))}
        >
          <button
            type="button"
            id={group.id}
            class="facetheory-stitch-audit-trail-group-toggle"
            aria-expanded={expanded ? 'true' : 'false'}
            aria-controls={eventsRegionId}
            data-group-toggle={group.id}
            on:click={() => handleToggleGroup(group.id, expanded)}
          >
            <span class="facetheory-stitch-audit-trail-group-label">{group.label}</span>
            <span
              class="facetheory-stitch-audit-trail-group-count"
              data-group-event-count-label={String(group.events.length)}
            >{group.events.length} events</span>
            <span
              class="facetheory-stitch-audit-trail-group-state"
              data-group-state-label={expanded ? 'expanded' : 'collapsed'}
            >{expanded ? 'Hide' : 'Show'}</span>
          </button>
          {#if group.description !== undefined}
            <p class="facetheory-stitch-audit-trail-group-description">{group.description}</p>
          {/if}
          <div
            id={eventsRegionId}
            class="facetheory-stitch-audit-trail-group-events"
            role="region"
            aria-labelledby={group.id}
            aria-hidden={expanded ? 'false' : 'true'}
            hidden={!expanded}
          >
            {#if expanded}
              <ol role="list" class="facetheory-stitch-audit-trail-event-list">
                {#each group.events as event (event.id)}
                  {@const tone = (event.tone ?? 'neutral')}
                  {@const redacted = isRedacted(event)}
                  <li
                    class={`facetheory-stitch-audit-event facetheory-stitch-audit-event-tone-${tone}${
                      event.status !== undefined
                        ? ` facetheory-stitch-audit-event-status-${event.status}`
                        : ''
                    }${redacted ? ' facetheory-stitch-audit-event-redacted' : ''}`}
                    data-event-id={event.id}
                    data-event-tone={tone}
                    data-event-status={event.status ?? ''}
                    data-event-redacted={redacted ? 'true' : 'false'}
                    role={eventRole(event)}
                  >
                    <div class="facetheory-stitch-audit-event-header">
                      <time
                        class="facetheory-stitch-audit-event-timestamp"
                        data-event-timestamp={event.timestamp}
                        datetime={event.timestamp}
                      >{event.timestamp}</time>
                      {#if event.icon !== undefined}
                        <span class="facetheory-stitch-audit-event-icon" aria-hidden="true">{event.icon}</span>
                      {/if}
                      <strong class="facetheory-stitch-audit-event-title">{event.title}</strong>
                      {#if event.status !== undefined}
                        <span
                          class={`facetheory-stitch-audit-event-status facetheory-stitch-audit-event-status-${event.status}`}
                          data-status-pill={event.status}
                        >{STATUS_LABEL[event.status]}</span>
                      {/if}
                      {#if event.tone !== undefined}
                        <span
                          class={`facetheory-stitch-audit-event-tone facetheory-stitch-audit-event-tone-${event.tone}`}
                          data-tone-pill={event.tone}
                        >{TONE_LABEL[event.tone]}</span>
                      {/if}
                    </div>
                    {#if event.actor !== undefined || event.actorSource !== undefined}
                      <div class="facetheory-stitch-audit-event-actor">
                        {#if event.actor !== undefined}
                          <span data-actor-label="true">{event.actor}</span>
                        {/if}
                        {#if event.actorSource !== undefined}
                          <span
                            class="facetheory-stitch-audit-event-actor-source"
                            data-actor-source="true"
                          >{event.actorSource}</span>
                        {/if}
                      </div>
                    {/if}
                    {#if redacted}
                      <p
                        class="facetheory-stitch-audit-event-redacted-marker"
                        data-event-redacted-marker="true"
                      >{event.redactedMarker}</p>
                    {:else}
                      {#if event.body !== undefined && variant === 'detailed'}
                        <p class="facetheory-stitch-audit-event-body">{event.body}</p>
                      {/if}
                      {#if event.metadata !== undefined && event.metadata.length > 0 && variant === 'detailed'}
                        <dl
                          class="facetheory-stitch-audit-event-metadata"
                          data-metadata-count={String(event.metadata.length)}
                        >
                          {#each event.metadata as entry (entry.key)}
                            <dt
                              class="facetheory-stitch-audit-event-metadata-key"
                              data-metadata-key={entry.key}
                            >{entry.label}</dt>
                            <dd class="facetheory-stitch-audit-event-metadata-value">{entry.value}</dd>
                          {/each}
                        </dl>
                      {/if}
                      {#if event.externalLink !== undefined}
                        {@const safeHref = safeLinkHref(event.externalLink.href)}
                        {#if safeHref !== undefined}
                          <a
                            class="facetheory-stitch-audit-event-external-link"
                            data-external-link="true"
                            href={safeHref}
                            rel="noopener noreferrer"
                            target="_blank"
                          >{#if event.externalLink.label !== undefined}{event.externalLink.label}{:else}{event.externalLink.href}{/if}</a>
                        {/if}
                      {/if}
                    {/if}
                  </li>
                {/each}
              </ol>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={trail.safetyPolicy}
  >Safety policy: {trail.safetyPolicy}</p>
</section>
