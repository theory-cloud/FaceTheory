/**
 * Vue parity backfill for the THE-1458 wizard primitive family. Mirrors the
 * React adapter's class names, data-* attributes, ARIA wiring, role markers,
 * and safety-policy footnote so consumers driving Vue SSR see the same
 * testable contract as React consumers.
 *
 * Trust boundary, determinism, and "no hidden state" rules are inherited
 * from the React adapter — these renderers display host-supplied data only,
 * never compute freshness or randomness during render, and never resolve
 * authority/route/email/secret state.
 */

import { defineComponent, h } from 'vue';
import type { PropType, VNodeChild } from 'vue';

import type {
  WizardCapability,
  WizardCapabilityIntent,
  WizardCapabilityReview,
  WizardCapabilitySensitivity,
  WizardEmptyStateConfig,
  WizardEnablementChecklist,
  WizardEnablementItem,
  WizardEnablementItemStatus,
  WizardFinding,
  WizardFindingList,
  WizardFindingSeverity,
  WizardPackageFile,
  WizardPackageSummary,
  WizardProgressState,
  WizardReconcileEntry,
  WizardReconcileSummary,
  WizardRecoveryState,
  WizardRecoveryStatus,
  WizardSafetyPolicy,
  WizardStep,
  WizardStepStatus,
} from '../../stitch-admin/wizard-types.js';
import type { OperatorEmptyStateIntent } from '../../stitch-admin/operator-visibility-types.js';
import { renderPropContent, vnodeChildProp } from '../stitch-common.js';
import { MetadataBadgeGroup } from './operator-notices.js';

const REDACTED_MARKER = '[redacted]';

export type {
  WizardCapability,
  WizardCapabilityIntent,
  WizardCapabilityReview,
  WizardCapabilitySensitivity,
  WizardEmptyStateConfig,
  WizardEnablementChecklist,
  WizardEnablementItem,
  WizardEnablementItemStatus,
  WizardFinding,
  WizardFindingList,
  WizardFindingSeverity,
  WizardPackageFile,
  WizardPackageSummary,
  WizardProgressState,
  WizardReconcileEntry,
  WizardReconcileSummary,
  WizardRecoveryState,
  WizardRecoveryStatus,
  WizardSafetyPolicy,
  WizardStep,
  WizardStepStatus,
};

/* -------------------------------------------------------------------------- */
/* Shared status labels                                                       */
/* -------------------------------------------------------------------------- */

const STEP_LABEL: Record<WizardStepStatus, string> = {
  pending: 'Pending',
  'in-progress': 'In progress',
  complete: 'Complete',
  blocked: 'Blocked',
  skipped: 'Skipped',
};

const SEVERITY_LABEL: Record<WizardFindingSeverity, string> = {
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
  blocker: 'Blocker',
};

const KIND_LABEL: Record<WizardReconcileEntry['kind'], string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
  unchanged: 'Unchanged',
  redacted: 'Redacted',
};

const INTENT_LABEL: Record<WizardCapabilityIntent, string> = {
  requested: 'Requested',
  granted: 'Granted',
  denied: 'Denied',
};

const ENABLEMENT_LABEL: Record<WizardEnablementItemStatus, string> = {
  ready: 'Ready',
  attention: 'Needs attention',
  blocked: 'Blocked',
  'not-applicable': 'Not applicable',
};

const RECOVERY_LABEL: Record<WizardRecoveryState, string> = {
  fresh: 'Fresh session',
  resumable: 'Resumable',
  expired: 'Expired',
  failed: 'Failed',
  unknown: 'Recovery unknown',
};

