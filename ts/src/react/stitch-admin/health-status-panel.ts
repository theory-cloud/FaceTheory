import * as React from 'react';

import type {
  OperatorHealthRow,
  OperatorHealthStatus,
} from '../../stitch-admin/operator-visibility-types.js';
import { MetadataBadgeGroup } from './operator-notices.js';

const h = React.createElement;

export type { OperatorHealthRow, OperatorHealthStatus };

export interface HealthStatusPanelProps {
  /** Panel heading. Defaults to "Operator health". */
  title?: React.ReactNode;
  /** Optional explanatory copy above the row list. */
  description?: React.ReactNode;
  /** Stable, caller-supplied health observations. */
  rows: OperatorHealthRow[];
  /** Optional actions rendered in the panel header. */
  actions?: React.ReactNode;
  /** Empty-state copy when no health rows are available. */
  emptyLabel?: React.ReactNode;
}

interface HealthPalette {
  label: string;
  background: string;
  color: string;
  border: string;
}

const HEALTH_PALETTE: Record<OperatorHealthStatus, HealthPalette> = {
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

/**
 * Presentational health/status panel for operator dashboards. Hosts own API or
 * Lambda health checks and pass stable observations in; FaceTheory only renders
 * the rows so SSR and hydration select the same statuses and metadata.
 */
export function HealthStatusPanel(
  props: HealthStatusPanelProps,
): React.ReactElement {
  const {
    title = 'Operator health',
    description,
    rows,
    actions,
    emptyLabel = 'No health observations available.',
  } = props;
  const counts = countRows(rows);

  return h(
    'section',
    {
      className: 'facetheory-stitch-health-status-panel',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '20px',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
        color: 'var(--stitch-color-on-surface, #131b2e)',
      },
    },
    h(
      'header',
      {
        className: 'facetheory-stitch-health-status-panel-header',
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
        },
      },
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('h2', { style: { margin: 0, fontSize: '18px' } }, title),
        description !== undefined
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
              description,
            )
          : null,
      ),
      actions !== undefined
        ? h(
            'div',
            {
              className: 'facetheory-stitch-health-status-panel-actions',
              style: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
            },
            actions,
          )
        : null,
    ),
    rows.length > 0 ? renderSummary(counts) : null,
    rows.length > 0
      ? h(
          'div',
          {
            className: 'facetheory-stitch-health-status-panel-rows',
            role: 'list',
            style: { display: 'flex', flexDirection: 'column', gap: '10px' },
          },
          rows.map((row) => renderHealthRow(row)),
        )
      : h(
          'div',
          {
            className: 'facetheory-stitch-health-status-panel-empty',
            role: 'status',
            style: {
              padding: '16px',
              borderRadius: 'var(--stitch-radius-md, 10px)',
              background: 'var(--stitch-color-surface-container, #eaedff)',
              color: 'var(--stitch-color-on-surface-variant, #464553)',
              fontSize: '14px',
            },
          },
          emptyLabel,
        ),
  );
}

function renderSummary(
  counts: Record<OperatorHealthStatus, number>,
): React.ReactElement {
  return h(
    'div',
    {
      className: 'facetheory-stitch-health-status-panel-summary',
      style: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
    },
    (Object.keys(HEALTH_PALETTE) as OperatorHealthStatus[]).map((status) => {
      const palette = HEALTH_PALETTE[status];
      return h(
        'span',
        {
          key: status,
          className: `facetheory-stitch-health-summary facetheory-stitch-health-summary-${status}`,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '9999px',
            background: palette.background,
            color: palette.color,
            fontSize: '12px',
            fontWeight: 600,
          },
        },
        `${palette.label}: ${counts[status]}`,
      );
    }),
  );
}

function renderHealthRow(row: OperatorHealthRow): React.ReactElement {
  const palette = HEALTH_PALETTE[row.status];
  const isStale = row.metadata?.staleness?.state === 'stale';

  return h(
    'article',
    {
      key: row.key,
      className: `facetheory-stitch-health-row facetheory-stitch-health-row-${row.status}${isStale ? ' facetheory-stitch-health-row-stale' : ''}`,
      'data-health-status': row.status,
      'data-staleness-state': row.metadata?.staleness?.state,
      role: 'listitem',
      style: {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: '12px',
        padding: '14px',
        borderRadius: 'var(--stitch-radius-md, 10px)',
        border: `1px solid ${palette.border}`,
        background: 'var(--stitch-color-surface-container, #eaedff)',
      },
    },
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          },
        },
        h('strong', { style: { fontSize: '14px' } }, row.label),
        h(
          'span',
          {
            className: `facetheory-stitch-health-status facetheory-stitch-health-status-${row.status}`,
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 10px',
              borderRadius: '9999px',
              background: palette.background,
              color: palette.color,
              fontSize: '12px',
              fontWeight: 600,
            },
          },
          palette.label,
        ),
      ),
      row.description !== undefined
        ? h(
            'p',
            {
              style: {
                margin: 0,
                fontSize: '13px',
                lineHeight: 1.5,
                color: 'var(--stitch-color-on-surface-variant, #464553)',
              },
            },
            row.description,
          )
        : null,
      renderRowMetadata(row),
      row.metadata !== undefined
        ? h(MetadataBadgeGroup, { metadata: row.metadata })
        : null,
    ),
    row.detail !== undefined
      ? h(
          'span',
          {
            className: 'facetheory-stitch-health-row-detail',
            style: {
              justifySelf: 'end',
              fontSize: '13px',
              color: 'var(--stitch-color-on-surface-variant, #464553)',
              whiteSpace: 'nowrap',
            },
          },
          row.detail,
        )
      : null,
  );
}

function renderRowMetadata(row: OperatorHealthRow): React.ReactElement | null {
  if (
    row.checkedAt === undefined &&
    row.metadata?.provenance?.sourceId === undefined
  ) {
    return null;
  }

  return h(
    'dl',
    {
      className: 'facetheory-stitch-health-row-metadata',
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px 12px',
        margin: 0,
        fontSize: '12px',
        color: 'var(--stitch-color-on-surface-variant, #464553)',
      },
    },
    row.checkedAt !== undefined
      ? [
          h(
            'dt',
            { key: 'checked-label', style: { fontWeight: 600 } },
            'Checked',
          ),
          h(
            'dd',
            { key: 'checked-value', style: { margin: 0 } },
            row.checkedAt,
          ),
        ]
      : null,
    row.metadata?.provenance?.sourceId !== undefined
      ? [
          h(
            'dt',
            { key: 'source-label', style: { fontWeight: 600 } },
            'Source id',
          ),
          h(
            'dd',
            { key: 'source-value', style: { margin: 0 } },
            row.metadata.provenance.sourceId,
          ),
        ]
      : null,
  );
}

function countRows(
  rows: OperatorHealthRow[],
): Record<OperatorHealthStatus, number> {
  return rows.reduce<Record<OperatorHealthStatus, number>>(
    (counts, row) => {
      counts[row.status] += 1;
      return counts;
    },
    { healthy: 0, degraded: 0, down: 0, unknown: 0 },
  );
}
