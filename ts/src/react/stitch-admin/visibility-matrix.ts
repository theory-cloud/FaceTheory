import * as React from 'react';

import type {
  VisibilityMatrixCellState,
  VisibilityMatrixDimension,
  VisibilityMatrixRow,
} from '../../stitch-admin/operator-visibility-types.js';
import { MetadataBadgeGroup } from './operator-notices.js';

const h = React.createElement;

export type {
  VisibilityMatrixCell,
  VisibilityMatrixCellState,
  VisibilityMatrixDimension,
  VisibilityMatrixEntity,
  VisibilityMatrixRow,
} from '../../stitch-admin/operator-visibility-types.js';

export interface VisibilityMatrixProps {
  /** Matrix heading. Defaults to "Operator visibility". */
  title?: React.ReactNode;
  /** Optional explanatory copy above the matrix. */
  description?: React.ReactNode;
  /** Stable, caller-supplied dimension headers. */
  dimensions: VisibilityMatrixDimension[];
  /** Stable, caller-supplied entity rows and visibility cells. */
  rows: VisibilityMatrixRow[];
  /** Optional actions rendered in the matrix header. */
  actions?: React.ReactNode;
  /** Empty-state copy when no rows or dimensions are available. */
  emptyLabel?: React.ReactNode;
  /** Explicit copy for a missing entity × dimension cell. */
  emptyCellLabel?: React.ReactNode;
}

interface CellPalette {
  label: string;
  background: string;
  color: string;
  border: string;
}

