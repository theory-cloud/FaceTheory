import * as React from 'react';

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
import { safeMetadataHref } from '../../stitch-admin/safe-url.js';
import { MetadataBadgeGroup } from './operator-notices.js';

const h = React.createElement;

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

interface TonePalette {
  background: string;
  color: string;
  border: string;
  label: string;
}

const TONE_PALETTE: Record<AuditTrailEventTone, TonePalette> = {
  neutral: {
    background: 'var(--stitch-color-surface-container, #eaedff)',
    color: 'var(--stitch-color-on-surface, #131b2e)',
    border: 'var(--stitch-color-outline-variant, #c6c5d0)',
    label: 'Neutral',
  },
  info: {
    background: 'var(--stitch-color-primary-container, #e0e0ff)',
    color: 'var(--stitch-color-on-primary-container, #000066)',
    border: 'var(--stitch-color-primary-container, #e0e0ff)',
    label: 'Info',
  },
  success: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    border: 'var(--stitch-color-tertiary-container, #004c45)',
    label: 'Success',
  },
  warning: {
    background: 'var(--stitch-color-secondary-container, #ffecc0)',
    color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    border: 'var(--stitch-color-secondary-container, #ffecc0)',
    label: 'Warning',
  },
  danger: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    border: 'var(--stitch-color-error-container, #ffdad6)',
    label: 'Danger',
  },
};

const STATUS_LABEL: Record<AuditTrailEventStatus, string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
};

function isErrorEvent(event: AuditTrailEvent): boolean {
  return event.status === 'error';
}

function isRedactedEvent(event: AuditTrailEvent): boolean {
  return event.redactedMarker !== undefined && event.redactedMarker !== '';
}

function renderSafetyFootnote(policy: WizardSafetyPolicy): React.ReactElement {
  return h(
    'p',
    {
      key: 'safety',
      className: 'facetheory-stitch-wizard-safety-footnote',
      'data-safety-policy': policy,
      style: {
        margin: 0,
        fontSize: '11px',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--stitch-color-on-surface-variant, #464553)',
      },
    },
    `Safety policy: ${policy}`,
  );
}

function renderTonePill(event: AuditTrailEvent): React.ReactElement | null {
  const tone = event.tone;
  if (tone === undefined) return null;
  const palette = TONE_PALETTE[tone];
  return h(
    'span',
    {
      key: 'tone-pill',
      className: `facetheory-stitch-audit-event-tone facetheory-stitch-audit-event-tone-${tone}`,
      'data-tone-pill': tone,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '9999px',
        background: palette.background,
        color: palette.color,
        fontSize: '11px',
        fontWeight: 600,
        lineHeight: 1.4,
      },
    },
    palette.label,
  );
}

function renderStatusPill(event: AuditTrailEvent): React.ReactElement | null {
  const status = event.status;
  if (status === undefined) return null;
  return h(
    'span',
    {
      key: 'status-pill',
      className: `facetheory-stitch-audit-event-status facetheory-stitch-audit-event-status-${status}`,
      'data-status-pill': status,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '9999px',
        background:
          status === 'error'
            ? 'var(--stitch-color-error-container, #ffdad6)'
            : status === 'warning'
              ? 'var(--stitch-color-secondary-container, #ffecc0)'
              : status === 'success'
                ? 'var(--stitch-color-tertiary-container, #004c45)'
                : 'var(--stitch-color-primary-container, #e0e0ff)',
        color:
          status === 'error'
            ? 'var(--stitch-color-on-error-container, #93000a)'
            : status === 'warning'
              ? 'var(--stitch-color-on-secondary-container, #3f2e00)'
              : status === 'success'
                ? 'var(--stitch-color-on-tertiary-container, #52c1b4)'
                : 'var(--stitch-color-on-primary-container, #000066)',
        fontSize: '11px',
        fontWeight: 600,
        lineHeight: 1.4,
      },
    },
    STATUS_LABEL[status],
  );
}

