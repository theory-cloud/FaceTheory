/**
 * Vue parity for `AuditTrailPanel` and standalone `DisclosurePanel`. Mirrors
 * the React adapter's class names, data-* attributes, ARIA wiring, role
 * markers (error events as `role="alert"`), tone/status pills, redacted
 * marker rule, safe-href filtering on external links, and safety-policy
 * footnote.
 *
 * Presentation-only — see `stitch-admin/audit-trail-types.ts` for the
 * trust-boundary contract.
 */

import { defineComponent, h } from 'vue';
import type { PropType, VNodeChild } from 'vue';

import { safeMetadataHref } from '../../stitch-admin/safe-url.js';
import type {
  AuditTrail,
  AuditTrailEvent,
  AuditTrailEventExternalLink,
  AuditTrailEventGroup,
  AuditTrailEventMetadataEntry,
  AuditTrailEventStatus,
  AuditTrailEventTone,
  AuditTrailVariant,
  DisclosurePanelProps,
} from '../../stitch-admin/audit-trail-types.js';
import type { WizardSafetyPolicy } from '../../stitch-admin/wizard-types.js';
import { renderPropContent, vnodeChildProp } from '../stitch-common.js';
import { MetadataBadgeGroup } from './operator-notices.js';

export type {
  AuditTrail,
  AuditTrailEvent,
  AuditTrailEventExternalLink,
  AuditTrailEventGroup,
  AuditTrailEventMetadataEntry,
  AuditTrailEventStatus,
  AuditTrailEventTone,
  AuditTrailVariant,
  DisclosurePanelProps,
};

export interface AuditTrailPanelProps {
  trail: AuditTrail;
  onToggleGroup?: (groupId: string, nextExpanded: boolean) => void;
}

export interface DisclosurePanelPanelProps {
  panel: DisclosurePanelProps;
  onToggle?: (nextExpanded: boolean) => void;
  default?: VNodeChild;
}

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

function renderSafetyFootnote(policy: WizardSafetyPolicy): VNodeChild {
  return h(
    'p',
    {
      class: 'facetheory-stitch-wizard-safety-footnote',
      'data-safety-policy': policy,
    },
    `Safety policy: ${policy}`,
  );
}

function isRedactedEvent(event: AuditTrailEvent): boolean {
  return event.redactedMarker !== undefined && event.redactedMarker !== '';
}

function renderTonePill(event: AuditTrailEvent): VNodeChild {
  const tone = event.tone;
  if (tone === undefined) return null;
  return h(
    'span',
    {
      class: `facetheory-stitch-audit-event-tone facetheory-stitch-audit-event-tone-${tone}`,
      'data-tone-pill': tone,
    },
    TONE_LABEL[tone],
  );
}

function renderStatusPill(event: AuditTrailEvent): VNodeChild {
  const status = event.status;
  if (status === undefined) return null;
  return h(
    'span',
    {
      class: `facetheory-stitch-audit-event-status facetheory-stitch-audit-event-status-${status}`,
      'data-status-pill': status,
    },
    STATUS_LABEL[status],
  );
}

function renderActorRow(event: AuditTrailEvent): VNodeChild {
  if (event.actor === undefined && event.actorSource === undefined) return null;
  return h('div', { class: 'facetheory-stitch-audit-event-actor' }, [
    event.actor !== undefined
      ? h(
          'span',
          { 'data-actor-label': 'true' },
          renderPropContent(event.actor as VNodeChild),
        )
      : null,
    event.actorSource !== undefined
      ? h(
          'span',
          {
            class: 'facetheory-stitch-audit-event-actor-source',
            'data-actor-source': 'true',
          },
          event.actorSource,
        )
      : null,
  ]);
}