const CELL_PALETTE: Record<VisibilityMatrixCellState, CellPalette> = {
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

/**
 * Entity × dimension visibility matrix for operator dashboards. Hosts provide
 * stable rows, cells, and metadata; FaceTheory only renders them so SSR and
 * hydration see the same authority, confidence, staleness, and empty-cell
 * state for each entity × dimension intersection.
 */
export function VisibilityMatrix(
  props: VisibilityMatrixProps,
): React.ReactElement {
  const {
    title = 'Operator visibility',
    description,
    dimensions,
    rows,
    actions,
    emptyLabel = 'No visibility matrix data available.',
    emptyCellLabel = 'No visibility record',
  } = props;
  const hasMatrix = dimensions.length > 0 && rows.length > 0;

  return h(
    'section',
    {
      className: 'facetheory-stitch-visibility-matrix',
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
        className: 'facetheory-stitch-visibility-matrix-header',
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
              className: 'facetheory-stitch-visibility-matrix-actions',
              style: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
            },
            actions,
          )
        : null,
    ),
    hasMatrix
      ? h(
          'div',
          {
            className: 'facetheory-stitch-visibility-matrix-scroll',
            style: { overflowX: 'auto' },
          },
          renderMatrixTable(rows, dimensions, emptyCellLabel),
        )
      : h(
          'div',
          {
            className: 'facetheory-stitch-visibility-matrix-empty',
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

function renderMatrixTable(
  rows: VisibilityMatrixRow[],
  dimensions: VisibilityMatrixDimension[],
  emptyCellLabel: React.ReactNode,
): React.ReactElement {
  return h(
    'table',
    {
      className: 'facetheory-stitch-visibility-matrix-table',
      style: {
        width: '100%',
        minWidth: '640px',
        borderCollapse: 'separate',
        borderSpacing: 0,
      },
    },
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h(
          'th',
          {
            scope: 'col',
            className: 'facetheory-stitch-visibility-matrix-entity-heading',
            style: headerCellStyle,
          },
          'Entity',
        ),
        dimensions.map((dimension) =>
          h(
            'th',
            {
              key: dimension.key,
              scope: 'col',
              className:
                'facetheory-stitch-visibility-matrix-dimension-heading',
              style: headerCellStyle,
            },
            h(
              'span',
              {
                style: { display: 'flex', flexDirection: 'column', gap: '4px' },
              },
              h('span', null, dimension.label),
              dimension.description !== undefined
                ? h(
                    'span',
                    {
                      style: {
                        fontSize: '12px',
                        fontWeight: 400,
                        lineHeight: 1.4,
                        color:
                          'var(--stitch-color-on-surface-variant, #464553)',
                      },
                    },
                    dimension.description,
                  )
                : null,
            ),
          ),
        ),
      ),
    ),
    h(
      'tbody',
      null,
      rows.map((row) =>
        h(
          'tr',
          { key: row.entity.key },
          h(
            'th',
            {
              scope: 'row',
              className: 'facetheory-stitch-visibility-matrix-entity',
              style: {
                ...bodyCellStyle,
                textAlign: 'left',
                minWidth: '220px',
                verticalAlign: 'top',
              },
            },
            renderEntity(row),
          ),
          dimensions.map((dimension) =>
            renderCell(row, dimension, emptyCellLabel),
          ),
        ),
      ),
    ),
  );
}

function renderEntity(row: VisibilityMatrixRow): React.ReactElement {
  return h(
    'div',
    {
      className: 'facetheory-stitch-visibility-matrix-entity-content',
      style: { display: 'flex', flexDirection: 'column', gap: '6px' },
    },
    h('strong', { style: { fontSize: '14px' } }, row.entity.label),
    row.entity.description !== undefined
      ? h(
          'span',
          {
            style: {
              fontSize: '13px',
              fontWeight: 400,
              lineHeight: 1.5,
              color: 'var(--stitch-color-on-surface-variant, #464553)',
            },
          },
          row.entity.description,
        )
      : null,
    row.entity.metadata !== undefined
      ? h(MetadataBadgeGroup, { metadata: row.entity.metadata })
      : null,
  );
}

function renderCell(
  row: VisibilityMatrixRow,
  dimension: VisibilityMatrixDimension,
  emptyCellLabel: React.ReactNode,
): React.ReactElement {
  const cell = row.cells.find(
    (candidate) =>
      candidate.entityKey === row.entity.key &&
      candidate.dimensionKey === dimension.key,
  );

  if (cell === undefined) {
    return h(
      'td',
      {
        key: dimension.key,
        className:
          'facetheory-stitch-visibility-matrix-cell facetheory-stitch-visibility-matrix-cell-empty',
        'data-cell-state': 'unknown',
        'data-empty-cell': 'true',
        style: {
          ...bodyCellStyle,
          background: 'var(--stitch-color-surface-container, #eaedff)',
          color: 'var(--stitch-color-on-surface-variant, #464553)',
          fontSize: '13px',
          verticalAlign: 'top',
        },
      },
      h(
        'span',
        {
          className: 'facetheory-stitch-visibility-matrix-cell-empty-label',
        },
        emptyCellLabel,
      ),
    );
  }

  const palette = CELL_PALETTE[cell.state];
  const isStale = cell.metadata?.staleness?.state === 'stale';

  return h(
    'td',
    {
      key: dimension.key,
      className: `facetheory-stitch-visibility-matrix-cell facetheory-stitch-visibility-matrix-cell-${cell.state}${isStale ? ' facetheory-stitch-visibility-matrix-cell-stale' : ''}`,
      'data-cell-state': cell.state,
      'data-authority-state': cell.metadata?.authority,
      'data-confidence-level': cell.metadata?.confidence?.level,
      'data-staleness-state': cell.metadata?.staleness?.state,
      style: {
        ...bodyCellStyle,
        borderTopColor: palette.border,
        background: 'var(--stitch-color-surface-container, #eaedff)',
        verticalAlign: 'top',
      },
    },
    h(
      'div',
      {
        className: 'facetheory-stitch-visibility-matrix-cell-content',
        style: { display: 'flex', flexDirection: 'column', gap: '8px' },
      },
      h(
        'span',
        {
          className: `facetheory-stitch-visibility-matrix-cell-status facetheory-stitch-visibility-matrix-cell-status-${cell.state}`,
          style: {
            display: 'inline-flex',
            alignSelf: 'flex-start',
            alignItems: 'center',
            padding: '2px 10px',
            borderRadius: '9999px',
            background: palette.background,
            color: palette.color,
            fontSize: '12px',
            fontWeight: 600,
          },
        },
        cell.label ?? palette.label,
      ),
      cell.detail !== undefined
        ? h(
            'span',
            {
              className: 'facetheory-stitch-visibility-matrix-cell-detail',
              style: {
                fontSize: '13px',
                lineHeight: 1.5,
                color: 'var(--stitch-color-on-surface-variant, #464553)',
              },
            },
            cell.detail,
          )
        : null,
      cell.metadata !== undefined
        ? h(MetadataBadgeGroup, { metadata: cell.metadata })
        : null,
    ),
  );
}

const headerCellStyle: React.CSSProperties = {
  padding: '12px',
  borderBottom: '1px solid var(--stitch-color-outline-variant, #c6c5d0)',
  background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
  color: 'var(--stitch-color-on-surface, #131b2e)',
  fontSize: '13px',
  fontWeight: 700,
  textAlign: 'left',
  verticalAlign: 'top',
};

const bodyCellStyle: React.CSSProperties = {
  padding: '12px',
  borderTop: '1px solid var(--stitch-color-outline-variant, #c6c5d0)',
};