const EMPTY_INTENT_LABEL: Record<OperatorEmptyStateIntent, string> = {
  'no-data': 'No data',
  'not-authorized': 'Not authorized',
  'not-configured': 'Not configured',
  'filtered-empty': 'No matching results',
  loading: 'Loading',
  error: 'Unavailable',
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

function renderChip(
  className: string,
  dataAttrs: Record<string, string>,
  label: VNodeChild,
  key?: string,
): VNodeChild {
  const props: Record<string, unknown> = { class: className, ...dataAttrs };
  if (key !== undefined) props.key = key;
  return h('span', props, label as unknown as string);
}

/* -------------------------------------------------------------------------- */
/* WizardProgress                                                             */
/* -------------------------------------------------------------------------- */

export const WizardProgress = defineComponent({
  name: 'FaceTheoryVueWizardProgress',
  props: {
    title: vnodeChildProp,
    description: vnodeChildProp,
    state: { type: Object as PropType<WizardProgressState>, required: true },
  },
  setup(props) {
    return () => {
      const state = props.state;
      const totalCount = state.steps.length;
      const completedCount = state.steps.filter((s) => s.status === 'complete').length;
      const progressLabel = state.progressLabel ?? `${completedCount} of ${totalCount} complete`;
      const title = props.title !== undefined
        ? renderPropContent(props.title)
        : ['Wizard progress'];

      return h(
        'section',
        {
          class: 'facetheory-stitch-wizard-progress',
          'data-step-count': String(totalCount),
          'data-completed-count': String(completedCount),
        },
        [
          h('header', null, [
            h('div', null, [
              h('h2', null, title),
              props.description !== undefined
                ? h('p', null, renderPropContent(props.description))
                : null,
            ]),
            h(
              'span',
              { class: 'facetheory-stitch-wizard-progress-label' },
              progressLabel,
            ),
          ]),
          h(
            'ol',
            { role: 'list' },
            state.steps.map((step, index) => renderStep(step, index, state.currentStepKey)),
          ),
        ],
      );
    };
  },
});

function renderStep(
  step: WizardStep,
  index: number,
  currentStepKey?: string,
): VNodeChild {
  const isActive =
    step.active === true ||
    (currentStepKey !== undefined && currentStepKey === step.key);
  const statusLabel = STEP_LABEL[step.status];
  return h(
    'li',
    {
      key: step.key,
      class: `facetheory-stitch-wizard-step facetheory-stitch-wizard-step-${step.status}${isActive ? ' facetheory-stitch-wizard-step-active' : ''}`,
      'data-step-key': step.key,
      'data-step-status': step.status,
      'data-step-active': isActive ? 'true' : 'false',
    },
    [
      h('div', null, [
        h('span', null, `Step ${index + 1}`),
        renderChip(
          `facetheory-stitch-wizard-step-status facetheory-stitch-wizard-step-status-${step.status}`,
          { 'data-status-chip': step.status },
          statusLabel,
        ),
      ]),
      h('strong', null, renderPropContent(step.label as VNodeChild)),
      step.description !== undefined
        ? h('p', null, renderPropContent(step.description as VNodeChild))
        : null,
      step.hint !== undefined
        ? h(
            'span',
            { class: 'facetheory-stitch-wizard-step-hint' },
            renderPropContent(step.hint as VNodeChild),
          )
        : null,
    ],
  );
}

/* -------------------------------------------------------------------------- */
/* WizardPackageSummaryPanel                                                  */
/* -------------------------------------------------------------------------- */

export const WizardPackageSummaryPanel = defineComponent({
  name: 'FaceTheoryVueWizardPackageSummaryPanel',
  props: {
    title: vnodeChildProp,
    summary: { type: Object as PropType<WizardPackageSummary>, required: true },
    emptyLabel: vnodeChildProp,
  },
  setup(props) {
    return () => {
      const summary = props.summary;
      const title = props.title !== undefined
        ? renderPropContent(props.title)
        : [summary.name];
      return h(
        'section',
        {
          class: 'facetheory-stitch-wizard-package-summary',
          'data-package-name': summary.name,
          'data-package-version': summary.version,
          'data-safety-policy': summary.safetyPolicy,
          'data-file-count': String(summary.totals.fileCount),
        },
        [
          h('header', null, [
            h('div', null, [
              h('h2', null, title),
              summary.version !== undefined
                ? h(
                    'span',
                    {
                      class: 'facetheory-stitch-wizard-package-summary-version',
                    },
                    `Version ${summary.version}`,
                  )
                : null,
              summary.description !== undefined
                ? h('p', null, renderPropContent(summary.description as VNodeChild))
                : null,
            ]),
            h('dl', { class: 'facetheory-stitch-wizard-package-summary-totals' }, [
              h('div', null, [h('dt', null, 'Files'), h('dd', null, String(summary.totals.fileCount))]),
              summary.totals.byteCount !== undefined
                ? h('div', null, [
                    h('dt', null, 'Bytes'),
                    h('dd', null, String(summary.totals.byteCount)),
                  ])
                : null,
            ]),
          ]),
          summary.metadata !== undefined
            ? h(MetadataBadgeGroup, { metadata: summary.metadata })
            : null,
          summary.files.length > 0
            ? h(
                'ul',
                { role: 'list' },
                summary.files.map((file) => renderPackageFile(file)),
              )
            : h(
                'div',
                {
                  class: 'facetheory-stitch-wizard-package-summary-empty',
                  role: 'status',
                },
                props.emptyLabel !== undefined
                  ? renderPropContent(props.emptyLabel)
                  : 'No files in this package.',
              ),
          renderSafetyFootnote(summary.safetyPolicy),
        ],
      );
    };
  },
});

function renderPackageFile(file: WizardPackageFile): VNodeChild {
  return h(
    'li',
    {
      key: file.key,
      class: 'facetheory-stitch-wizard-package-summary-file',
      'data-file-role': file.role,
    },
    [
      h('div', null, [
        h('code', null, file.path),
        file.note !== undefined ? h('span', null, file.note) : null,
      ]),
      h('div', null, [
        file.role !== undefined ? h('span', null, file.role) : null,
        file.mediaType !== undefined ? h('span', null, file.mediaType) : null,
        file.sizeBytes !== undefined ? h('span', null, `${file.sizeBytes} B`) : null,
        file.sha256 !== undefined ? h('code', null, file.sha256) : null,
      ]),
    ],
  );
}

/* -------------------------------------------------------------------------- */
/* WizardFindingListPanel                                                     */
/* -------------------------------------------------------------------------- */

export const WizardFindingListPanel = defineComponent({
  name: 'FaceTheoryVueWizardFindingListPanel',
  props: {
    title: vnodeChildProp,
    description: vnodeChildProp,
    list: { type: Object as PropType<WizardFindingList>, required: true },
    emptyLabel: vnodeChildProp,
  },
  setup(props) {
    return () => {
      const list = props.list;
      const counts = countFindings(list.findings);
      const title = props.title !== undefined
        ? renderPropContent(props.title)
        : ['Validation findings'];
      return h(
        'section',
        {
          class: 'facetheory-stitch-wizard-finding-list',
          'data-safety-policy': list.safetyPolicy,
          'data-finding-count': String(list.findings.length),
        },
        [
          h('header', null, [
            h('div', null, [
              h('h2', null, title),
              props.description !== undefined
                ? h('p', null, renderPropContent(props.description))
                : null,
            ]),
            h(
              'div',
              { class: 'facetheory-stitch-wizard-finding-counts' },
              (Object.keys(SEVERITY_LABEL) as WizardFindingSeverity[]).map((severity) =>
                renderChip(
                  `facetheory-stitch-wizard-finding-count facetheory-stitch-wizard-finding-count-${severity}`,
                  { 'data-severity-summary': severity },
                  `${SEVERITY_LABEL[severity]}: ${counts[severity]}`,
                  severity,
                ),
              ),
            ),
          ]),
          list.findings.length > 0
            ? h(
                'ul',
                { role: 'list' },
                list.findings.map((finding) => renderFinding(finding)),
              )
            : h(
                'div',
                {
                  class: 'facetheory-stitch-wizard-finding-list-empty',
                  role: 'status',
                },
                props.emptyLabel !== undefined
                  ? renderPropContent(props.emptyLabel)
                  : 'No findings reported.',
              ),
          renderSafetyFootnote(list.safetyPolicy),
        ],
      );
    };
  },
});

function countFindings(findings: WizardFinding[]): Record<WizardFindingSeverity, number> {
  return findings.reduce<Record<WizardFindingSeverity, number>>(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { info: 0, warning: 0, error: 0, blocker: 0 },
  );
}

function renderFinding(finding: WizardFinding): VNodeChild {
  return h(
    'li',
    {
      key: finding.id,
      class: `facetheory-stitch-wizard-finding facetheory-stitch-wizard-finding-${finding.severity}`,
      'data-finding-id': finding.id,
      'data-finding-severity': finding.severity,
    },
    [
      h('div', null, [
        renderChip(
          `facetheory-stitch-wizard-finding-severity facetheory-stitch-wizard-finding-severity-${finding.severity}`,
          { 'data-severity-chip': finding.severity },
          SEVERITY_LABEL[finding.severity],
        ),
        finding.source !== undefined ? h('span', null, finding.source) : null,
      ]),
      h('strong', null, renderPropContent(finding.title as VNodeChild)),
      finding.description !== undefined
        ? h('p', null, renderPropContent(finding.description as VNodeChild))
        : null,
      finding.evidence !== undefined
        ? h(
            'code',
            { class: 'facetheory-stitch-wizard-finding-evidence' },
            finding.evidence,
          )
        : null,
      finding.metadata !== undefined
        ? h(MetadataBadgeGroup, { metadata: finding.metadata })
        : null,
    ],
  );
}

/* -------------------------------------------------------------------------- */
/* WizardReconcileSummaryPanel                                                */
/* -------------------------------------------------------------------------- */

export const WizardReconcileSummaryPanel = defineComponent({
  name: 'FaceTheoryVueWizardReconcileSummaryPanel',
  props: {
    title: vnodeChildProp,
    description: vnodeChildProp,
    summary: { type: Object as PropType<WizardReconcileSummary>, required: true },
    emptyLabel: vnodeChildProp,
  },
  setup(props) {
    return () => {
      const summary = props.summary;
      const title = props.title !== undefined
        ? renderPropContent(props.title)
        : ['Reconcile summary'];
      return h(
        'section',
        {
          class: 'facetheory-stitch-wizard-reconcile-summary',
          'data-safety-policy': summary.safetyPolicy,
          'data-entry-count': String(summary.entries.length),
        },
        [
          h('header', null, [
            h('div', null, [
              h('h2', null, title),
              props.description !== undefined
                ? h('p', null, renderPropContent(props.description))
                : null,
            ]),
            h(
              'div',
              { class: 'facetheory-stitch-wizard-reconcile-counts' },
              (Object.keys(KIND_LABEL) as WizardReconcileEntry['kind'][]).map((kind) =>
                renderChip(
                  `facetheory-stitch-wizard-reconcile-count facetheory-stitch-wizard-reconcile-count-${kind}`,
                  { 'data-kind-summary': kind },
                  `${KIND_LABEL[kind]}: ${summary.totals[kind]}`,
                  kind,
                ),
              ),
            ),
          ]),
          summary.entries.length > 0
            ? h(
                'ul',
                { role: 'list' },
                summary.entries.map((entry) => renderReconcileEntry(entry)),
              )
            : h(
                'div',
                {
                  class: 'facetheory-stitch-wizard-reconcile-summary-empty',
                  role: 'status',
                },
                props.emptyLabel !== undefined
                  ? renderPropContent(props.emptyLabel)
                  : 'Nothing to reconcile.',
              ),
          renderSafetyFootnote(summary.safetyPolicy),
        ],
      );
    };
  },
});

function renderReconcileEntry(entry: WizardReconcileEntry): VNodeChild {
  const isRedacted = entry.redacted === true || entry.kind === 'redacted';
  return h(
    'li',
    {
      key: entry.key,
      class: `facetheory-stitch-wizard-reconcile-entry facetheory-stitch-wizard-reconcile-entry-${entry.kind}${isRedacted ? ' facetheory-stitch-wizard-reconcile-entry-redacted' : ''}`,
      'data-entry-key': entry.key,
      'data-entry-kind': entry.kind,
      'data-entry-redacted': isRedacted ? 'true' : 'false',
    },
    [
      h('div', null, [
        h('strong', null, renderPropContent(entry.label as VNodeChild)),
        isRedacted
          ? h(
              'span',
              { class: 'facetheory-stitch-wizard-reconcile-entry-redaction' },
              REDACTED_MARKER,
            )
          : entry.detail !== undefined
            ? h('span', null, renderPropContent(entry.detail as VNodeChild))
            : null,
      ]),
      renderChip(
        `facetheory-stitch-wizard-reconcile-entry-kind facetheory-stitch-wizard-reconcile-entry-kind-${entry.kind}`,
        { 'data-kind-chip': entry.kind },
        KIND_LABEL[entry.kind],
      ),
    ],
  );
}

/* -------------------------------------------------------------------------- */
/* WizardCapabilityReviewPanel                                                */
/* -------------------------------------------------------------------------- */

export const WizardCapabilityReviewPanel = defineComponent({
  name: 'FaceTheoryVueWizardCapabilityReviewPanel',
  props: {
    title: vnodeChildProp,
    description: vnodeChildProp,
    review: { type: Object as PropType<WizardCapabilityReview>, required: true },
    emptyLabel: vnodeChildProp,
  },
  setup(props) {
    return () => {
      const review = props.review;
      const title = props.title !== undefined
        ? renderPropContent(props.title)
        : ['Capability review'];
      return h(
        'section',
        {
          class: 'facetheory-stitch-wizard-capability-review',
          'data-safety-policy': review.safetyPolicy,
          'data-capability-count': String(review.capabilities.length),
        },
        [
          h('header', null, [
            h('h2', null, title),
            props.description !== undefined
              ? h('p', null, renderPropContent(props.description))
              : null,
          ]),
          review.capabilities.length > 0
            ? h(
                'ul',
                { role: 'list' },
                review.capabilities.map((capability) => renderCapability(capability)),
              )
            : h(
                'div',
                {
                  class: 'facetheory-stitch-wizard-capability-review-empty',
                  role: 'status',
                },
                props.emptyLabel !== undefined
                  ? renderPropContent(props.emptyLabel)
                  : 'No capabilities to review.',
              ),
          renderSafetyFootnote(review.safetyPolicy),
        ],
      );
    };
  },
});

function renderCapability(capability: WizardCapability): VNodeChild {
  const isRedacted = capability.sensitivity === 'redacted';
  const isSensitive = capability.sensitivity === 'sensitive';
  return h(
    'li',
    {
      key: capability.key,
      class: `facetheory-stitch-wizard-capability facetheory-stitch-wizard-capability-${capability.intent} facetheory-stitch-wizard-capability-sensitivity-${capability.sensitivity}`,
      'data-capability-key': capability.key,
      'data-capability-intent': capability.intent,
      'data-capability-sensitivity': capability.sensitivity,
    },
    [
      h('div', null, [
        h('strong', null, renderPropContent(capability.label as VNodeChild)),
        !isRedacted && capability.description !== undefined
          ? h('p', null, renderPropContent(capability.description as VNodeChild))
          : null,
        isRedacted
          ? h(
              'span',
              { class: 'facetheory-stitch-wizard-capability-redaction' },
              REDACTED_MARKER,
            )
          : isSensitive
            ? h(
                'span',
                { class: 'facetheory-stitch-wizard-capability-sensitive' },
                'Detail suppressed (sensitive).',
              )
            : capability.detail !== undefined
              ? h('span', null, renderPropContent(capability.detail as VNodeChild))
              : null,
      ]),
      renderChip(
        `facetheory-stitch-wizard-capability-intent facetheory-stitch-wizard-capability-intent-${capability.intent}`,
        { 'data-intent-chip': capability.intent },
        INTENT_LABEL[capability.intent],
      ),
    ],
  );
}

/* -------------------------------------------------------------------------- */
/* WizardEnablementChecklistPanel                                             */
/* -------------------------------------------------------------------------- */

export const WizardEnablementChecklistPanel = defineComponent({
  name: 'FaceTheoryVueWizardEnablementChecklistPanel',
  props: {
    title: vnodeChildProp,
    description: vnodeChildProp,
    checklist: { type: Object as PropType<WizardEnablementChecklist>, required: true },
    emptyLabel: vnodeChildProp,
  },
  setup(props) {
    return () => {
      const checklist = props.checklist;
      const title = props.title !== undefined
        ? renderPropContent(props.title)
        : ['Enablement checklist'];
      const summary =
        checklist.summaryLabel ??
        (checklist.items.length > 0
          ? `${checklist.items.filter((i) => i.status === 'ready').length} of ${checklist.items.length} ready`
          : 'No checklist items');
      const allReady =
        checklist.allReady === true ? 'true' : checklist.allReady === false ? 'false' : 'unknown';
      return h(
        'section',
        {
          class: 'facetheory-stitch-wizard-enablement-checklist',
          'data-all-ready': allReady,
          'data-item-count': String(checklist.items.length),
        },
        [
          h('header', null, [
            h('div', null, [
              h('h2', null, title),
              props.description !== undefined
                ? h('p', null, renderPropContent(props.description))
                : null,
            ]),
            h(
              'span',
              {
                class: 'facetheory-stitch-wizard-enablement-checklist-summary',
              },
              summary,
            ),
          ]),
          checklist.items.length > 0
            ? h(
                'ul',
                { role: 'list' },
                checklist.items.map((item) => renderEnablementItem(item)),
              )
            : h(
                'div',
                {
                  class: 'facetheory-stitch-wizard-enablement-checklist-empty',
                  role: 'status',
                },
                props.emptyLabel !== undefined
                  ? renderPropContent(props.emptyLabel)
                  : 'No checklist items.',
              ),
        ],
      );
    };
  },
});

function renderEnablementItem(item: WizardEnablementItem): VNodeChild {
  return h(
    'li',
    {
      key: item.key,
      class: `facetheory-stitch-wizard-enablement-item facetheory-stitch-wizard-enablement-item-${item.status}`,
      'data-item-key': item.key,
      'data-item-status': item.status,
    },
    [
      h('div', null, [
        h('strong', null, renderPropContent(item.label as VNodeChild)),
        item.description !== undefined
          ? h('p', null, renderPropContent(item.description as VNodeChild))
          : null,
        item.detail !== undefined
          ? h('span', null, renderPropContent(item.detail as VNodeChild))
          : null,
      ]),
      renderChip(
        `facetheory-stitch-wizard-enablement-item-status facetheory-stitch-wizard-enablement-item-status-${item.status}`,
        { 'data-status-chip': item.status },
        ENABLEMENT_LABEL[item.status],
      ),
    ],
  );
}

/* -------------------------------------------------------------------------- */
/* WizardRecoveryStatusPanel                                                  */
/* -------------------------------------------------------------------------- */

export const WizardRecoveryStatusPanel = defineComponent({
  name: 'FaceTheoryVueWizardRecoveryStatusPanel',
  props: {
    title: vnodeChildProp,
    status: { type: Object as PropType<WizardRecoveryStatus>, required: true },
    actions: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () => {
      const status = props.status;
      const title = props.title !== undefined
        ? renderPropContent(props.title)
        : ['Wizard recovery'];
      const role = status.state === 'failed' ? 'alert' : 'status';
      const chipLabel = status.label ?? RECOVERY_LABEL[status.state];
      const actions = slots.actions?.() ?? renderPropContent(props.actions);
      return h(
        'section',
        {
          class: `facetheory-stitch-wizard-recovery facetheory-stitch-wizard-recovery-${status.state}`,
          'data-recovery-state': status.state,
          role,
        },
        [
          h('header', null, [
            h('h2', null, title),
            renderChip(
              `facetheory-stitch-wizard-recovery-chip facetheory-stitch-wizard-recovery-chip-${status.state}`,
              { 'data-recovery-chip': status.state },
              chipLabel,
            ),
          ]),
          status.description !== undefined ? h('p', null, status.description) : null,
          status.lastSavedAt !== undefined || status.ageLabel !== undefined
            ? h(
                'dl',
                { class: 'facetheory-stitch-wizard-recovery-metadata' },
                [
                  status.lastSavedAt !== undefined
                    ? [
                        h('dt', { key: 'saved-label' }, 'Last saved'),
                        h('dd', { key: 'saved-value' }, status.lastSavedAt),
                      ]
                    : null,
                  status.ageLabel !== undefined
                    ? [
                        h('dt', { key: 'age-label' }, 'Age'),
                        h('dd', { key: 'age-value' }, status.ageLabel),
                      ]
                    : null,
                ],
              )
            : null,
          status.resumeTokenReference !== undefined
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-wizard-recovery-resume-token',
                  'data-resume-token-redacted': status.resumeTokenReference.redacted ? 'true' : 'false',
                },
                [
                  h('span', null, 'Resume token'),
                  h('code', null, status.resumeTokenReference.label),
                ],
              )
            : null,
          status.metadata !== undefined
            ? h(MetadataBadgeGroup, { metadata: status.metadata })
            : null,
          actions.length > 0
            ? h(
                'div',
                { class: 'facetheory-stitch-wizard-recovery-actions' },
                actions,
              )
            : null,
        ],
      );
    };
  },
});