function renderMetadata(metadata: AuditTrailEventMetadataEntry[]): VNodeChild {
  return h(
    'dl',
    {
      class: 'facetheory-stitch-audit-event-metadata',
      'data-metadata-count': String(metadata.length),
    },
    metadata.flatMap((entry) => [
      h(
        'dt',
        {
          key: `${entry.key}-dt`,
          class: 'facetheory-stitch-audit-event-metadata-key',
          'data-metadata-key': entry.key,
        },
        renderPropContent(entry.label as VNodeChild),
      ),
      h(
        'dd',
        {
          key: `${entry.key}-dd`,
          class: 'facetheory-stitch-audit-event-metadata-value',
        },
        renderPropContent(entry.value as VNodeChild),
      ),
    ]),
  );
}

function renderExternalLink(link: AuditTrailEventExternalLink): VNodeChild {
  const safeHref = safeMetadataHref(link.href);
  if (safeHref === undefined) return null;
  return h(
    'a',
    {
      class: 'facetheory-stitch-audit-event-external-link',
      'data-external-link': 'true',
      href: safeHref,
      rel: 'noopener noreferrer',
      target: '_blank',
    },
    link.label !== undefined
      ? renderPropContent(link.label as VNodeChild)
      : link.href,
  );
}

function renderEventBody(
  event: AuditTrailEvent,
  variant: AuditTrailVariant,
): VNodeChild[] {
  if (isRedactedEvent(event)) {
    return [
      h(
        'p',
        {
          class: 'facetheory-stitch-audit-event-redacted-marker',
          'data-event-redacted-marker': 'true',
        },
        event.redactedMarker,
      ),
    ];
  }
  const out: VNodeChild[] = [];
  if (event.body !== undefined && variant === 'detailed') {
    out.push(
      h(
        'p',
        { class: 'facetheory-stitch-audit-event-body' },
        renderPropContent(event.body as VNodeChild),
      ),
    );
  }
  if (
    event.metadata !== undefined &&
    event.metadata.length > 0 &&
    variant === 'detailed'
  ) {
    out.push(renderMetadata(event.metadata));
  }
  if (event.externalLink !== undefined) {
    const link = renderExternalLink(event.externalLink);
    if (link !== null) out.push(link);
  }
  return out;
}

function renderEvent(
  event: AuditTrailEvent,
  variant: AuditTrailVariant,
): VNodeChild {
  const tone: AuditTrailEventTone = event.tone ?? 'neutral';
  const redacted = isRedactedEvent(event);
  const error = event.status === 'error';
  const role: 'listitem' | 'alert' = error ? 'alert' : 'listitem';
  return h(
    'li',
    {
      key: event.id,
      class: `facetheory-stitch-audit-event facetheory-stitch-audit-event-tone-${tone}${
        event.status !== undefined
          ? ` facetheory-stitch-audit-event-status-${event.status}`
          : ''
      }${redacted ? ' facetheory-stitch-audit-event-redacted' : ''}`,
      'data-event-id': event.id,
      'data-event-tone': tone,
      'data-event-status': event.status ?? '',
      'data-event-redacted': redacted ? 'true' : 'false',
      role,
    },
    [
      h('div', { class: 'facetheory-stitch-audit-event-header' }, [
        h(
          'time',
          {
            class: 'facetheory-stitch-audit-event-timestamp',
            'data-event-timestamp': event.timestamp,
            dateTime: event.timestamp,
          },
          event.timestamp,
        ),
        !redacted && event.icon !== undefined
          ? h(
              'span',
              {
                class: 'facetheory-stitch-audit-event-icon',
                'aria-hidden': 'true',
              },
              renderPropContent(event.icon as VNodeChild),
            )
          : null,
        !redacted
          ? h(
              'strong',
              { class: 'facetheory-stitch-audit-event-title' },
              renderPropContent(event.title as VNodeChild),
            )
          : null,
        renderStatusPill(event),
        renderTonePill(event),
      ]),
      renderActorRow(event),
      ...renderEventBody(event, variant),
    ],
  );
}

