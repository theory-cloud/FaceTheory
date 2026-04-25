<script lang="ts">
  import type {
    ConfidenceLevel,
    MetadataBadgeProps,
    MetadataBadgeTone,
    OperatorVisibilityMetadata,
    StalenessState,
  } from './types.js';

  export let metadata: OperatorVisibilityMetadata;
  export let includeAuthority = true;

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

  $: badges = metadataToBadges(metadata, includeAuthority);

  function metadataToBadges(
    source: OperatorVisibilityMetadata,
    withAuthority: boolean,
  ): MetadataBadgeProps[] {
    const out: MetadataBadgeProps[] = [];

    if (withAuthority && source.authority !== undefined) {
      out.push({
        label: authorityLabel(source.authority),
        tone:
          source.authority === 'authoritative'
            ? 'success'
            : source.authority === 'non-authoritative'
              ? 'warning'
              : 'neutral',
      });
    }

    if (source.provenance !== undefined) {
      const badge: MetadataBadgeProps = {
        label: 'Source',
        detail: source.provenance.source,
        tone: 'info',
      };
      if (source.provenance.href !== undefined) badge.href = source.provenance.href;
      if (source.provenance.observedAt !== undefined) badge.title = source.provenance.observedAt;
      out.push(badge);
    }

    if (source.confidence !== undefined) {
      const badge: MetadataBadgeProps = {
        label: 'Confidence',
        detail: source.confidence.label ?? confidenceLabel(source.confidence.level),
        tone: confidenceTone(source.confidence.level),
      };
      if (source.confidence.reason !== undefined) badge.title = source.confidence.reason;
      out.push(badge);
    }

    if (source.staleness !== undefined) {
      const badge: MetadataBadgeProps = {
        label: 'Freshness',
        detail: source.staleness.ageLabel ?? stalenessLabel(source.staleness.state),
        tone: stalenessTone(source.staleness.state),
      };
      if (source.staleness.reason !== undefined) badge.title = source.staleness.reason;
      out.push(badge);
    }

    return out;
  }

  function badgeStyle(tone: MetadataBadgeTone): string {
    const current = palette[tone];
    return `display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:500;line-height:1.4;background:${current.background};color:${current.color};`;
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

{#if badges.length > 0}
  <div
    class="facetheory-stitch-metadata-badge-group"
    style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;"
  >
    {#each badges as badge}
      {#if badge.href !== undefined}
        <a
          class={`facetheory-stitch-metadata-badge facetheory-stitch-metadata-badge-${badge.tone ?? 'neutral'}`}
          href={badge.href}
          title={badge.title}
          style={`${badgeStyle(badge.tone ?? 'neutral')}text-decoration:none;`}
        >
          <span>{badge.label}</span>
          {#if badge.detail !== undefined}
            <span class="facetheory-stitch-metadata-badge-detail" style="opacity:0.78;">{badge.detail}</span>
          {/if}
        </a>
      {:else}
        <span
          class={`facetheory-stitch-metadata-badge facetheory-stitch-metadata-badge-${badge.tone ?? 'neutral'}`}
          title={badge.title}
          style={badgeStyle(badge.tone ?? 'neutral')}
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
