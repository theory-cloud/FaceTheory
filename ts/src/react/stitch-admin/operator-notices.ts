import * as React from 'react';

import type {
  ConfidenceLevel,
  OperatorEmptyStateConfig,
  OperatorEmptyStateIntent,
  OperatorVisibilityMetadata,
  StalenessState,
} from '../../stitch-admin/operator-visibility-types.js';

const h = React.createElement;

export type MetadataBadgeTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

export interface MetadataBadgeProps {
  label: React.ReactNode;
  detail?: React.ReactNode;
  tone?: MetadataBadgeTone;
  href?: string;
  title?: string;
}

export interface MetadataBadgeGroupProps {
  metadata: OperatorVisibilityMetadata;
  includeAuthority?: boolean;
}

export interface NonAuthoritativeBannerProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  metadata?: OperatorVisibilityMetadata;
  actions?: React.ReactNode;
}

export interface OperatorEmptyStateProps {
  config: OperatorEmptyStateConfig;
  action?: React.ReactNode;
}

interface BadgePalette {
  background: string;
  color: string;
}

const BADGE_PALETTE: Record<MetadataBadgeTone, BadgePalette> = {
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

const INTENT_LABELS: Record<OperatorEmptyStateIntent, string> = {
  'no-data': 'No data',
  'not-authorized': 'Not authorized',
  'not-configured': 'Not configured',
  'filtered-empty': 'No matching results',
  loading: 'Loading',
  error: 'Unavailable',
};

/**
 * Compact metadata chip for operator dashboard safety signals. Values are
 * caller-supplied so SSR and hydration see the same labels and detail text.
 */
export function MetadataBadge(props: MetadataBadgeProps): React.ReactElement {
  const { label, detail, tone = 'neutral', href, title } = props;
  const palette = BADGE_PALETTE[tone];
  const content = [
    h('span', { key: 'label' }, label),
    detail !== undefined
      ? h(
          'span',
          {
            key: 'detail',
            className: 'facetheory-stitch-metadata-badge-detail',
            style: { opacity: 0.78 },
          },
          detail,
        )
      : null,
  ];

  const commonProps = {
    className: `facetheory-stitch-metadata-badge facetheory-stitch-metadata-badge-${tone}`,
    title,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      maxWidth: '100%',
      padding: '3px 10px',
      borderRadius: '9999px',
      fontSize: '12px',
      fontWeight: 500,
      lineHeight: 1.4,
      background: palette.background,
      color: palette.color,
    },
  };

  return href !== undefined
    ? h(
        'a',
        {
          ...commonProps,
          href,
          style: { ...commonProps.style, textDecoration: 'none' },
        },
        content,
      )
    : h('span', commonProps, content);
}

/**
 * Renders the standard authority/provenance/correlation/confidence/staleness
 * metadata envelope as deterministic badges. It never computes freshness,
 * age text, or correlation identifiers.
 */
export function MetadataBadgeGroup(
  props: MetadataBadgeGroupProps,
): React.ReactElement | null {
  const { metadata, includeAuthority = true } = props;
  const badges = metadataToBadges(metadata, includeAuthority);
  if (badges.length === 0) return null;

  return h(
    'div',
    {
      className: 'facetheory-stitch-metadata-badge-group',
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
      },
    },
    badges.map((badge, index) => h(MetadataBadge, { ...badge, key: index })),
  );
}

/**
 * High-visibility warning for imported/observed operator data that is not yet
 * authoritative. Consumers pass the metadata; FaceTheory only renders it.
 */
export function NonAuthoritativeBanner(
  props: NonAuthoritativeBannerProps,
): React.ReactElement {
  const {
    title = 'Non-authoritative data',
    description = 'This view reflects imported or observed data until an authority gate confirms it.',
    metadata,
    actions,
  } = props;

  return h(
    'section',
    {
      className: 'facetheory-stitch-non-authoritative-banner',
      role: 'note',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-secondary-container, #ffecc0)',
        color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
      },
    },
    h(
      'div',
      { style: { display: 'flex', gap: '12px', alignItems: 'flex-start' } },
      h('span', { 'aria-hidden': true, style: { fontSize: '18px' } }, '⚠'),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
        h('strong', { style: { fontSize: '14px' } }, title),
        h(
          'span',
          { style: { fontSize: '13px', lineHeight: 1.5 } },
          description,
        ),
      ),
    ),
    metadata !== undefined ? h(MetadataBadgeGroup, { metadata }) : null,
    actions !== undefined
      ? h(
          'div',
          {
            className: 'facetheory-stitch-non-authoritative-banner-actions',
            style: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
          },
          actions,
        )
      : null,
  );
}