function renderGroup(
  group: AuditTrailEventGroup,
  variant: AuditTrailVariant,
  onToggleGroup: AuditTrailPanelProps['onToggleGroup'],
): VNodeChild {
  const expanded = group.expanded === true;
  const eventsRegionId = `${group.id}-events`;
  const hasErrors = group.events.some((e) => e.status === 'error');
  return h(
    'li',
    {
      key: group.id,
      class: `facetheory-stitch-audit-trail-group${hasErrors ? ' facetheory-stitch-audit-trail-group-has-error' : ''}`,
      'data-group-id': group.id,
      'data-group-expanded': expanded ? 'true' : 'false',
      'data-group-event-count': String(group.events.length),
      'data-group-error-count': String(
        group.events.filter((e) => e.status === 'error').length,
      ),
    },
    [
      h(
        'button',
        {
          type: 'button',
          id: group.id,
          class: 'facetheory-stitch-audit-trail-group-toggle',
          'aria-expanded': expanded ? 'true' : 'false',
          'aria-controls': eventsRegionId,
          'data-group-toggle': group.id,
          onClick:
            onToggleGroup !== undefined
              ? () => onToggleGroup(group.id, !expanded)
              : undefined,
        },
        [
          h(
            'span',
            { class: 'facetheory-stitch-audit-trail-group-label' },
            renderPropContent(group.label as VNodeChild),
          ),
          h(
            'span',
            {
              class: 'facetheory-stitch-audit-trail-group-count',
              'data-group-event-count-label': String(group.events.length),
            },
            `${group.events.length} events`,
          ),
          h(
            'span',
            {
              class: 'facetheory-stitch-audit-trail-group-state',
              'data-group-state-label': expanded ? 'expanded' : 'collapsed',
            },
            expanded ? 'Hide' : 'Show',
          ),
        ],
      ),
      group.description !== undefined
        ? h(
            'p',
            { class: 'facetheory-stitch-audit-trail-group-description' },
            renderPropContent(group.description as VNodeChild),
          )
        : null,
      h(
        'div',
        {
          id: eventsRegionId,
          class: 'facetheory-stitch-audit-trail-group-events',
          role: 'region',
          'aria-labelledby': group.id,
          'aria-hidden': expanded ? 'false' : 'true',
          hidden: !expanded,
        },
        [
          expanded
            ? h(
                'ol',
                {
                  role: 'list',
                  class: 'facetheory-stitch-audit-trail-event-list',
                },
                group.events.map((event) => renderEvent(event, variant)),
              )
            : null,
        ],
      ),
    ],
  );
}

export const AuditTrailPanel = defineComponent({
  name: 'FaceTheoryVueAuditTrailPanel',
  props: {
    trail: { type: Object as PropType<AuditTrail>, required: true },
    onToggleGroup: {
      type: Function as PropType<
        (groupId: string, nextExpanded: boolean) => void
      >,
      required: false,
    },
  },
  setup(props) {
    return () => {
      const trail = props.trail;
      const totalEvents = trail.groups.reduce(
        (acc, g) => acc + g.events.length,
        0,
      );
      const errorEvents = trail.groups.reduce(
        (acc, g) => acc + g.events.filter((e) => e.status === 'error').length,
        0,
      );
      const labelId =
        trail.label !== undefined ? `${trail.groupId}-label` : undefined;
      const descriptionId =
        trail.description !== undefined
          ? `${trail.groupId}-description`
          : undefined;
      const isEmpty = totalEvents === 0;
      return h(
        'section',
        {
          class: `facetheory-stitch-audit-trail facetheory-stitch-audit-trail-variant-${trail.variant}`,
          'data-safety-policy': trail.safetyPolicy,
          'data-group-id': trail.groupId,
          'data-variant': trail.variant,
          'data-group-count': String(trail.groups.length),
          'data-event-count': String(totalEvents),
          'data-error-count': String(errorEvents),
          'aria-labelledby': labelId,
          'aria-describedby': descriptionId,
        },
        [
          trail.label !== undefined || trail.description !== undefined
            ? h('header', null, [
                trail.label !== undefined
                  ? h(
                      'h2',
                      {
                        id: labelId,
                        class: 'facetheory-stitch-audit-trail-label',
                      },
                      renderPropContent(trail.label as VNodeChild),
                    )
                  : null,
                trail.description !== undefined
                  ? h(
                      'p',
                      {
                        id: descriptionId,
                        class: 'facetheory-stitch-audit-trail-description',
                      },
                      renderPropContent(trail.description as VNodeChild),
                    )
                  : null,
              ])
            : null,
          trail.metadata !== undefined
            ? h(MetadataBadgeGroup, { metadata: trail.metadata })
            : null,
          isEmpty
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-audit-trail-empty',
                  role: 'status',
                },
                trail.emptyLabel !== undefined
                  ? renderPropContent(trail.emptyLabel as VNodeChild)
                  : 'No audit events.',
              )
            : h(
                'ul',
                {
                  role: 'list',
                  class: 'facetheory-stitch-audit-trail-groups',
                },
                trail.groups.map((group) =>
                  renderGroup(group, trail.variant, props.onToggleGroup),
                ),
              ),
          renderSafetyFootnote(trail.safetyPolicy),
        ],
      );
    };
  },
});

