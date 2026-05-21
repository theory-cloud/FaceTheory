/**
 * Vue parity for `WizardReconciliationPlanPanel` (alias `WizardDiffListPanel`).
 * Mirrors the React adapter's class names, data-* attributes, ARIA wiring,
 * role markers, and safety-policy footnote.
 */

import { defineComponent, h } from 'vue';
import type { PropType, VNodeChild } from 'vue';

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
import { canonicalizeWizardReconciliationPlanKind } from '../../stitch-admin/wizard-reconciliation-plan-types.js';
import type { WizardSafetyPolicy } from '../../stitch-admin/wizard-types.js';
import { renderPropContent, vnodeChildProp } from '../stitch-common.js';

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

const KIND_LABEL: Record<WizardReconciliationPlanCanonicalKind, string> = {
  create: 'Will create',
  update: 'Will update',
  satisfied: 'Already satisfied',
  conflict: 'Conflict',
  blocked: 'Blocked',
  external: 'External step required',
  noop: 'No-op',
};

const PROMINENT: Record<WizardReconciliationPlanCanonicalKind, boolean> = {
  create: false,
  update: false,
  satisfied: false,
  conflict: true,
  blocked: true,
  external: true,
  noop: false,
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
  title?: VNodeChild;
  description?: VNodeChild;
  plan: WizardReconciliationPlan;
  emptyLabel?: VNodeChild;
  onToggleRow?: (rowKey: string, nextExpanded: boolean) => void;
}

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

function renderCounts(
  totals: Record<WizardReconciliationPlanCanonicalKind, number>,
): VNodeChild {
  return h(
    'div',
    {
      class: 'facetheory-stitch-wizard-reconciliation-plan-counts',
    },
    CANONICAL_KINDS.map((kind) =>
      h(
        'span',
        {
          key: kind,
          class: `facetheory-stitch-wizard-reconciliation-plan-count facetheory-stitch-wizard-reconciliation-plan-count-${kind}`,
          'data-kind-summary': kind,
          'data-kind-count': String(totals[kind]),
        },
        `${KIND_LABEL[kind]}: ${totals[kind]}`,
      ),
    ),
  );
}

function renderDetail(
  detail: WizardReconciliationPlanDetail,
  rowRedacted: boolean,
): VNodeChild {
  const redacted = detail.redacted === true || rowRedacted;
  return h(
    'div',
    {
      key: detail.key,
      class: 'facetheory-stitch-wizard-reconciliation-plan-detail',
    },
    [
      h(
        'dt',
        {
          'data-detail-key': detail.key,
        },
        renderPropContent(detail.label as VNodeChild),
      ),
      h(
        'dd',
        {
          'data-detail-redacted': redacted ? 'true' : 'false',
        },
        redacted
          ? REDACTED_MARKER
          : renderPropContent((detail.value ?? '') as VNodeChild),
      ),
    ],
  );
}

function renderToggle(
  row: WizardReconciliationPlanRow,
  detailPanelId: string,
  expanded: boolean,
  statusLabel: string,
  onToggleRow: WizardReconciliationPlanPanelProps['onToggleRow'],
): VNodeChild {
  return h(
    'button',
    {
      type: 'button',
      class: 'facetheory-stitch-wizard-reconciliation-plan-row-toggle',
      'aria-expanded': expanded ? 'true' : 'false',
      'aria-controls': detailPanelId,
      'aria-label': `${expanded ? 'Hide' : 'Show'} details for ${statusLabel}`,
      'data-row-toggle-key': row.key,
      onClick: onToggleRow !== undefined
        ? () => onToggleRow(row.key, !expanded)
        : undefined,
    },
    expanded ? 'Hide details' : 'Show details',
  );
}

function renderDetailPanel(
  row: WizardReconciliationPlanRow,
  detailPanelId: string,
  expanded: boolean,
): VNodeChild {
  const props: Record<string, unknown> = {
    id: detailPanelId,
    class: 'facetheory-stitch-wizard-reconciliation-plan-row-details',
    role: 'region',
    'aria-hidden': expanded ? 'false' : 'true',
  };
  if (!expanded) props.hidden = true;
  return h(
    'div',
    props,
    expanded
      ? [
          h(
            'dl',
            { class: 'facetheory-stitch-wizard-reconciliation-plan-detail-list' },
            (row.details ?? []).map((detail) => renderDetail(detail, row.redacted === true)),
          ),
        ]
      : [],
  );
}

