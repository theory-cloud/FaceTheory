import { defineComponent, h } from 'vue';
import type { PropType, VNodeChild } from 'vue';

import type {
  ConfidenceLevel,
  OperatorEmptyStateConfig,
  OperatorEmptyStateIntent,
  OperatorVisibilityMetadata,
  StalenessState,
} from '../../stitch-admin/operator-visibility-types.js';
import { safeMetadataHref } from '../../stitch-admin/safe-url.js';
import { renderPropContent, vnodeChildProp } from '../stitch-common.js';

export type MetadataBadgeTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

export interface MetadataBadgeProps {
  label: VNodeChild;
  detail?: VNodeChild;
  tone?: MetadataBadgeTone;
  href?: string;
  title?: string;
}

export interface MetadataBadgeGroupProps {
  metadata: OperatorVisibilityMetadata;
  includeAuthority?: boolean;
}

export interface NonAuthoritativeBannerProps {
  title?: VNodeChild;
  description?: VNodeChild;
  metadata?: OperatorVisibilityMetadata;
  actions?: VNodeChild;
}

export interface OperatorEmptyStateProps {
  config: OperatorEmptyStateConfig;
  action?: VNodeChild;
}

interface BadgePalette {
  background: string;
  color: string;
}

const badgePalette: Record<MetadataBadgeTone, BadgePalette> = {
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

const intentLabels: Record<OperatorEmptyStateIntent, string> = {
  'no-data': 'No data',
  'not-authorized': 'Not authorized',
  'not-configured': 'Not configured',
  'filtered-empty': 'No matching results',
  loading: 'Loading',
  error: 'Unavailable',
};

export const MetadataBadge = defineComponent({
  name: 'FaceTheoryVueMetadataBadge',
  props: {
    label: { ...vnodeChildProp, required: true },
    detail: vnodeChildProp,
    tone: {
      type: String as PropType<MetadataBadgeTone>,
      default: 'neutral',
    },
    href: { type: String, required: false },
    title: { type: String, required: false },
  },
  setup(props) {
    return () => {
      const tone = props.tone;
      const safeHref = safeMetadataHref(props.href);
      const palette = badgePalette[tone];
      const commonProps = {
        class: `facetheory-stitch-metadata-badge facetheory-stitch-metadata-badge-${tone}`,
        title: props.title,
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
      const children = [
        h('span', null, renderPropContent(props.label)),
        props.detail !== undefined
          ? h(
              'span',
              {
                class: 'facetheory-stitch-metadata-badge-detail',
                style: { opacity: 0.78 },
              },
              renderPropContent(props.detail),
            )
          : null,
      ];

      return safeHref !== undefined
        ? h(
            'a',
            {
              ...commonProps,
              href: safeHref,
              style: { ...commonProps.style, textDecoration: 'none' },
            },
            children,
          )
        : h('span', commonProps, children);
    };
  },
});

export const MetadataBadgeGroup = defineComponent({
  name: 'FaceTheoryVueMetadataBadgeGroup',
  props: {
    metadata: {
      type: Object as PropType<OperatorVisibilityMetadata>,
      required: true,
    },
    includeAuthority: { type: Boolean, default: true },
  },
  setup(props) {
    return () => {
      const badges = metadataToBadges(props.metadata, props.includeAuthority);
      if (badges.length === 0) return null;

      return h(
        'div',
        {
          class: 'facetheory-stitch-metadata-badge-group',
          style: {
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px',
          },
        },
        badges.map((badge, index) =>
          h(MetadataBadge, { ...badge, key: index }),
        ),
      );
    };
  },
});

export const NonAuthoritativeBanner = defineComponent({
  name: 'FaceTheoryVueNonAuthoritativeBanner',
  props: {
    title: vnodeChildProp,
    description: vnodeChildProp,
    metadata: {
      type: Object as PropType<OperatorVisibilityMetadata | undefined>,
      required: false,
    },
    actions: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () => {
      const title =
        props.title !== undefined
          ? renderPropContent(props.title)
          : ['Non-authoritative data'];
      const description =
        props.description !== undefined
          ? renderPropContent(props.description)
          : [
              'This view reflects imported or observed data until an authority gate confirms it.',
            ];
      const actions = slots.actions?.() ?? renderPropContent(props.actions);

      return h(
        'section',
        {
          class: 'facetheory-stitch-non-authoritative-banner',
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
        [
          h(
            'div',
            {
              style: {
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
              },
            },
            [
              h(
                'span',
                { 'aria-hidden': true, style: { fontSize: '18px' } },
                '⚠',
              ),
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  },
                },
                [
                  h('strong', { style: { fontSize: '14px' } }, title),
                  h(
                    'span',
                    { style: { fontSize: '13px', lineHeight: 1.5 } },
                    description,
                  ),
                ],
              ),
            ],
          ),
          props.metadata !== undefined
            ? h(MetadataBadgeGroup, { metadata: props.metadata })
            : null,
          actions.length > 0
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-non-authoritative-banner-actions',
                  style: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
                },
                actions,
              )
            : null,
        ],
      );
    };
  },
});

export const OperatorEmptyState = defineComponent({
  name: 'FaceTheoryVueOperatorEmptyState',
  props: {
    config: {
      type: Object as PropType<OperatorEmptyStateConfig>,
      required: true,
    },
    action: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () => {
      const action =
        slots.action?.() ??
        renderPropContent(props.action ?? props.config.actionLabel);

      return h(
        'section',
        {
          class: `facetheory-stitch-operator-empty-state facetheory-stitch-operator-empty-state-${props.config.intent}`,
          'data-empty-intent': props.config.intent,
          'data-placeholder-policy': props.config.placeholderDataPolicy,
          role: props.config.intent === 'error' ? 'alert' : 'status',
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
        [
          h(
            'span',
            {
              class: 'facetheory-stitch-operator-empty-state-intent',
              style: {
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--stitch-color-on-surface-variant, #464553)',
              },
            },
            intentLabels[props.config.intent],
          ),
          h('strong', { style: { fontSize: '16px' } }, props.config.title),
          props.config.description !== undefined
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
                props.config.description,
              )
            : null,
          action.length > 0
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-operator-empty-state-action',
                  style: { marginTop: '4px' },
                },
                action,
              )
            : null,
        ],
      );
    };
  },
});

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
    const href = safeMetadataHref(metadata.provenance.href);
    if (href !== undefined) {
      provenanceBadge.href = href;
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
