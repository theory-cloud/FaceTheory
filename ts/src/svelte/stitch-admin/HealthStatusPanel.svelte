<script lang="ts">
  import type {
    ConfidenceLevel,
    MetadataBadgeTone,
    OperatorHealthRow,
    OperatorHealthStatus,
    OperatorVisibilityMetadata,
    StalenessState,
  } from './types.js';

  export let title: unknown = 'Operator health';
  export let description: unknown = undefined;
  export let rows: OperatorHealthRow[];
  export let actions: unknown = undefined;
  export let emptyLabel: unknown = 'No health observations available.';

  interface HealthPalette {
    label: string;
    background: string;
    color: string;
    border: string;
  }

  interface HealthBadge {
    label: unknown;
    detail?: unknown;
    tone: MetadataBadgeTone;
    href?: string;
    title?: string;
  }

  const healthStatuses: OperatorHealthStatus[] = ['healthy', 'degraded', 'down', 'unknown'];

  const healthPalette: Record<OperatorHealthStatus, HealthPalette> = {
    healthy: {
      label: 'Healthy',
      background: 'var(--stitch-color-tertiary-container, #004c45)',
      color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
      border: 'var(--stitch-color-tertiary-container, #004c45)',
    },
    degraded: {
      label: 'Degraded',
      background: 'var(--stitch-color-secondary-container, #ffecc0)',
      color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
      border: 'var(--stitch-color-secondary-container, #ffecc0)',
    },
    down: {
      label: 'Down',
      background: 'var(--stitch-color-error-container, #ffdad6)',
      color: 'var(--stitch-color-on-error-container, #93000a)',
      border: 'var(--stitch-color-error-container, #ffdad6)',
    },
    unknown: {
      label: 'Unknown',
      background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
      color: 'var(--stitch-color-on-surface-variant, #464553)',
      border: 'var(--stitch-color-outline-variant, #c6c5d0)',
    },
  };

  const badgePalette: Record<MetadataBadgeTone, { background: string; color: string }> = {
    neutral: {
      background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
      color: 'var(--stitch-color-on-surface-variant, #464553)',
    },
    info: {
      background: 'var(--stitch-color-primary-container, #e0e0ff)',
      color: 'var(--stitch-color-on-primary-container, #000066)',
    },
    success: {
      background: 'var(--stitch-color-tertiary-container, #004c45)',
      color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    },
    warning: {
      background: 'var(--stitch-color-secondary-container, #ffecc0)',
      color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    },
    danger: {
      background: 'var(--stitch-color-error-container, #ffdad6)',
      color: 'var(--stitch-color-on-error-container, #93000a)',
    },
  };

  $: counts = countRows(rows);
  $: summary = healthStatuses.map((status) => ({
    status,
    count: counts[status],
    palette: healthPalette[status],
  }));

  function countRows(source: OperatorHealthRow[]): Record<OperatorHealthStatus, number> {
    return source.reduce<Record<OperatorHealthStatus, number>>(
      (out, row) => {
        out[row.status] += 1;
        return out;
      },
      { healthy: 0, degraded: 0, down: 0, unknown: 0 },
    );
  }

  function metadataToBadges(metadata: OperatorVisibilityMetadata): HealthBadge[] {
    const out: HealthBadge[] = [];

    if (metadata.provenance !== undefined) {
      const badge: HealthBadge = {
        label: 'Source',
        detail: metadata.provenance.source,
        tone: 'info',
      };
      if (metadata.provenance.href !== undefined) badge.href = metadata.provenance.href;
      if (metadata.provenance.observedAt !== undefined) badge.title = metadata.provenance.observedAt;
      out.push(badge);
    }

    if (metadata.correlation !== undefined) {
      const badge: HealthBadge = {
        label: 'Correlation',
        detail: metadata.correlation.correlationId,
        tone: 'info',
      };
      const title = correlationTitle(metadata.correlation);
      if (title !== undefined) badge.title = title;
      out.push(badge);
    }

    if (metadata.confidence !== undefined) {
      const badge: HealthBadge = {
        label: 'Confidence',
        detail: metadata.confidence.label ?? confidenceLabel(metadata.confidence.level),
        tone: confidenceTone(metadata.confidence.level),
      };
      if (metadata.confidence.reason !== undefined) badge.title = metadata.confidence.reason;
      out.push(badge);
    }

    if (metadata.staleness !== undefined) {
      const badge: HealthBadge = {
        label: 'Freshness',
        detail: metadata.staleness.ageLabel ?? stalenessLabel(metadata.staleness.state),
        tone: stalenessTone(metadata.staleness.state),
      };
      if (metadata.staleness.reason !== undefined) badge.title = metadata.staleness.reason;
      out.push(badge);
    }

    return out;
  }

  function correlationTitle(
    correlation: NonNullable<OperatorVisibilityMetadata['correlation']>,
  ): string | undefined {
    const parts: string[] = [];
    if (correlation.correlationSource !== undefined) {
      parts.push(`Source: ${correlation.correlationSource}`);
    }
    if (correlation.trigger !== undefined) {
      parts.push(`Trigger: ${correlation.trigger}`);
    }
    if (correlation.requestId !== undefined) {
      parts.push(`Request ID: ${correlation.requestId}`);
    }
    return parts.length > 0 ? parts.join(' · ') : undefined;
  }

  function healthStatusStyle(status: OperatorHealthStatus): string {
    const palette = healthPalette[status];
    return `display:inline-flex;align-items:center;padding:2px 10px;border-radius:9999px;background:${palette.background};color:${palette.color};font-size:12px;font-weight:600;`;
  }

  function healthSummaryStyle(status: OperatorHealthStatus): string {
    const palette = healthPalette[status];
    return `display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:9999px;background:${palette.background};color:${palette.color};font-size:12px;font-weight:600;`;
  }

  function healthRowStyle(status: OperatorHealthStatus): string {
    const palette = healthPalette[status];
    return `display:grid;grid-template-columns:minmax(0, 1fr) auto;gap:12px;padding:14px;border-radius:var(--stitch-radius-md, 10px);border:1px solid ${palette.border};background:var(--stitch-color-surface-container, #eaedff);`;
  }

  function badgeStyle(tone: MetadataBadgeTone): string {
    const palette = badgePalette[tone];
    return `display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:500;line-height:1.4;background:${palette.background};color:${palette.color};`;
  }

  function confidenceLabel(level: ConfidenceLevel): string {
    if (level === 'high') return 'High';
    if (level === 'medium') return 'Medium';
    if (level === 'low') return 'Low';
    return 'Unknown';
  }

  function confidenceTone(level: ConfidenceLevel): MetadataBadgeTone {
    if (level === 'high') return 'success';
    if (level === 'medium') return 'info';
    if (level === 'low') return 'warning';
    return 'neutral';
  }

  function stalenessLabel(state: StalenessState): string {
    if (state === 'fresh') return 'Fresh';
    if (state === 'stale') return 'Stale';
    return 'Freshness unknown';
  }

  function stalenessTone(state: StalenessState): MetadataBadgeTone {
    if (state === 'fresh') return 'success';
    if (state === 'stale') return 'danger';
    return 'neutral';
  }
