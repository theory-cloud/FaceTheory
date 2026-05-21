import * as React from 'react';

import type {
  WizardDiffList,
  WizardDiffListCanonicalKind,
  WizardDiffListDetail,
  WizardDiffListOperationKind,
  WizardDiffListRow,
  WizardReconciliationPlan,
  WizardReconciliationPlanCanonicalKind,
  WizardReconciliationPlanDetail,
  WizardReconciliationPlanOperationKind,
  WizardReconciliationPlanRow,
} from '../../stitch-admin/wizard-reconciliation-plan-types.js';
import {
  canonicalizeWizardReconciliationPlanKind,
} from '../../stitch-admin/wizard-reconciliation-plan-types.js';
import type { WizardSafetyPolicy } from '../../stitch-admin/wizard-types.js';
import { MetadataBadgeGroup } from './operator-notices.js';

const h = React.createElement;

const REDACTED_MARKER = '[redacted]';

export type {
  WizardDiffList,
  WizardDiffListCanonicalKind,
  WizardDiffListDetail,
  WizardDiffListOperationKind,
  WizardDiffListRow,
  WizardReconciliationPlan,
  WizardReconciliationPlanCanonicalKind,
  WizardReconciliationPlanDetail,
  WizardReconciliationPlanOperationKind,
  WizardReconciliationPlanRow,
};

interface KindPalette {
  background: string;
  color: string;
  border: string;
  label: string;
  prominent: boolean;
}

const KIND_PALETTE: Record<WizardReconciliationPlanCanonicalKind, KindPalette> = {
  create: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    border: 'var(--stitch-color-tertiary-container, #004c45)',
    label: 'Will create',
    prominent: false,
  },
  update: {
    background: 'var(--stitch-color-primary-container, #e0e0ff)',
    color: 'var(--stitch-color-on-primary-container, #000066)',
    border: 'var(--stitch-color-primary-container, #e0e0ff)',
    label: 'Will update',
    prominent: false,
  },
  satisfied: {
    background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
    color: 'var(--stitch-color-on-surface-variant, #464553)',
    border: 'var(--stitch-color-outline-variant, #c6c5d0)',
    label: 'Already satisfied',
    prominent: false,
  },
  conflict: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    border: 'var(--stitch-color-on-error-container, #93000a)',
    label: 'Conflict',
    prominent: true,
  },
  blocked: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    border: 'var(--stitch-color-on-error-container, #93000a)',
    label: 'Blocked',
    prominent: true,
  },
  external: {
    background: 'var(--stitch-color-secondary-container, #ffecc0)',
    color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    border: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    label: 'External step required',
    prominent: true,
  },
  noop: {
    background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
    color: 'var(--stitch-color-on-surface-variant, #464553)',
    border: 'var(--stitch-color-outline-variant, #c6c5d0)',
    label: 'No-op',
    prominent: false,
  },
};

const CANONICAL_KINDS: WizardReconciliationPlanCanonicalKind[] = [
  'create',
  'update',
  'satisfied',
  'conflict',
  'blocked',
  'external',
  'noop',
];

export interface WizardReconciliationPlanPanelProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  plan: WizardReconciliationPlan;
  emptyLabel?: React.ReactNode;
  /**
   * Optional caller-supplied callback fired when a row's toggle button is
   * activated. Hosts wire this to their state so the next render updates
   * `row.expanded`. The primitive itself never toggles state.
   */
  onToggleRow?: (rowKey: string, nextExpanded: boolean) => void;
}

/**
 * Renders a wizard reconciliation plan (a.k.a. wizard diff list). Hosts
 * compute the plan; FaceTheory only displays it.
 *
 * Accessibility contract:
 * - The toggle is a real `<button type="button">`.
 * - The button carries `aria-expanded`, `aria-controls`, and a deterministic
 *   `data-row-expanded` attribute so SSR output and hydrated DOM match.
 * - The detail panel uses an `id` matching `aria-controls` and is hidden via
 *   the standard `hidden` attribute when not expanded.
 * - The status badge label is text (color-independent) so screen-readers and
 *   high-contrast viewers see the same information.
 */