/* -------------------------------------------------------------------------- */
/* WizardEmptyState                                                           */
/* -------------------------------------------------------------------------- */

export const WizardEmptyState = defineComponent({
  name: 'FaceTheoryVueWizardEmptyState',
  props: {
    config: { type: Object as PropType<WizardEmptyStateConfig>, required: true },
    action: vnodeChildProp,
  },
  setup(props, { slots }) {
    return () => {
      const config = props.config;
      const actionNode =
        slots.action?.() ?? renderPropContent(props.action ?? config.actionLabel);
      return h(
        'section',
        {
          class: `facetheory-stitch-wizard-empty-state facetheory-stitch-wizard-empty-state-${config.intent}`,
          'data-empty-intent': config.intent,
          'data-safety-policy': config.safetyPolicy,
          role: config.intent === 'error' ? 'alert' : 'status',
        },
        [
          h(
            'span',
            { class: 'facetheory-stitch-wizard-empty-state-intent' },
            EMPTY_INTENT_LABEL[config.intent],
          ),
          h('strong', null, config.title),
          config.description !== undefined
            ? h('p', null, config.description)
            : null,
          actionNode.length > 0
            ? h(
                'div',
                { class: 'facetheory-stitch-wizard-empty-state-action' },
                actionNode,
              )
            : null,
          renderSafetyFootnote(config.safetyPolicy),
        ],
      );
    };
  },
});