function renderActorRow(event: AuditTrailEvent): React.ReactElement | null {
  if (event.actor === undefined && event.actorSource === undefined) return null;
  return h(
    'div',
    {
      key: 'actor',
      className: 'facetheory-stitch-audit-event-actor',
      style: {
        display: 'flex',
        gap: '6px',
        alignItems: 'center',
        fontSize: '12px',
        color: 'var(--stitch-color-on-surface-variant, #464553)',
      },
    },
    event.actor !== undefined
      ? h(
          'span',
          { key: 'actor-label', 'data-actor-label': 'true' },
          event.actor as React.ReactNode,
        )
      : null,
    event.actorSource !== undefined
      ? h(
          'span',
          {
            key: 'actor-source',
            className: 'facetheory-stitch-audit-event-actor-source',
            'data-actor-source': 'true',
          },
          event.actorSource,
        )
      : null,
  );
}

function renderMetadata(
  metadata: AuditTrailEventMetadataEntry[],
): React.ReactElement {
  return h(
    'dl',
    {
      key: 'metadata',
      className: 'facetheory-stitch-audit-event-metadata',
      'data-metadata-count': String(metadata.length),
      style: {
        margin: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
        gap: '4px 12px',
        fontSize: '12px',
      },
    },
    metadata.map((entry) =>
      h(
        React.Fragment,
        { key: entry.key },
        h(
          'dt',
          {
            key: 'dt',
            className: 'facetheory-stitch-audit-event-metadata-key',
            'data-metadata-key': entry.key,
          },
          entry.label as React.ReactNode,
        ),
        h(
          'dd',
          {
            key: 'dd',
            className: 'facetheory-stitch-audit-event-metadata-value',
          },
          entry.value as React.ReactNode,
        ),
      ),
    ),
  );
}

function renderExternalLink(
  link: AuditTrailEventExternalLink,
): React.ReactElement | null {
  const safeHref = safeMetadataHref(link.href);
  if (safeHref === undefined) return null;
  return h(
    'a',
    {
      key: 'external',
      className: 'facetheory-stitch-audit-event-external-link',
      'data-external-link': 'true',
      href: safeHref,
      rel: 'noopener noreferrer',
      target: '_blank',
      style: { fontSize: '12px' },
    },
    link.label !== undefined ? (link.label as React.ReactNode) : link.href,
  );
}

function renderEventBody(
  event: AuditTrailEvent,
  variant: AuditTrailVariant,
): React.ReactElement[] {
  const children: React.ReactElement[] = [];
  if (isRedactedEvent(event)) {
    children.push(
      h(
        'p',
        {
          key: 'redacted',
          className: 'facetheory-stitch-audit-event-redacted-marker',
          'data-event-redacted-marker': 'true',
          style: {
            margin: 0,
            fontFamily:
              'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)',
            fontSize: '12px',
            color: 'var(--stitch-color-on-surface-variant, #464553)',
          },
        },
        event.redactedMarker,
      ),
    );
    return children;
  }
  if (event.body !== undefined && variant === 'detailed') {
    children.push(
      h(
        'p',
        {
          key: 'body',
          className: 'facetheory-stitch-audit-event-body',
          style: {
            margin: 0,
            fontSize: '13px',
            lineHeight: 1.5,
            color: 'var(--stitch-color-on-surface, #131b2e)',
          },
        },
        event.body as React.ReactNode,
      ),
    );
  }
  if (
    event.metadata !== undefined &&
    event.metadata.length > 0 &&
    variant === 'detailed'
  ) {
    children.push(renderMetadata(event.metadata));
  }
  if (event.externalLink !== undefined) {
    const link = renderExternalLink(event.externalLink);
    if (link !== null) children.push(link);
  }
  return children;
}