export function WizardReconciliationPlanPanel(
  props: WizardReconciliationPlanPanelProps,
): React.ReactElement {
  const {
    title = 'Reconciliation plan',
    description,
    plan,
    emptyLabel = 'No plan rows.',
    onToggleRow,
  } = props;

  return h(
    'section',
    {
      className: 'facetheory-stitch-wizard-reconciliation-plan',
      'data-safety-policy': plan.safetyPolicy,
      'data-row-count': String(plan.rows.length),
      'data-conflict-count': String(plan.totals.conflict),
      'data-blocked-count': String(plan.totals.blocked),
      'data-external-count': String(plan.totals.external),
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '20px',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
        color: 'var(--stitch-color-on-surface, #131b2e)',
      },
    },
    h(
      'header',
      {
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        },
      },
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
        h('h2', { style: { margin: 0, fontSize: '16px' } }, title),
        description !== undefined
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
              description,
            )
          : null,
      ),
      renderCounts(plan.totals),
    ),
    plan.rows.length > 0
      ? h(
          'ul',
          {
            role: 'list',
            style: {
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            },
          },
          plan.rows.map((row) => renderRow(row, onToggleRow)),
        )
      : h(
          'div',
          {
            className: 'facetheory-stitch-wizard-reconciliation-plan-empty',
            role: 'status',
            style: {
              padding: '14px',
              borderRadius: 'var(--stitch-radius-md, 10px)',
              background: 'var(--stitch-color-surface-container, #eaedff)',
              color: 'var(--stitch-color-on-surface-variant, #464553)',
              fontSize: '14px',
            },
          },
          emptyLabel,
        ),
    renderSafetyFootnote(plan.safetyPolicy),
  );
}

/** DiffList alias for callers who prefer the diff-list framing. */
export const WizardDiffListPanel = WizardReconciliationPlanPanel;
export type WizardDiffListPanelProps = WizardReconciliationPlanPanelProps;

function renderCounts(
  totals: Record<WizardReconciliationPlanCanonicalKind, number>,
): React.ReactElement {
  return h(
    'div',
    {
      className: 'facetheory-stitch-wizard-reconciliation-plan-counts',
      style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    },
    CANONICAL_KINDS.map((kind) => {
      const palette = KIND_PALETTE[kind];
      return h(
        'span',
        {
          key: kind,
          className: `facetheory-stitch-wizard-reconciliation-plan-count facetheory-stitch-wizard-reconciliation-plan-count-${kind}`,
          'data-kind-summary': kind,
          'data-kind-count': String(totals[kind]),
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 10px',
            borderRadius: '9999px',
            background: palette.background,
            color: palette.color,
            fontSize: '12px',
            fontWeight: 600,
            lineHeight: 1.4,
          },
        },
        `${palette.label}: ${totals[kind]}`,
      );
    }),
  );
}

function renderRow(
  row: WizardReconciliationPlanRow,
  onToggleRow: WizardReconciliationPlanPanelProps['onToggleRow'],
): React.ReactElement {
  const canonical = canonicalizeWizardReconciliationPlanKind(row.kind);
  const palette = KIND_PALETTE[canonical];
  const statusLabel = row.statusLabel ?? palette.label;
  const expanded = row.expanded === true;
  const detailPanelId = `facetheory-wizard-plan-row-${row.key}-details`;
  const hasDetails = Array.isArray(row.details) && row.details.length > 0;
  const ariaRole = palette.prominent ? 'alert' : 'listitem';

  return h(
    'li',
    {
      key: row.key,
      className: `facetheory-stitch-wizard-reconciliation-plan-row facetheory-stitch-wizard-reconciliation-plan-row-${canonical}${palette.prominent ? ' facetheory-stitch-wizard-reconciliation-plan-row-prominent' : ''}${row.redacted ? ' facetheory-stitch-wizard-reconciliation-plan-row-redacted' : ''}`,
      'data-row-key': row.key,
      'data-row-kind': canonical,
      'data-row-kind-input': row.kind,
      'data-row-prominent': palette.prominent ? 'true' : 'false',
      'data-row-expanded': expanded ? 'true' : 'false',
      'data-row-redacted': row.redacted ? 'true' : 'false',
      role: ariaRole,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        borderRadius: 'var(--stitch-radius-md, 10px)',
        background: 'var(--stitch-color-surface-container, #eaedff)',
        border: `1px solid ${palette.border}`,
        ...(palette.prominent ? { boxShadow: `inset 0 0 0 1px ${palette.color}` } : null),
      },
    },
    h(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: '12px',
        },
      },
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 } },
        h('strong', { style: { fontSize: '14px' } }, row.label as React.ReactNode),
        row.summary !== undefined
          ? h(
              'span',
              {
                className: 'facetheory-stitch-wizard-reconciliation-plan-row-summary',
                style: {
                  fontSize: '13px',
                  lineHeight: 1.5,
                  color: 'var(--stitch-color-on-surface-variant, #464553)',
                  overflowWrap: 'anywhere',
                },
              },
              row.summary as React.ReactNode,
            )
          : null,
      ),
      h(
        'span',
        {
          className: `facetheory-stitch-wizard-reconciliation-plan-row-status facetheory-stitch-wizard-reconciliation-plan-row-status-${canonical}`,
          'data-status-chip': canonical,
          'aria-label': `Status: ${statusLabel}`,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 10px',
            borderRadius: '9999px',
            background: palette.background,
            color: palette.color,
            fontSize: '12px',
            fontWeight: 600,
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
          },
        },
        statusLabel,
      ),
    ),
    row.reason !== undefined
      ? h(
          'p',
          {
            className: `facetheory-stitch-wizard-reconciliation-plan-row-reason facetheory-stitch-wizard-reconciliation-plan-row-reason-${canonical}`,
            style: {
              margin: 0,
              fontSize: '13px',
              lineHeight: 1.5,
              color: palette.prominent ? palette.color : 'var(--stitch-color-on-surface-variant, #464553)',
              fontWeight: palette.prominent ? 600 : 400,
            },
          },
          row.reason,
        )
      : null,
    row.metadata !== undefined
      ? h(MetadataBadgeGroup, { metadata: row.metadata })
      : null,
    hasDetails ? renderToggle(row, detailPanelId, expanded, statusLabel, onToggleRow) : null,
    hasDetails ? renderDetailPanel(row, detailPanelId, expanded) : null,
  );
}

