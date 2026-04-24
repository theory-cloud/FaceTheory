import { defineComponent, h } from 'vue';
import type { PropType, VNodeChild } from 'vue';

import type {
  OperatorHealthRow,
  OperatorHealthStatus,
} from '../../stitch-admin/operator-visibility-types.js';
import { renderPropContent, vnodeChildProp } from '../stitch-common.js';
import { MetadataBadgeGroup } from './operator-notices.js';

export type { OperatorHealthRow, OperatorHealthStatus };

export interface HealthStatusPanelProps {
  title?: VNodeChild;
  description?: VNodeChild;
  rows: OperatorHealthRow[];
  actions?: VNodeChild;
  emptyLabel?: VNodeChild;
}

interface HealthPalette {
  label: string;
  background: string;
  color: string;
  border: string;
}

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

export const HealthStatusPanel = defineComponent({
  name: 'FaceTheoryVueHealthStatusPanel',
  props: {
    title: vnodeChildProp,
    description: vnodeChildProp,
    rows: {
      type: Array as PropType<OperatorHealthRow[]>,
      required: true,
    },
    actions: vnodeChildProp,
    emptyLabel: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () => {
      const title =
        props.title !== undefined
          ? renderPropContent(props.title)
          : ['Operator health'];
      const description = renderPropContent(props.description);
      const actions = slots.actions?.() ?? renderPropContent(props.actions);
      const emptyLabel =
        props.emptyLabel !== undefined
          ? renderPropContent(props.emptyLabel)
          : ['No health observations available.'];
      const counts = countRows(props.rows);

      return h(
        'section',
        {
          class: 'facetheory-stitch-health-status-panel',
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
        [
          h(
            'header',
            {
              class: 'facetheory-stitch-health-status-panel-header',
              style: {
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '16px',
              },
            },
            [
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  },
                },
                [
                  h('h2', { style: { margin: 0, fontSize: '18px' } }, title),
                  description.length > 0
                    ? h(
                        'p',
                        {
                          style: {
                            margin: 0,
                            fontSize: '14px',
                            lineHeight: 1.5,
                            color:
                              'var(--stitch-color-on-surface-variant, #464553)',
                          },
                        },
                        description,
                      )
                    : null,
                ],
              ),
              actions.length > 0
                ? h(
                    'div',
                    {
                      class: 'facetheory-stitch-health-status-panel-actions',
                      style: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
                    },
                    actions,
                  )
                : null,
            ],
          ),
          props.rows.length > 0 ? renderSummary(counts) : null,
          props.rows.length > 0
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-health-status-panel-rows',
                  role: 'list',
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  },
                },
                props.rows.map((row) => renderHealthRow(row)),
              )
            : h(
                'div',
                {
                  class: 'facetheory-stitch-health-status-panel-empty',
                  role: 'status',
                  style: {
                    padding: '16px',
                    borderRadius: 'var(--stitch-radius-md, 10px)',
                    background:
                      'var(--stitch-color-surface-container, #eaedff)',
                    color: 'var(--stitch-color-on-surface-variant, #464553)',
                    fontSize: '14px',
                  },
                },
                emptyLabel,
              ),
        ],
      );
    };
  },
});

function renderSummary(
  counts: Record<OperatorHealthStatus, number>,
): VNodeChild {
  return h(
    'div',
    {
      class: 'facetheory-stitch-health-status-panel-summary',
      style: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
    },
    (Object.keys(healthPalette) as OperatorHealthStatus[]).map((status) => {
      const palette = healthPalette[status];
      return h(
        'span',
        {
          key: status,
          class: `facetheory-stitch-health-summary facetheory-stitch-health-summary-${status}`,
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

function renderHealthRow(row: OperatorHealthRow): VNodeChild {
  const palette = healthPalette[row.status];
  const isStale = row.metadata?.staleness?.state === 'stale';

  return h(
    'article',
    {
      key: row.key,
      class: `facetheory-stitch-health-row facetheory-stitch-health-row-${row.status}${isStale ? ' facetheory-stitch-health-row-stale' : ''}`,
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
    [
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        [
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
            [
              h('strong', { style: { fontSize: '14px' } }, row.label),
              h(
                'span',
                {
                  class: `facetheory-stitch-health-status facetheory-stitch-health-status-${row.status}`,
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
            ],
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
        ],
      ),
      row.detail !== undefined
        ? h(
            'span',
            {
              class: 'facetheory-stitch-health-row-detail',
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
    ],
  );
}

function renderRowMetadata(row: OperatorHealthRow): VNodeChild | null {
  const children: VNodeChild[] = [];
  if (row.checkedAt !== undefined) {
    children.push(
      h('dt', { key: 'checked-label', style: { fontWeight: 600 } }, 'Checked'),
    );
    children.push(
      h('dd', { key: 'checked-value', style: { margin: 0 } }, row.checkedAt),
    );
  }
  if (row.metadata?.provenance?.sourceId !== undefined) {
    children.push(
      h('dt', { key: 'source-label', style: { fontWeight: 600 } }, 'Source id'),
    );
    children.push(
      h(
        'dd',
        { key: 'source-value', style: { margin: 0 } },
        row.metadata.provenance.sourceId,
      ),
    );
  }
  if (children.length === 0) return null;

  return h(
    'dl',
    {
      class: 'facetheory-stitch-health-row-metadata',
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px 12px',
        margin: 0,
        fontSize: '12px',
        color: 'var(--stitch-color-on-surface-variant, #464553)',
      },
    },
    children,
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