function renderEvent(
  event: AuditTrailEvent,
  variant: AuditTrailVariant,
): React.ReactElement {
  const tone = event.tone ?? 'neutral';
  const palette = TONE_PALETTE[tone];
  const error = isErrorEvent(event);
  const redacted = isRedactedEvent(event);
  const role: 'listitem' | 'alert' = error ? 'alert' : 'listitem';
  return h(
    'li',
    {
      key: event.id,
      className: `facetheory-stitch-audit-event facetheory-stitch-audit-event-tone-${tone}${
        event.status !== undefined
          ? ` facetheory-stitch-audit-event-status-${event.status}`
          : ''
      }${redacted ? ' facetheory-stitch-audit-event-redacted' : ''}`,
      'data-event-id': event.id,
      'data-event-tone': tone,
      'data-event-status': event.status ?? '',
      'data-event-redacted': redacted ? 'true' : 'false',
      role,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: variant === 'detailed' ? '8px' : '4px',
        padding: variant === 'detailed' ? '12px' : '8px 12px',
        borderRadius: 'var(--stitch-radius-md, 10px)',
        background: palette.background,
        color: palette.color,
        border: `1px solid ${palette.border}`,
      },
    },
    h(
      'div',
      {
        key: 'header',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        },
      },
      h(
        'time',
        {
          key: 'timestamp',
          className: 'facetheory-stitch-audit-event-timestamp',
          'data-event-timestamp': event.timestamp,
          dateTime: event.timestamp,
          style: { fontSize: '11px', fontWeight: 600 },
        },
        event.timestamp,
      ),
      event.icon !== undefined
        ? h(
            'span',
            {
              key: 'icon',
              className: 'facetheory-stitch-audit-event-icon',
              'aria-hidden': 'true',
            },
            event.icon as React.ReactNode,
          )
        : null,
      h(
        'strong',
        {
          key: 'title',
          className: 'facetheory-stitch-audit-event-title',
          style: { fontSize: '13px' },
        },
        event.title as React.ReactNode,
      ),
      renderStatusPill(event),
      renderTonePill(event),
    ),
    renderActorRow(event),
    ...renderEventBody(event, variant),
  );
}

/* -------------------------------------------------------------------------- */
/* DisclosurePanel                                                            */
/* -------------------------------------------------------------------------- */

export interface DisclosurePanelPanelProps {
  panel: DisclosurePanelProps;
  onToggle?: (nextExpanded: boolean) => void;
  children?: React.ReactNode;
}