function renderToggle(
  row: WizardReconciliationPlanRow,
  detailPanelId: string,
  expanded: boolean,
  statusLabel: string,
  onToggleRow: WizardReconciliationPlanPanelProps['onToggleRow'],
): React.ReactElement {
  return h(
    'button',
    {
      type: 'button',
      className: 'facetheory-stitch-wizard-reconciliation-plan-row-toggle',
      'aria-expanded': expanded ? 'true' : 'false',
      'aria-controls': detailPanelId,
      'aria-label': `${expanded ? 'Hide' : 'Show'} details for ${statusLabel}`,
      'data-row-toggle-key': row.key,
      onClick: onToggleRow !== undefined
        ? () => onToggleRow(row.key, !expanded)
        : undefined,
      style: {
        alignSelf: 'flex-start',
        appearance: 'none',
        background: 'transparent',
        border: '1px solid var(--stitch-color-outline-variant, #c6c5d0)',
        color: 'var(--stitch-color-on-surface, #131b2e)',
        borderRadius: 'var(--stitch-radius-sm, 8px)',
        padding: '4px 10px',
        fontSize: '12px',
        fontWeight: 600,
        cursor: onToggleRow !== undefined ? 'pointer' : 'default',
      },
    },
    expanded ? 'Hide details' : 'Show details',
  );
}

function renderDetailPanel(
  row: WizardReconciliationPlanRow,
  detailPanelId: string,
  expanded: boolean,
): React.ReactElement {
  return h(
    'div',
    {
      id: detailPanelId,
      className: 'facetheory-stitch-wizard-reconciliation-plan-row-details',
      role: 'region',
      hidden: !expanded,
      'aria-hidden': expanded ? 'false' : 'true',
      style: {
        display: expanded ? 'flex' : 'none',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px 12px',
        borderRadius: 'var(--stitch-radius-md, 10px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
      },
    },
    expanded
      ? h(
          'dl',
          {
            style: {
              margin: 0,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
              gap: '6px 12px',
              fontSize: '13px',
            },
          },
          (row.details ?? []).map((detail) => renderDetail(detail, row.redacted === true)),
        )
      : null,
  );
}

function renderDetail(
  detail: WizardReconciliationPlanDetail,
  rowRedacted: boolean,
): React.ReactElement {
  const redacted = detail.redacted === true || rowRedacted;
  return h(
    React.Fragment,
    { key: detail.key },
    h(
      'dt',
      {
        style: {
          margin: 0,
          fontWeight: 600,
          color: 'var(--stitch-color-on-surface-variant, #464553)',
          overflowWrap: 'anywhere',
        },
        'data-detail-key': detail.key,
      },
      detail.label as React.ReactNode,
    ),
    h(
      'dd',
      {
        style: {
          margin: 0,
          color: 'var(--stitch-color-on-surface, #131b2e)',
          overflowWrap: 'anywhere',
          fontFamily: redacted
            ? 'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)'
            : 'inherit',
        },
        'data-detail-redacted': redacted ? 'true' : 'false',
      },
      redacted ? REDACTED_MARKER : (detail.value as React.ReactNode) ?? '',
    ),
  );
}

function renderSafetyFootnote(policy: WizardSafetyPolicy): React.ReactElement {
  return h(
    'p',
    {
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
