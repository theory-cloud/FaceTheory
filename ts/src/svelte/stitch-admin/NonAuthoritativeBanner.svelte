<script lang="ts">
  import type {
    ConfidenceLevel,
    MetadataBadgeProps,
    MetadataBadgeTone,
    OperatorVisibilityMetadata,
    StalenessState,
  } from './types.js';

  export let title: unknown = 'Non-authoritative data';
  export let description: unknown =
    'This view reflects imported or observed data until an authority gate confirms it.';
  export let metadata: OperatorVisibilityMetadata | undefined = undefined;
  export let actions: unknown = undefined;

  const palette: Record<MetadataBadgeTone, { background: string; color: string }> = {
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

  $: badges = metadata !== undefined ? metadataToBadges(metadata) : [];

  function metadataToBadges(source: OperatorVisibilityMetadata): MetadataBadgeProps[] {
    const out: MetadataBadgeProps[] = [];
    if (source.authority !== undefined) {
      out.push({
        label:
          source.authority === 'authoritative'
            ? 'Authoritative'
            : source.authority === 'non-authoritative'
              ? 'Non-authoritative'
              : 'Authority unknown',
        tone:
          source.authority === 'authoritative'
            ? 'success'
            : source.authority === 'non-authoritative'
              ? 'warning'
              : 'neutral',
      });
    }
    if (source.provenance !== undefined) {
      out.push({ label: 'Source', detail: source.provenance.source, tone: 'info' });
    }
    if (source.confidence !== undefined) {
      out.push({
        label: 'Confidence',
        detail: source.confidence.label ?? confidenceLabel(source.confidence.level),
        tone: confidenceTone(source.confidence.level),
      });
    }
    if (source.staleness !== undefined) {
      out.push({
        label: 'Freshness',
        detail: source.staleness.ageLabel ?? stalenessLabel(source.staleness.state),
        tone: stalenessTone(source.staleness.state),
      });
    }
    return out;
  }

  function badgeStyle(tone: MetadataBadgeTone): string {
    const current = palette[tone];
    return `display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:500;line-height:1.4;background:${current.background};color:${current.color};`;
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
  class="facetheory-stitch-non-authoritative-banner"
  role="note"
  style="display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:var(--stitch-radius-lg, 12px);background:var(--stitch-color-secondary-container, #ffecc0);color:var(--stitch-color-on-secondary-container, #3f2e00);"
>
  <div style="display:flex;gap:12px;align-items:flex-start;">
    <span aria-hidden="true" style="font-size:18px;">⚠</span>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <strong style="font-size:14px;">{title}</strong>
      <span style="font-size:13px;line-height:1.5;">{description}</span>
    </div>
  </div>

  {#if badges.length > 0}
    <div
      class="facetheory-stitch-metadata-badge-group"
      style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;"
    >
      {#each badges as badge}
        <span
          class={`facetheory-stitch-metadata-badge facetheory-stitch-metadata-badge-${badge.tone ?? 'neutral'}`}
          style={badgeStyle(badge.tone ?? 'neutral')}
        >
          <span>{badge.label}</span>
          {#if badge.detail !== undefined}
            <span class="facetheory-stitch-metadata-badge-detail" style="opacity:0.78;">{badge.detail}</span>
          {/if}
        </span>
      {/each}
    </div>
  {/if}

  {#if $$slots.actions || actions !== undefined}
    <div
      class="facetheory-stitch-non-authoritative-banner-actions"
      style="display:flex;gap:8px;flex-wrap:wrap;"
    >
      <slot name="actions">{actions}</slot>
    </div>
  {/if}
</section>