</script>

<section
  class="facetheory-stitch-health-status-panel"
  style="display:flex;flex-direction:column;gap:16px;padding:20px;border-radius:var(--stitch-radius-lg, 12px);background:var(--stitch-color-surface-container-low, #f2f3ff);color:var(--stitch-color-on-surface, #131b2e);"
>
  <header
    class="facetheory-stitch-health-status-panel-header"
    style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;"
  >
    <div style="display:flex;flex-direction:column;gap:6px;">
      <h2 style="margin:0;font-size:18px;">{title}</h2>
      {#if description !== undefined}
        <p
          style="margin:0;font-size:14px;line-height:1.5;color:var(--stitch-color-on-surface-variant, #464553);"
        >
          {description}
        </p>
      {/if}
    </div>
    {#if $$slots.actions || actions !== undefined}
      <div
        class="facetheory-stitch-health-status-panel-actions"
        style="display:flex;gap:8px;flex-wrap:wrap;"
      >
        <slot name="actions">{actions}</slot>
      </div>
    {/if}
  </header>

  {#if rows.length > 0}
    <div
      class="facetheory-stitch-health-status-panel-summary"
      style="display:flex;flex-wrap:wrap;gap:8px;"
    >
      {#each summary as item}
        <span
          class={`facetheory-stitch-health-summary facetheory-stitch-health-summary-${item.status}`}
          style={healthSummaryStyle(item.status)}
        >
          {item.palette.label}: {item.count}
        </span>
      {/each}
    </div>

    <div
      class="facetheory-stitch-health-status-panel-rows"
      role="list"
      style="display:flex;flex-direction:column;gap:10px;"
    >
      {#each rows as row (row.key)}
        <article
          class={`facetheory-stitch-health-row facetheory-stitch-health-row-${row.status}${row.metadata?.staleness?.state === 'stale' ? ' facetheory-stitch-health-row-stale' : ''}`}
          data-health-status={row.status}
          data-staleness-state={row.metadata?.staleness?.state}
          role="listitem"
          style={healthRowStyle(row.status)}
        >
          <div style="display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <strong style="font-size:14px;">{row.label}</strong>
              <span
                class={`facetheory-stitch-health-status facetheory-stitch-health-status-${row.status}`}
                style={healthStatusStyle(row.status)}
              >
                {healthPalette[row.status].label}
              </span>
            </div>
            {#if row.description !== undefined}
              <p
                style="margin:0;font-size:13px;line-height:1.5;color:var(--stitch-color-on-surface-variant, #464553);"
              >
                {row.description}
              </p>
            {/if}
            {#if row.checkedAt !== undefined || row.metadata?.provenance?.sourceId !== undefined}
              <dl
                class="facetheory-stitch-health-row-metadata"
                style="display:flex;flex-wrap:wrap;gap:8px 12px;margin:0;font-size:12px;color:var(--stitch-color-on-surface-variant, #464553);"
              >
                {#if row.checkedAt !== undefined}
                  <dt style="font-weight:600;">Checked</dt>
                  <dd style="margin:0;">{row.checkedAt}</dd>
                {/if}
                {#if row.metadata?.provenance?.sourceId !== undefined}
                  <dt style="font-weight:600;">Source id</dt>
                  <dd style="margin:0;">{row.metadata.provenance.sourceId}</dd>
                {/if}
              </dl>
            {/if}
            {#if row.metadata !== undefined}
              <div
                class="facetheory-stitch-metadata-badge-group"
                style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;"
              >
                {#each metadataToBadges(row.metadata) as badge}
                  {#if badge.href !== undefined}
                    <a
                      class={`facetheory-stitch-metadata-badge facetheory-stitch-metadata-badge-${badge.tone}`}
                      href={badge.href}
                      title={badge.title}
                      style={`${badgeStyle(badge.tone)}text-decoration:none;`}
                    >
                      <span>{badge.label}</span>
                      {#if badge.detail !== undefined}
                        <span class="facetheory-stitch-metadata-badge-detail" style="opacity:0.78;">{badge.detail}</span>
                      {/if}
                    </a>
                  {:else}
                    <span
                      class={`facetheory-stitch-metadata-badge facetheory-stitch-metadata-badge-${badge.tone}`}
                      title={badge.title}
                      style={badgeStyle(badge.tone)}
                    >
                      <span>{badge.label}</span>
                      {#if badge.detail !== undefined}
                        <span class="facetheory-stitch-metadata-badge-detail" style="opacity:0.78;">{badge.detail}</span>
                      {/if}
                    </span>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
          {#if row.detail !== undefined}
            <span
              class="facetheory-stitch-health-row-detail"
              style="justify-self:end;font-size:13px;color:var(--stitch-color-on-surface-variant, #464553);white-space:nowrap;"
            >
              {row.detail}
            </span>
          {/if}
        </article>
      {/each}
    </div>
  {:else}
    <div
      class="facetheory-stitch-health-status-panel-empty"
      role="status"
      style="padding:16px;border-radius:var(--stitch-radius-md, 10px);background:var(--stitch-color-surface-container, #eaedff);color:var(--stitch-color-on-surface-variant, #464553);font-size:14px;"
    >
      {emptyLabel}
    </div>
  {/if}
</section>
