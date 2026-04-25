<script lang="ts">
  import type {
    ConfidenceLevel,
    MetadataBadgeTone,
    OperatorVisibilityMetadata,
    StalenessState,
    VisibilityMatrixCell,
    VisibilityMatrixCellState,
    VisibilityMatrixDimension,
    VisibilityMatrixRow,
  } from './types.js';

  export let title: unknown = 'Operator visibility';
  export let description: unknown = undefined;
  export let dimensions: VisibilityMatrixDimension[];
  export let rows: VisibilityMatrixRow[];
  export let actions: unknown = undefined;
  export let emptyLabel: unknown = 'No visibility matrix data available.';
  export let emptyCellLabel: unknown = 'No visibility record';

  interface CellPalette {
    label: string;
    background: string;
    color: string;
    border: string;
  }

  interface MatrixBadge {
    label: unknown;
    detail?: unknown;
    tone: MetadataBadgeTone;
    href?: string;
    title?: string;
  }

  interface RenderedCell {
    dimension: VisibilityMatrixDimension;
    cell: VisibilityMatrixCell | undefined;
  }

  interface RenderedRow {
    row: VisibilityMatrixRow;
    cells: RenderedCell[];
  }

  const cellPalette: Record<VisibilityMatrixCellState, CellPalette> = {
    visible: {
      label: 'Visible',
      background: 'var(--stitch-color-tertiary-container, #004c45)',
      color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
      border: 'var(--stitch-color-tertiary-container, #004c45)',
    },
    'not-visible': {
      label: 'Not visible',
      background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
      color: 'var(--stitch-color-on-surface-variant, #464553)',
      border: 'var(--stitch-color-outline-variant, #c6c5d0)',
    },
    partial: {
      label: 'Partial',
      background: 'var(--stitch-color-secondary-container, #ffecc0)',
      color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
      border: 'var(--stitch-color-secondary-container, #ffecc0)',
    },
    blocked: {
      label: 'Blocked',
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

  $: hasMatrix = dimensions.length > 0 && rows.length > 0;
  $: renderedRows = rows.map<RenderedRow>((row) => ({
    row,
    cells: dimensions.map((dimension) => ({
      dimension,
      cell: findCell(row, dimension),
    })),
  }));

  function findCell(
    row: VisibilityMatrixRow,
    dimension: VisibilityMatrixDimension,
  ): VisibilityMatrixCell | undefined {
    return row.cells.find(
      (candidate) =>
        candidate.entityKey === row.entity.key &&
        candidate.dimensionKey === dimension.key,
    );
  }

  function metadataToBadges(metadata: OperatorVisibilityMetadata): MatrixBadge[] {
    const out: MatrixBadge[] = [];

    if (metadata.authority !== undefined) {
      out.push({
        label: authorityLabel(metadata.authority),
        tone:
          metadata.authority === 'authoritative'
            ? 'success'
            : metadata.authority === 'non-authoritative'
              ? 'warning'
              : 'neutral',
      });
    }

    if (metadata.provenance !== undefined) {
      const badge: MatrixBadge = {
        label: 'Source',
        detail: metadata.provenance.source,
        tone: 'info',
      };
      if (metadata.provenance.href !== undefined) badge.href = metadata.provenance.href;
      if (metadata.provenance.observedAt !== undefined) badge.title = metadata.provenance.observedAt;
      out.push(badge);
    }

    if (metadata.correlation !== undefined) {
      const badge: MatrixBadge = {
        label: 'Correlation',
        detail: metadata.correlation.correlationId,
        tone: 'info',
      };
      const title = correlationTitle(metadata.correlation);
      if (title !== undefined) badge.title = title;
      out.push(badge);
    }

    if (metadata.confidence !== undefined) {
      const badge: MatrixBadge = {
        label: 'Confidence',
        detail: metadata.confidence.label ?? confidenceLabel(metadata.confidence.level),
        tone: confidenceTone(metadata.confidence.level),
      };
      if (metadata.confidence.reason !== undefined) badge.title = metadata.confidence.reason;
      out.push(badge);
    }

    if (metadata.staleness !== undefined) {
      const badge: MatrixBadge = {
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

  function cellStatusStyle(state: VisibilityMatrixCellState): string {
    const palette = cellPalette[state];
    return `display:inline-flex;align-self:flex-start;align-items:center;padding:2px 10px;border-radius:9999px;background:${palette.background};color:${palette.color};font-size:12px;font-weight:600;`;
  }

  function cellStyle(state: VisibilityMatrixCellState): string {
    const palette = cellPalette[state];
    return `padding:12px;border-top:1px solid ${palette.border};background:var(--stitch-color-surface-container, #eaedff);vertical-align:top;`;
  }

  function badgeStyle(tone: MetadataBadgeTone): string {
    const palette = badgePalette[tone];
    return `display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:500;line-height:1.4;background:${palette.background};color:${palette.color};`;
  }

  function authorityLabel(authority: OperatorVisibilityMetadata['authority']): string {
    if (authority === 'authoritative') return 'Authoritative';
    if (authority === 'non-authoritative') return 'Non-authoritative';
    return 'Authority unknown';
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
  class="facetheory-stitch-visibility-matrix"
  style="display:flex;flex-direction:column;gap:16px;padding:20px;border-radius:var(--stitch-radius-lg, 12px);background:var(--stitch-color-surface-container-low, #f2f3ff);color:var(--stitch-color-on-surface, #131b2e);"
>
  <header
    class="facetheory-stitch-visibility-matrix-header"
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
        class="facetheory-stitch-visibility-matrix-actions"
        style="display:flex;gap:8px;flex-wrap:wrap;"
      >
        <slot name="actions">{actions}</slot>
      </div>
    {/if}
  </header>

  {#if hasMatrix}
    <div class="facetheory-stitch-visibility-matrix-scroll" style="overflow-x:auto;">
      <table
        class="facetheory-stitch-visibility-matrix-table"
        style="width:100%;min-width:640px;border-collapse:separate;border-spacing:0;"
      >
        <thead>
          <tr>
            <th
              scope="col"
              class="facetheory-stitch-visibility-matrix-entity-heading"
              style="padding:12px;border-bottom:1px solid var(--stitch-color-outline-variant, #c6c5d0);background:var(--stitch-color-surface-container-high, #e2e7ff);color:var(--stitch-color-on-surface, #131b2e);font-size:13px;font-weight:700;text-align:left;vertical-align:top;"
            >
              Entity
            </th>
            {#each dimensions as dimension (dimension.key)}
              <th
                scope="col"
                class="facetheory-stitch-visibility-matrix-dimension-heading"
                style="padding:12px;border-bottom:1px solid var(--stitch-color-outline-variant, #c6c5d0);background:var(--stitch-color-surface-container-high, #e2e7ff);color:var(--stitch-color-on-surface, #131b2e);font-size:13px;font-weight:700;text-align:left;vertical-align:top;"
              >
                <span style="display:flex;flex-direction:column;gap:4px;">
                  <span>{dimension.label}</span>
                  {#if dimension.description !== undefined}
                    <span
                      style="font-size:12px;font-weight:400;line-height:1.4;color:var(--stitch-color-on-surface-variant, #464553);"
                    >
                      {dimension.description}
                    </span>
                  {/if}
                </span>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each renderedRows as rendered (rendered.row.entity.key)}
            <tr>
              <th
                scope="row"
                class="facetheory-stitch-visibility-matrix-entity"
                style="padding:12px;border-top:1px solid var(--stitch-color-outline-variant, #c6c5d0);text-align:left;min-width:220px;vertical-align:top;"
              >
                <div
                  class="facetheory-stitch-visibility-matrix-entity-content"
                  style="display:flex;flex-direction:column;gap:6px;"
                >
                  <strong style="font-size:14px;">{rendered.row.entity.label}</strong>
                  {#if rendered.row.entity.description !== undefined}
                    <span
                      style="font-size:13px;font-weight:400;line-height:1.5;color:var(--stitch-color-on-surface-variant, #464553);"
                    >
                      {rendered.row.entity.description}
                    </span>
                  {/if}
                  {#if rendered.row.entity.metadata !== undefined}
                    <div
                      class="facetheory-stitch-metadata-badge-group"
                      style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;"
                    >
                      {#each metadataToBadges(rendered.row.entity.metadata) as badge}
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
              </th>
              {#each rendered.cells as entry (entry.dimension.key)}
                {#if entry.cell === undefined}
                  <td
                    class="facetheory-stitch-visibility-matrix-cell facetheory-stitch-visibility-matrix-cell-empty"
                    data-cell-state="unknown"
                    data-empty-cell="true"
                    style="padding:12px;border-top:1px solid var(--stitch-color-outline-variant, #c6c5d0);background:var(--stitch-color-surface-container, #eaedff);color:var(--stitch-color-on-surface-variant, #464553);font-size:13px;vertical-align:top;"
                  >
                    <span class="facetheory-stitch-visibility-matrix-cell-empty-label">{emptyCellLabel}</span>
                  </td>
                {:else}
                  <td
                    class={`facetheory-stitch-visibility-matrix-cell facetheory-stitch-visibility-matrix-cell-${entry.cell.state}${entry.cell.metadata?.staleness?.state === 'stale' ? ' facetheory-stitch-visibility-matrix-cell-stale' : ''}`}
                    data-cell-state={entry.cell.state}
                    data-authority-state={entry.cell.metadata?.authority}
                    data-confidence-level={entry.cell.metadata?.confidence?.level}
                    data-staleness-state={entry.cell.metadata?.staleness?.state}
                    style={cellStyle(entry.cell.state)}
                  >
                    <div
                      class="facetheory-stitch-visibility-matrix-cell-content"
                      style="display:flex;flex-direction:column;gap:8px;"
                    >
                      <span
                        class={`facetheory-stitch-visibility-matrix-cell-status facetheory-stitch-visibility-matrix-cell-status-${entry.cell.state}`}
                        style={cellStatusStyle(entry.cell.state)}
                      >
                        {entry.cell.label ?? cellPalette[entry.cell.state].label}
                      </span>
                      {#if entry.cell.detail !== undefined}
                        <span
                          class="facetheory-stitch-visibility-matrix-cell-detail"
                          style="font-size:13px;line-height:1.5;color:var(--stitch-color-on-surface-variant, #464553);"
                        >
                          {entry.cell.detail}
                        </span>
                      {/if}
                      {#if entry.cell.metadata !== undefined}
                        <div
                          class="facetheory-stitch-metadata-badge-group"
                          style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;"
                        >
                          {#each metadataToBadges(entry.cell.metadata) as badge}
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
                  </td>
                {/if}
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div
      class="facetheory-stitch-visibility-matrix-empty"
      role="status"
      style="padding:16px;border-radius:var(--stitch-radius-md, 10px);background:var(--stitch-color-surface-container, #eaedff);color:var(--stitch-color-on-surface-variant, #464553);font-size:14px;"
    >
      {emptyLabel}
    </div>
  {/if}
</section>