/**
 * Explicit empty state for operator views. The placeholder policy is rendered
 * into the DOM so tests and consumers can confirm no production-looking mock
 * data is being used.
 */
export function OperatorEmptyState(
  props: OperatorEmptyStateProps,
): React.ReactElement {
  const { config, action } = props;
  const actionNode = action ?? config.actionLabel;

  return h(
    'section',
    {
      className: `facetheory-stitch-operator-empty-state facetheory-stitch-operator-empty-state-${config.intent}`,
      'data-empty-intent': config.intent,
      'data-placeholder-policy': config.placeholderDataPolicy,
      role: config.intent === 'error' ? 'alert' : 'status',
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '24px',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
        color: 'var(--stitch-color-on-surface, #131b2e)',
      },
    },
    h(
      'span',
      {
        className: 'facetheory-stitch-operator-empty-state-intent',
        style: {
          fontSize: '12px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--stitch-color-on-surface-variant, #464553)',
        },
      },
      INTENT_LABELS[config.intent],
    ),
    h('strong', { style: { fontSize: '16px' } }, config.title),
    config.description !== undefined
      ? h(
          'p',
          {
            style: {
              margin: 0,
              fontSize: '14px',
              lineHeight: 1.5,
              color: 'var(--stitch-color-on-surface-variant, #464553)',
            },
          },
          config.description,
        )
      : null,
    actionNode !== undefined
      ? h(
          'div',
          {
            className: 'facetheory-stitch-operator-empty-state-action',
            style: { marginTop: '4px' },
          },
          actionNode,
        )
      : null,
  );
}

function metadataToBadges(
  metadata: OperatorVisibilityMetadata,
  includeAuthority: boolean,
): MetadataBadgeProps[] {
  const out: MetadataBadgeProps[] = [];

  if (includeAuthority && metadata.authority !== undefined) {
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
    const provenanceBadge: MetadataBadgeProps = {
      label: 'Source',
      detail: metadata.provenance.source,
      tone: 'info',
    };
    if (metadata.provenance.href !== undefined) {
      provenanceBadge.href = metadata.provenance.href;
    }
    if (metadata.provenance.observedAt !== undefined) {
      provenanceBadge.title = metadata.provenance.observedAt;
    }
    out.push(provenanceBadge);
  }

  if (metadata.correlation !== undefined) {
    const correlationBadge: MetadataBadgeProps = {
      label: 'Correlation',
      detail: metadata.correlation.correlationId,
      tone: 'info',
    };
    const title = correlationTitle(metadata.correlation);
    if (title !== undefined) {
      correlationBadge.title = title;
    }
    out.push(correlationBadge);
  }

  if (metadata.confidence !== undefined) {
    const confidenceBadge: MetadataBadgeProps = {
      label: 'Confidence',
      detail:
        metadata.confidence.label ?? confidenceLabel(metadata.confidence.level),
      tone: confidenceTone(metadata.confidence.level),
    };
    if (metadata.confidence.reason !== undefined) {
      confidenceBadge.title = metadata.confidence.reason;
    }
    out.push(confidenceBadge);
  }

  if (metadata.staleness !== undefined) {
    const stalenessBadge: MetadataBadgeProps = {
      label: 'Freshness',
      detail:
        metadata.staleness.ageLabel ?? stalenessLabel(metadata.staleness.state),
      tone: stalenessTone(metadata.staleness.state),
    };
    if (metadata.staleness.reason !== undefined) {
      stalenessBadge.title = metadata.staleness.reason;
    }
    out.push(stalenessBadge);
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

function authorityLabel(
  authority: OperatorVisibilityMetadata['authority'],
): string {
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