function renderRow(
  row: WizardReconciliationPlanRow,
  onToggleRow: WizardReconciliationPlanPanelProps['onToggleRow'],
): VNodeChild {
  const canonical = canonicalizeWizardReconciliationPlanKind(row.kind);
  const prominent = PROMINENT[canonical];
  const statusLabel = row.statusLabel ?? KIND_LABEL[canonical];
  const expanded = row.expanded === true;
  const detailPanelId = `facetheory-wizard-plan-row-${row.key}-details`;
  const hasDetails = Array.isArray(row.details) && row.details.length > 0;
  const ariaRole = prominent ? 'alert' : 'listitem';
  return h(
    'li',
    {
      key: row.key,
      class: `facetheory-stitch-wizard-reconciliation-plan-row facetheory-stitch-wizard-reconciliation-plan-row-${canonical}${prominent ? ' facetheory-stitch-wizard-reconciliation-plan-row-prominent' : ''}${row.redacted ? ' facetheory-stitch-wizard-reconciliation-plan-row-redacted' : ''}`,
      'data-row-key': row.key,
      'data-row-kind': canonical,
      'data-row-kind-input': row.kind,
      'data-row-prominent': prominent ? 'true' : 'false',
      'data-row-expanded': expanded ? 'true' : 'false',
      'data-row-redacted': row.redacted ? 'true' : 'false',
      role: ariaRole,
    },
    [
      h('div', null, [
        h('div', null, [
          h('strong', null, renderPropContent(row.label as VNodeChild)),
          row.summary !== undefined
            ? h(
                'span',
                {
                  class: 'facetheory-stitch-wizard-reconciliation-plan-row-summary',
                },
                renderPropContent(row.summary as VNodeChild),
              )
            : null,
        ]),
        h(
          'span',
          {
            class: `facetheory-stitch-wizard-reconciliation-plan-row-status facetheory-stitch-wizard-reconciliation-plan-row-status-${canonical}`,
            'data-status-chip': canonical,
            'aria-label': `Status: ${statusLabel}`,
          },
          statusLabel,
        ),
      ]),
      row.reason !== undefined
        ? h(
            'p',
            {
              class: `facetheory-stitch-wizard-reconciliation-plan-row-reason facetheory-stitch-wizard-reconciliation-plan-row-reason-${canonical}`,
            },
            row.reason,
          )
        : null,
      hasDetails ? renderToggle(row, detailPanelId, expanded, statusLabel, onToggleRow) : null,
      hasDetails ? renderDetailPanel(row, detailPanelId, expanded) : null,
    ],
  );
}

export const WizardReconciliationPlanPanel = defineComponent({
  name: 'FaceTheoryVueWizardReconciliationPlanPanel',
  props: {
    title: vnodeChildProp,
    description: vnodeChildProp,
    plan: { type: Object as PropType<WizardReconciliationPlan>, required: true },
    emptyLabel: vnodeChildProp,
    onToggleRow: {
      type: Function as PropType<(rowKey: string, nextExpanded: boolean) => void>,
      required: false,
    },
  },
  setup(props) {
    return () => {
      const plan = props.plan;
      const title =
        props.title !== undefined
          ? renderPropContent(props.title)
          : ['Reconciliation plan'];
      return h(
        'section',
        {
          class: 'facetheory-stitch-wizard-reconciliation-plan',
          'data-safety-policy': plan.safetyPolicy,
          'data-row-count': String(plan.rows.length),
          'data-conflict-count': String(plan.totals.conflict),
          'data-blocked-count': String(plan.totals.blocked),
          'data-external-count': String(plan.totals.external),
        },
        [
          h('header', null, [
            h('div', null, [
              h('h2', null, title),
              props.description !== undefined
                ? h('p', null, renderPropContent(props.description))
                : null,
            ]),
            renderCounts(plan.totals),
          ]),
          plan.rows.length > 0
            ? h(
                'ul',
                { role: 'list' },
                plan.rows.map((row) => renderRow(row, props.onToggleRow)),
              )
            : h(
                'div',
                {
                  class: 'facetheory-stitch-wizard-reconciliation-plan-empty',
                  role: 'status',
                },
                props.emptyLabel !== undefined
                  ? renderPropContent(props.emptyLabel)
                  : 'No plan rows.',
              ),
          renderSafetyFootnote(plan.safetyPolicy),
        ],
      );
    };
  },
});

export const WizardDiffListPanel = WizardReconciliationPlanPanel;
export type WizardDiffListPanelProps = WizardReconciliationPlanPanelProps;