export const DisclosurePanel = defineComponent({
  name: 'FaceTheoryVueDisclosurePanel',
  props: {
    panel: { type: Object as PropType<DisclosurePanelProps>, required: true },
    onToggle: {
      type: Function as PropType<(nextExpanded: boolean) => void>,
      required: false,
    },
    default: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () => {
      const panel = props.panel;
      const tone: AuditTrailEventTone = panel.tone ?? 'neutral';
      const error = panel.status === 'error';
      const stateRole: 'alert' | undefined = error ? 'alert' : undefined;
      const panelContentId = `${panel.panelId}-region`;
      const body = panel.expanded
        ? (slots.default?.() ??
          (props.default !== undefined ? renderPropContent(props.default) : []))
        : [];
      return h(
        'section',
        {
          class: `facetheory-stitch-disclosure-panel facetheory-stitch-disclosure-panel-tone-${tone}${
            panel.status !== undefined
              ? ` facetheory-stitch-disclosure-panel-status-${panel.status}`
              : ''
          }`,
          'data-disclosure-id': panel.panelId,
          'data-disclosure-expanded': panel.expanded ? 'true' : 'false',
          'data-disclosure-tone': tone,
          'data-disclosure-status': panel.status ?? '',
          'data-safety-policy': panel.safetyPolicy,
          role: stateRole,
        },
        [
          h(
            'button',
            {
              type: 'button',
              id: panel.panelId,
              class: 'facetheory-stitch-disclosure-panel-toggle',
              'aria-expanded': panel.expanded ? 'true' : 'false',
              'aria-controls': panelContentId,
              'data-disclosure-toggle': panel.panelId,
              onClick:
                props.onToggle !== undefined
                  ? () => props.onToggle!(!panel.expanded)
                  : undefined,
            },
            [
              h(
                'span',
                { class: 'facetheory-stitch-disclosure-panel-label' },
                renderPropContent(panel.label as VNodeChild),
              ),
              h(
                'span',
                {
                  class: 'facetheory-stitch-disclosure-panel-state',
                  'data-disclosure-state-label': panel.expanded
                    ? 'expanded'
                    : 'collapsed',
                },
                panel.expanded ? 'Hide' : 'Show',
              ),
            ],
          ),
          panel.description !== undefined
            ? h(
                'p',
                {
                  class: 'facetheory-stitch-disclosure-panel-description',
                },
                renderPropContent(panel.description as VNodeChild),
              )
            : null,
          h(
            'div',
            {
              id: panelContentId,
              class: 'facetheory-stitch-disclosure-panel-content',
              role: 'region',
              'aria-labelledby': panel.panelId,
              'aria-hidden': panel.expanded ? 'false' : 'true',
              hidden: !panel.expanded,
            },
            body,
          ),
          renderSafetyFootnote(panel.safetyPolicy),
        ],
      );
    };
  },
});