export function DisclosurePanel(
  props: DisclosurePanelPanelProps,
): React.ReactElement {
  const { panel, onToggle, children } = props;
  const tone = panel.tone ?? 'neutral';
  const palette = TONE_PALETTE[tone];
  const error = panel.status === 'error';
  const stateRole: 'alert' | undefined = error ? 'alert' : undefined;
  const panelContentId = `${panel.panelId}-region`;
  return h(
    'section',
    {
      className: `facetheory-stitch-disclosure-panel facetheory-stitch-disclosure-panel-tone-${tone}${
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
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        borderRadius: 'var(--stitch-radius-md, 10px)',
        background: palette.background,
        color: palette.color,
        border: `1px solid ${palette.border}`,
      },
    },
    h(
      'button',
      {
        key: 'toggle',
        type: 'button',
        id: panel.panelId,
        className: 'facetheory-stitch-disclosure-panel-toggle',
        'aria-expanded': panel.expanded ? 'true' : 'false',
        'aria-controls': panelContentId,
        'data-disclosure-toggle': panel.panelId,
        onClick:
          onToggle !== undefined ? () => onToggle(!panel.expanded) : undefined,
        style: {
          appearance: 'none',
          background: 'transparent',
          border: 'none',
          textAlign: 'left',
          padding: 0,
          color: 'inherit',
          cursor: onToggle !== undefined ? 'pointer' : 'default',
          font: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        },
      },
      h(
        'span',
        {
          key: 'label',
          className: 'facetheory-stitch-disclosure-panel-label',
          style: { fontSize: '14px', fontWeight: 600 },
        },
        panel.label as React.ReactNode,
      ),
      h(
        'span',
        {
          key: 'state',
          className: 'facetheory-stitch-disclosure-panel-state',
          'data-disclosure-state-label': panel.expanded
            ? 'expanded'
            : 'collapsed',
          style: { fontSize: '11px', fontWeight: 600 },
        },
        panel.expanded ? 'Hide' : 'Show',
      ),
    ),
    panel.description !== undefined
      ? h(
          'p',
          {
            key: 'description',
            className: 'facetheory-stitch-disclosure-panel-description',
            style: { margin: 0, fontSize: '12px', lineHeight: 1.5 },
          },
          panel.description as React.ReactNode,
        )
      : null,
    h(
      'div',
      {
        key: 'content',
        id: panelContentId,
        className: 'facetheory-stitch-disclosure-panel-content',
        role: 'region',
        'aria-labelledby': panel.panelId,
        'aria-hidden': panel.expanded ? 'false' : 'true',
        hidden: !panel.expanded,
      },
      panel.expanded ? children : null,
    ),
    renderSafetyFootnote(panel.safetyPolicy),
  );
}

/* -------------------------------------------------------------------------- */
/* AuditTrailPanel                                                            */
/* -------------------------------------------------------------------------- */

export interface AuditTrailPanelProps {
  trail: AuditTrail;
  onToggleGroup?: (groupId: string, nextExpanded: boolean) => void;
}

export function AuditTrailPanel(
  props: AuditTrailPanelProps,
): React.ReactElement {
  const { trail, onToggleGroup } = props;
  const labelId =
    trail.label !== undefined ? `${trail.groupId}-label` : undefined;
  const descriptionId =
    trail.description !== undefined
      ? `${trail.groupId}-description`
      : undefined;
  const totalEvents = trail.groups.reduce((acc, g) => acc + g.events.length, 0);
  const errorEvents = trail.groups.reduce(
    (acc, g) => acc + g.events.filter((e) => e.status === 'error').length,
    0,
  );
  const isEmpty = totalEvents === 0;
  return h(
    'section',
    {
      className: `facetheory-stitch-audit-trail facetheory-stitch-audit-trail-variant-${trail.variant}`,
      'data-safety-policy': trail.safetyPolicy,
      'data-group-id': trail.groupId,
      'data-variant': trail.variant,
      'data-group-count': String(trail.groups.length),
      'data-event-count': String(totalEvents),
      'data-error-count': String(errorEvents),
      'aria-labelledby': labelId,
      'aria-describedby': descriptionId,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
        color: 'var(--stitch-color-on-surface, #131b2e)',
      },
    },
    trail.label !== undefined || trail.description !== undefined
      ? h(
          'header',
          {
            key: 'header',
            style: { display: 'flex', flexDirection: 'column', gap: '4px' },
          },
          trail.label !== undefined
            ? h(
                'h2',
                {
                  key: 'label',
                  id: labelId,
                  className: 'facetheory-stitch-audit-trail-label',
                  style: { margin: 0, fontSize: '14px' },
                },
                trail.label as React.ReactNode,
              )
            : null,
          trail.description !== undefined
            ? h(
                'p',
                {
                  key: 'description',
                  id: descriptionId,
                  className: 'facetheory-stitch-audit-trail-description',
                  style: { margin: 0, fontSize: '12px', lineHeight: 1.5 },
                },
                trail.description as React.ReactNode,
              )
            : null,
        )
      : null,
    trail.metadata !== undefined
      ? h(MetadataBadgeGroup, { key: 'metadata', metadata: trail.metadata })
      : null,
    isEmpty
      ? h(
          'div',
          {
            key: 'empty',
            className: 'facetheory-stitch-audit-trail-empty',
            role: 'status',
            style: {
              padding: '14px',
              borderRadius: 'var(--stitch-radius-md, 10px)',
              background: 'var(--stitch-color-surface-container, #eaedff)',
              color: 'var(--stitch-color-on-surface-variant, #464553)',
              fontSize: '13px',
            },
          },
          trail.emptyLabel !== undefined
            ? (trail.emptyLabel as React.ReactNode)
            : 'No audit events.',
        )
      : h(
          'ul',
          {
            key: 'groups',
            role: 'list',
            className: 'facetheory-stitch-audit-trail-groups',
            style: {
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            },
          },
          trail.groups.map((group) =>
            renderGroup(group, trail.variant, onToggleGroup),
          ),
        ),
    renderSafetyFootnote(trail.safetyPolicy),
  );
}

function renderGroup(
  group: AuditTrailEventGroup,
  variant: AuditTrailVariant,
  onToggleGroup: AuditTrailPanelProps['onToggleGroup'],
): React.ReactElement {
  const expanded = group.expanded === true;
  const eventsRegionId = `${group.id}-events`;
  const hasErrors = group.events.some((e) => e.status === 'error');
  return h(
    'li',
    {
      key: group.id,
      className: `facetheory-stitch-audit-trail-group${hasErrors ? ' facetheory-stitch-audit-trail-group-has-error' : ''}`,
      'data-group-id': group.id,
      'data-group-expanded': expanded ? 'true' : 'false',
      'data-group-event-count': String(group.events.length),
      'data-group-error-count': String(
        group.events.filter((e) => e.status === 'error').length,
      ),
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: 'var(--stitch-radius-md, 10px)',
        background: 'var(--stitch-color-surface-container, #eaedff)',
        border: '1px solid var(--stitch-color-outline-variant, #c6c5d0)',
      },
    },
    h(
      'button',
      {
        key: 'toggle',
        type: 'button',
        id: group.id,
        className: 'facetheory-stitch-audit-trail-group-toggle',
        'aria-expanded': expanded ? 'true' : 'false',
        'aria-controls': eventsRegionId,
        'data-group-toggle': group.id,
        onClick:
          onToggleGroup !== undefined
            ? () => onToggleGroup(group.id, !expanded)
            : undefined,
        style: {
          appearance: 'none',
          background: 'transparent',
          border: 'none',
          textAlign: 'left',
          padding: 0,
          color: 'inherit',
          cursor: onToggleGroup !== undefined ? 'pointer' : 'default',
          font: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        },
      },
      h(
        'span',
        {
          key: 'label',
          className: 'facetheory-stitch-audit-trail-group-label',
          style: { fontSize: '13px', fontWeight: 600 },
        },
        group.label as React.ReactNode,
      ),
      h(
        'span',
        {
          key: 'count',
          className: 'facetheory-stitch-audit-trail-group-count',
          'data-group-event-count-label': String(group.events.length),
          style: {
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--stitch-color-on-surface-variant, #464553)',
          },
        },
        `${group.events.length} events`,
      ),
      h(
        'span',
        {
          key: 'state',
          className: 'facetheory-stitch-audit-trail-group-state',
          'data-group-state-label': expanded ? 'expanded' : 'collapsed',
          style: { fontSize: '11px', fontWeight: 600 },
        },
        expanded ? 'Hide' : 'Show',
      ),
    ),
    group.description !== undefined
      ? h(
          'p',
          {
            key: 'description',
            className: 'facetheory-stitch-audit-trail-group-description',
            style: {
              margin: 0,
              fontSize: '12px',
              lineHeight: 1.5,
              color: 'var(--stitch-color-on-surface-variant, #464553)',
            },
          },
          group.description as React.ReactNode,
        )
      : null,
    h(
      'div',
      {
        key: 'events',
        id: eventsRegionId,
        className: 'facetheory-stitch-audit-trail-group-events',
        role: 'region',
        'aria-labelledby': group.id,
        'aria-hidden': expanded ? 'false' : 'true',
        hidden: !expanded,
      },
      expanded
        ? h(
            'ol',
            {
              role: 'list',
              className: 'facetheory-stitch-audit-trail-event-list',
              style: {
                margin: 0,
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              },
            },
            group.events.map((event) => renderEvent(event, variant)),
          )
        : null,
    ),
  );
}
