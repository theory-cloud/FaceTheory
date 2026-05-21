import * as React from 'react';

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
import { MetadataBadgeGroup } from './operator-notices.js';

const h = React.createElement;

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
/* Shared palettes                                                            */
/* -------------------------------------------------------------------------- */

interface ChipPalette {
  background: string;
  color: string;
  border: string;
  label: string;
}

const STEP_PALETTE: Record<WizardStepStatus, ChipPalette> = {
  pending: {
    background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
    color: 'var(--stitch-color-on-surface-variant, #464553)',
    border: 'var(--stitch-color-outline-variant, #c6c5d0)',
    label: 'Pending',
  },
  'in-progress': {
    background: 'var(--stitch-color-primary-container, #e0e0ff)',
    color: 'var(--stitch-color-on-primary-container, #000066)',
    border: 'var(--stitch-color-primary-container, #e0e0ff)',
    label: 'In progress',
  },
  complete: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    border: 'var(--stitch-color-tertiary-container, #004c45)',
    label: 'Complete',
  },
  blocked: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    border: 'var(--stitch-color-error-container, #ffdad6)',
    label: 'Blocked',
  },
  skipped: {
    background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
    color: 'var(--stitch-color-on-surface-variant, #464553)',
    border: 'var(--stitch-color-outline-variant, #c6c5d0)',
    label: 'Skipped',
  },
};

const SEVERITY_PALETTE: Record<WizardFindingSeverity, ChipPalette> = {
  info: {
    background: 'var(--stitch-color-primary-container, #e0e0ff)',
    color: 'var(--stitch-color-on-primary-container, #000066)',
    border: 'var(--stitch-color-primary-container, #e0e0ff)',
    label: 'Info',
  },
  warning: {
    background: 'var(--stitch-color-secondary-container, #ffecc0)',
    color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    border: 'var(--stitch-color-secondary-container, #ffecc0)',
    label: 'Warning',
  },
  error: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    border: 'var(--stitch-color-error-container, #ffdad6)',
    label: 'Error',
  },
  blocker: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    border: 'var(--stitch-color-on-error-container, #93000a)',
    label: 'Blocker',
  },
};

const KIND_PALETTE: Record<WizardReconcileEntry['kind'], ChipPalette> = {
  added: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    border: 'var(--stitch-color-tertiary-container, #004c45)',
    label: 'Added',
  },
  removed: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    border: 'var(--stitch-color-error-container, #ffdad6)',
    label: 'Removed',
  },
  changed: {
    background: 'var(--stitch-color-secondary-container, #ffecc0)',
    color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    border: 'var(--stitch-color-secondary-container, #ffecc0)',
    label: 'Changed',
  },
  unchanged: {
    background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
    color: 'var(--stitch-color-on-surface-variant, #464553)',
    border: 'var(--stitch-color-outline-variant, #c6c5d0)',
    label: 'Unchanged',
  },
  redacted: {
    background: 'var(--stitch-color-surface-container, #eaedff)',
    color: 'var(--stitch-color-on-surface-variant, #464553)',
    border: 'var(--stitch-color-outline-variant, #c6c5d0)',
    label: 'Redacted',
  },
};

const INTENT_PALETTE: Record<WizardCapabilityIntent, ChipPalette> = {
  requested: {
    background: 'var(--stitch-color-primary-container, #e0e0ff)',
    color: 'var(--stitch-color-on-primary-container, #000066)',
    border: 'var(--stitch-color-primary-container, #e0e0ff)',
    label: 'Requested',
  },
  granted: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    border: 'var(--stitch-color-tertiary-container, #004c45)',
    label: 'Granted',
  },
  denied: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    border: 'var(--stitch-color-error-container, #ffdad6)',
    label: 'Denied',
  },
};

const ENABLEMENT_PALETTE: Record<WizardEnablementItemStatus, ChipPalette> = {
  ready: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    border: 'var(--stitch-color-tertiary-container, #004c45)',
    label: 'Ready',
  },
  attention: {
    background: 'var(--stitch-color-secondary-container, #ffecc0)',
    color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    border: 'var(--stitch-color-secondary-container, #ffecc0)',
    label: 'Needs attention',
  },
  blocked: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    border: 'var(--stitch-color-error-container, #ffdad6)',
    label: 'Blocked',
  },
  'not-applicable': {
    background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
    color: 'var(--stitch-color-on-surface-variant, #464553)',
    border: 'var(--stitch-color-outline-variant, #c6c5d0)',
    label: 'Not applicable',
  },
};

const RECOVERY_PALETTE: Record<WizardRecoveryState, ChipPalette> = {
  fresh: {
    background: 'var(--stitch-color-primary-container, #e0e0ff)',
    color: 'var(--stitch-color-on-primary-container, #000066)',
    border: 'var(--stitch-color-primary-container, #e0e0ff)',
    label: 'Fresh session',
  },
  resumable: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    border: 'var(--stitch-color-tertiary-container, #004c45)',
    label: 'Resumable',
  },
  expired: {
    background: 'var(--stitch-color-secondary-container, #ffecc0)',
    color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    border: 'var(--stitch-color-secondary-container, #ffecc0)',
    label: 'Expired',
  },
  failed: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    border: 'var(--stitch-color-error-container, #ffdad6)',
    label: 'Failed',
  },
  unknown: {
    background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
    color: 'var(--stitch-color-on-surface-variant, #464553)',
    border: 'var(--stitch-color-outline-variant, #c6c5d0)',
    label: 'Recovery unknown',
  },
};

const INTENT_EMPTY_LABELS: Record<OperatorEmptyStateIntent, string> = {
  'no-data': 'No data',
  'not-authorized': 'Not authorized',
  'not-configured': 'Not configured',
  'filtered-empty': 'No matching results',
  loading: 'Loading',
  error: 'Unavailable',
};

function renderChip(
  palette: ChipPalette,
  label: React.ReactNode,
  dataAttrs?: Record<string, string>,
  key?: React.Key,
): React.ReactElement {
  return h(
    'span',
    {
      ...(dataAttrs ?? {}),
      key,
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
    label,
  );
}

/* -------------------------------------------------------------------------- */
/* WizardProgress                                                             */
/* -------------------------------------------------------------------------- */

export interface WizardProgressProps {
  /** Panel heading. Adapters narrow this to their node type. */
  title?: React.ReactNode;
  /** Optional descriptive copy under the heading. */
  description?: React.ReactNode;
  state: WizardProgressState;
}

/**
 * Presentational wizard progress strip. The host supplies the list of steps
 * and which one is current; FaceTheory renders them in order so SSR and
 * hydration always select the same step.
 */
export function WizardProgress(props: WizardProgressProps): React.ReactElement {
  const { title = 'Wizard progress', description, state } = props;
  const totalCount = state.steps.length;
  const completedCount = state.steps.filter((step) => step.status === 'complete').length;
  const progressLabel = state.progressLabel ?? `${completedCount} of ${totalCount} complete`;

  return h(
    'section',
    {
      className: 'facetheory-stitch-wizard-progress',
      'data-step-count': String(totalCount),
      'data-completed-count': String(completedCount),
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
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
      h(
        'span',
        {
          className: 'facetheory-stitch-wizard-progress-label',
          style: {
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--stitch-color-on-surface-variant, #464553)',
          },
        },
        progressLabel,
      ),
    ),
    h(
      'ol',
      {
        role: 'list',
        style: {
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'grid',
          gap: '8px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        },
      },
      state.steps.map((step, index) => renderStep(step, index, state.currentStepKey)),
    ),
  );
}

function renderStep(step: WizardStep, index: number, currentStepKey?: string): React.ReactElement {
  const palette = STEP_PALETTE[step.status];
  const isActive = step.active === true || (currentStepKey !== undefined && currentStepKey === step.key);
  const stepIndex = index + 1;
  return h(
    'li',
    {
      key: step.key,
      className: `facetheory-stitch-wizard-step facetheory-stitch-wizard-step-${step.status}${isActive ? ' facetheory-stitch-wizard-step-active' : ''}`,
      'data-step-key': step.key,
      'data-step-status': step.status,
      'data-step-active': isActive ? 'true' : 'false',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '12px',
        borderRadius: 'var(--stitch-radius-md, 10px)',
        border: `1px solid ${isActive ? palette.color : palette.border}`,
        background: 'var(--stitch-color-surface-container, #eaedff)',
      },
    },
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
      h(
        'span',
        {
          style: {
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--stitch-color-on-surface-variant, #464553)',
          },
        },
        `Step ${stepIndex}`,
      ),
      renderChip(palette, palette.label, { 'data-status-chip': step.status }),
    ),
    h('strong', { style: { fontSize: '14px' } }, step.label as React.ReactNode),
    step.description !== undefined
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
          step.description as React.ReactNode,
        )
      : null,
    step.hint !== undefined
      ? h(
          'span',
          {
            className: 'facetheory-stitch-wizard-step-hint',
            style: {
              fontSize: '12px',
              color: 'var(--stitch-color-on-surface-variant, #464553)',
            },
          },
          step.hint as React.ReactNode,
        )
      : null,
  );
}

/* -------------------------------------------------------------------------- */
/* WizardPackageSummary                                                       */
/* -------------------------------------------------------------------------- */

export interface WizardPackageSummaryProps {
  /** Optional title; defaults to the package name. */
  title?: React.ReactNode;
  summary: WizardPackageSummary;
  emptyLabel?: React.ReactNode;
}

/**
 * Renders a wizard package summary (name/version/files/totals). The primitive
 * never opens, hashes, or fetches the package; it only displays the values
 * the host has already computed.
 */
export function WizardPackageSummaryPanel(props: WizardPackageSummaryProps): React.ReactElement {
  const { title, summary, emptyLabel = 'No files in this package.' } = props;
  const heading = title ?? summary.name;

  return h(
    'section',
    {
      className: 'facetheory-stitch-wizard-package-summary',
      'data-package-name': summary.name,
      'data-package-version': summary.version,
      'data-safety-policy': summary.safetyPolicy,
      'data-file-count': String(summary.totals.fileCount),
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '20px',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
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
        h('h2', { style: { margin: 0, fontSize: '16px' } }, heading),
        summary.version !== undefined
          ? h(
              'span',
              {
                className: 'facetheory-stitch-wizard-package-summary-version',
                style: {
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--stitch-color-on-surface-variant, #464553)',
                },
              },
              `Version ${summary.version}`,
            )
          : null,
        summary.description !== undefined
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
              summary.description as React.ReactNode,
            )
          : null,
      ),
      h(
        'dl',
        {
          className: 'facetheory-stitch-wizard-package-summary-totals',
          style: {
            margin: 0,
            display: 'flex',
            gap: '12px',
            fontSize: '12px',
            color: 'var(--stitch-color-on-surface-variant, #464553)',
          },
        },
        renderTotal('Files', String(summary.totals.fileCount)),
        summary.totals.byteCount !== undefined
          ? renderTotal('Bytes', String(summary.totals.byteCount))
          : null,
      ),
    ),
    summary.metadata !== undefined
      ? h(MetadataBadgeGroup, { metadata: summary.metadata })
      : null,
    summary.files.length > 0
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
          summary.files.map((file) => renderPackageFile(file)),
        )
      : h(
          'div',
          {
            className: 'facetheory-stitch-wizard-package-summary-empty',
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
    renderSafetyFootnote(summary.safetyPolicy),
  );
}

function renderTotal(label: string, value: string): React.ReactElement {
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' } },
    h('dt', { style: { fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' } }, label),
    h('dd', { style: { margin: 0, fontVariantNumeric: 'tabular-nums' } }, value),
  );
}

function renderPackageFile(file: WizardPackageFile): React.ReactElement {
  return h(
    'li',
    {
      key: file.key,
      className: 'facetheory-stitch-wizard-package-summary-file',
      'data-file-role': file.role,
      style: {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: 'var(--stitch-radius-md, 10px)',
        background: 'var(--stitch-color-surface-container, #eaedff)',
        fontSize: '13px',
        color: 'var(--stitch-color-on-surface, #131b2e)',
      },
    },
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } },
      h(
        'code',
        {
          style: {
            fontFamily: 'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)',
            fontSize: '12px',
            overflowWrap: 'anywhere',
            color: 'var(--stitch-color-on-surface, #131b2e)',
          },
        },
        file.path,
      ),
      file.note !== undefined
        ? h(
            'span',
            {
              style: { fontSize: '12px', color: 'var(--stitch-color-on-surface-variant, #464553)' },
            },
            file.note,
          )
        : null,
    ),
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '2px',
          fontVariantNumeric: 'tabular-nums',
          fontSize: '12px',
          color: 'var(--stitch-color-on-surface-variant, #464553)',
        },
      },
      file.role !== undefined ? h('span', null, file.role) : null,
      file.mediaType !== undefined ? h('span', null, file.mediaType) : null,
      file.sizeBytes !== undefined ? h('span', null, `${file.sizeBytes} B`) : null,
      file.sha256 !== undefined
        ? h(
            'code',
            { style: { fontSize: '11px', overflowWrap: 'anywhere' } },
            file.sha256,
          )
        : null,
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

/* -------------------------------------------------------------------------- */
/* WizardFindingListPanel                                                     */
/* -------------------------------------------------------------------------- */

export interface WizardFindingListProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  list: WizardFindingList;
  emptyLabel?: React.ReactNode;
}

/**
 * Renders a list of wizard validation findings. Hosts pre-compute severity
 * and copy; FaceTheory only displays the results.
 */
export function WizardFindingListPanel(props: WizardFindingListProps): React.ReactElement {
  const { title = 'Validation findings', description, list, emptyLabel = 'No findings reported.' } = props;
  const counts = countFindings(list.findings);

  return h(
    'section',
    {
      className: 'facetheory-stitch-wizard-finding-list',
      'data-safety-policy': list.safetyPolicy,
      'data-finding-count': String(list.findings.length),
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '20px',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
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
      h(
        'div',
        {
          className: 'facetheory-stitch-wizard-finding-counts',
          style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
        },
        (Object.keys(SEVERITY_PALETTE) as WizardFindingSeverity[]).map((severity) =>
          renderChip(
            SEVERITY_PALETTE[severity],
            `${SEVERITY_PALETTE[severity].label}: ${counts[severity]}`,
            { 'data-severity-summary': severity },
            severity,
          ),
        ),
      ),
    ),
    list.findings.length > 0
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
          list.findings.map((finding) => renderFinding(finding)),
        )
      : h(
          'div',
          {
            className: 'facetheory-stitch-wizard-finding-list-empty',
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
    renderSafetyFootnote(list.safetyPolicy),
  );
}

function countFindings(findings: WizardFinding[]): Record<WizardFindingSeverity, number> {
  return findings.reduce<Record<WizardFindingSeverity, number>>(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { info: 0, warning: 0, error: 0, blocker: 0 },
  );
}

function renderFinding(finding: WizardFinding): React.ReactElement {
  const palette = SEVERITY_PALETTE[finding.severity];
  return h(
    'li',
    {
      key: finding.id,
      className: `facetheory-stitch-wizard-finding facetheory-stitch-wizard-finding-${finding.severity}`,
      'data-finding-id': finding.id,
      'data-finding-severity': finding.severity,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '12px',
        borderRadius: 'var(--stitch-radius-md, 10px)',
        background: 'var(--stitch-color-surface-container, #eaedff)',
        border: `1px solid ${palette.border}`,
      },
    },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
      renderChip(palette, palette.label, { 'data-severity-chip': finding.severity }),
      finding.source !== undefined
        ? h(
            'span',
            {
              style: {
                fontSize: '12px',
                color: 'var(--stitch-color-on-surface-variant, #464553)',
              },
            },
            finding.source,
          )
        : null,
    ),
    h('strong', { style: { fontSize: '14px' } }, finding.title as React.ReactNode),
    finding.description !== undefined
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
          finding.description as React.ReactNode,
        )
      : null,
    finding.evidence !== undefined
      ? h(
          'code',
          {
            className: 'facetheory-stitch-wizard-finding-evidence',
            style: {
              fontSize: '12px',
              overflowWrap: 'anywhere',
              color: 'var(--stitch-color-on-surface, #131b2e)',
            },
          },
          finding.evidence,
        )
      : null,
    finding.metadata !== undefined
      ? h(MetadataBadgeGroup, { metadata: finding.metadata })
      : null,
  );
}

/* -------------------------------------------------------------------------- */
/* WizardReconcileSummaryPanel                                                */
/* -------------------------------------------------------------------------- */

export interface WizardReconcileSummaryProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  summary: WizardReconcileSummary;
  emptyLabel?: React.ReactNode;
}

/**
 * Renders a safe diff/reconcile summary. Entries flagged `redacted: true` (or
 * with kind `redacted`) render the redaction marker instead of their detail.
 */
export function WizardReconcileSummaryPanel(props: WizardReconcileSummaryProps): React.ReactElement {
  const { title = 'Reconcile summary', description, summary, emptyLabel = 'Nothing to reconcile.' } = props;

  return h(
    'section',
    {
      className: 'facetheory-stitch-wizard-reconcile-summary',
      'data-safety-policy': summary.safetyPolicy,
      'data-entry-count': String(summary.entries.length),
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '20px',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
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
      h(
        'div',
        {
          className: 'facetheory-stitch-wizard-reconcile-counts',
          style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
        },
        (Object.keys(KIND_PALETTE) as WizardReconcileEntry['kind'][]).map((kind) =>
          renderChip(
            KIND_PALETTE[kind],
            `${KIND_PALETTE[kind].label}: ${summary.totals[kind]}`,
            { 'data-kind-summary': kind },
            kind,
          ),
        ),
      ),
    ),
    summary.entries.length > 0
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
          summary.entries.map((entry) => renderReconcileEntry(entry)),
        )
      : h(
          'div',
          {
            className: 'facetheory-stitch-wizard-reconcile-summary-empty',
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
    renderSafetyFootnote(summary.safetyPolicy),
  );
}

function renderReconcileEntry(entry: WizardReconcileEntry): React.ReactElement {
  const palette = KIND_PALETTE[entry.kind];
  const isRedacted = entry.redacted === true || entry.kind === 'redacted';
  return h(
    'li',
    {
      key: entry.key,
      className: `facetheory-stitch-wizard-reconcile-entry facetheory-stitch-wizard-reconcile-entry-${entry.kind}${isRedacted ? ' facetheory-stitch-wizard-reconcile-entry-redacted' : ''}`,
      'data-entry-key': entry.key,
      'data-entry-kind': entry.kind,
      'data-entry-redacted': isRedacted ? 'true' : 'false',
      style: {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: 'var(--stitch-radius-md, 10px)',
        background: 'var(--stitch-color-surface-container, #eaedff)',
        border: `1px solid ${palette.border}`,
      },
    },
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 } },
      h('strong', { style: { fontSize: '14px' } }, entry.label as React.ReactNode),
      isRedacted
        ? h(
            'span',
            {
              className: 'facetheory-stitch-wizard-reconcile-entry-redaction',
              style: {
                fontSize: '12px',
                color: 'var(--stitch-color-on-surface-variant, #464553)',
                fontFamily: 'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)',
              },
            },
            REDACTED_MARKER,
          )
        : entry.detail !== undefined
          ? h(
              'span',
              {
                style: {
                  fontSize: '12px',
                  color: 'var(--stitch-color-on-surface-variant, #464553)',
                  overflowWrap: 'anywhere',
                },
              },
              entry.detail as React.ReactNode,
            )
          : null,
    ),
    renderChip(palette, palette.label, { 'data-kind-chip': entry.kind }),
  );
}

/* -------------------------------------------------------------------------- */
/* WizardCapabilityReviewPanel                                                */
/* -------------------------------------------------------------------------- */

export interface WizardCapabilityReviewProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  review: WizardCapabilityReview;
  emptyLabel?: React.ReactNode;
}

/**
 * Renders a capability review for the wizard. Capabilities marked `redacted`
 * render only the label + intent. Capabilities marked `sensitive` render the
 * label, intent, and description but suppress raw detail copy.
 */
export function WizardCapabilityReviewPanel(props: WizardCapabilityReviewProps): React.ReactElement {
  const { title = 'Capability review', description, review, emptyLabel = 'No capabilities to review.' } = props;

  return h(
    'section',
    {
      className: 'facetheory-stitch-wizard-capability-review',
      'data-safety-policy': review.safetyPolicy,
      'data-capability-count': String(review.capabilities.length),
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '20px',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
      },
    },
    h(
      'header',
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
    review.capabilities.length > 0
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
          review.capabilities.map((capability) => renderCapability(capability)),
        )
      : h(
          'div',
          {
            className: 'facetheory-stitch-wizard-capability-review-empty',
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
    renderSafetyFootnote(review.safetyPolicy),
  );
}

function renderCapability(capability: WizardCapability): React.ReactElement {
  const palette = INTENT_PALETTE[capability.intent];
  const isRedacted = capability.sensitivity === 'redacted';
  const isSensitive = capability.sensitivity === 'sensitive';
  return h(
    'li',
    {
      key: capability.key,
      className: `facetheory-stitch-wizard-capability facetheory-stitch-wizard-capability-${capability.intent} facetheory-stitch-wizard-capability-sensitivity-${capability.sensitivity}`,
      'data-capability-key': capability.key,
      'data-capability-intent': capability.intent,
      'data-capability-sensitivity': capability.sensitivity,
      style: {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: 'var(--stitch-radius-md, 10px)',
        background: 'var(--stitch-color-surface-container, #eaedff)',
        border: `1px solid ${palette.border}`,
      },
    },
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 } },
      h('strong', { style: { fontSize: '14px' } }, capability.label as React.ReactNode),
      !isRedacted && capability.description !== undefined
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
            capability.description as React.ReactNode,
          )
        : null,
      isRedacted
        ? h(
            'span',
            {
              className: 'facetheory-stitch-wizard-capability-redaction',
              style: {
                fontSize: '12px',
                fontFamily: 'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)',
                color: 'var(--stitch-color-on-surface-variant, #464553)',
              },
            },
            REDACTED_MARKER,
          )
        : isSensitive
          ? h(
              'span',
              {
                className: 'facetheory-stitch-wizard-capability-sensitive',
                style: {
                  fontSize: '12px',
                  color: 'var(--stitch-color-on-surface-variant, #464553)',
                },
              },
              'Detail suppressed (sensitive).',
            )
          : capability.detail !== undefined
            ? h(
                'span',
                {
                  style: {
                    fontSize: '12px',
                    color: 'var(--stitch-color-on-surface-variant, #464553)',
                    overflowWrap: 'anywhere',
                  },
                },
                capability.detail as React.ReactNode,
              )
            : null,
    ),
    renderChip(palette, palette.label, { 'data-intent-chip': capability.intent }),
  );
}

/* -------------------------------------------------------------------------- */
/* WizardEnablementChecklistPanel                                             */
/* -------------------------------------------------------------------------- */

export interface WizardEnablementChecklistProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  checklist: WizardEnablementChecklist;
  emptyLabel?: React.ReactNode;
}

/**
 * Renders the final enablement checklist. The host computes `allReady` and
 * `summaryLabel`; the primitive renders them verbatim.
 */
export function WizardEnablementChecklistPanel(props: WizardEnablementChecklistProps): React.ReactElement {
  const { title = 'Enablement checklist', description, checklist, emptyLabel = 'No checklist items.' } = props;
  const summary =
    checklist.summaryLabel ??
    (checklist.items.length > 0
      ? `${checklist.items.filter((item) => item.status === 'ready').length} of ${checklist.items.length} ready`
      : 'No checklist items');

  return h(
    'section',
    {
      className: 'facetheory-stitch-wizard-enablement-checklist',
      'data-all-ready': checklist.allReady === true ? 'true' : checklist.allReady === false ? 'false' : 'unknown',
      'data-item-count': String(checklist.items.length),
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '20px',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
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
      h(
        'span',
        {
          className: 'facetheory-stitch-wizard-enablement-checklist-summary',
          style: { fontSize: '12px', fontWeight: 600, color: 'var(--stitch-color-on-surface-variant, #464553)' },
        },
        summary,
      ),
    ),
    checklist.items.length > 0
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
          checklist.items.map((item) => renderEnablementItem(item)),
        )
      : h(
          'div',
          {
            className: 'facetheory-stitch-wizard-enablement-checklist-empty',
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
  );
}

function renderEnablementItem(item: WizardEnablementItem): React.ReactElement {
  const palette = ENABLEMENT_PALETTE[item.status];
  return h(
    'li',
    {
      key: item.key,
      className: `facetheory-stitch-wizard-enablement-item facetheory-stitch-wizard-enablement-item-${item.status}`,
      'data-item-key': item.key,
      'data-item-status': item.status,
      style: {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: 'var(--stitch-radius-md, 10px)',
        background: 'var(--stitch-color-surface-container, #eaedff)',
        border: `1px solid ${palette.border}`,
      },
    },
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 } },
      h('strong', { style: { fontSize: '14px' } }, item.label as React.ReactNode),
      item.description !== undefined
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
            item.description as React.ReactNode,
          )
        : null,
      item.detail !== undefined
        ? h(
            'span',
            {
              style: {
                fontSize: '12px',
                color: 'var(--stitch-color-on-surface-variant, #464553)',
                overflowWrap: 'anywhere',
              },
            },
            item.detail as React.ReactNode,
          )
        : null,
    ),
    renderChip(palette, palette.label, { 'data-status-chip': item.status }),
  );
}

/* -------------------------------------------------------------------------- */
/* WizardRecoveryStatusPanel                                                  */
/* -------------------------------------------------------------------------- */

export interface WizardRecoveryStatusProps {
  title?: React.ReactNode;
  status: WizardRecoveryStatus;
  actions?: React.ReactNode;
}

/**
 * Renders wizard recovery/resume status. Resume token references are rendered
 * as a label only; the primitive never emits a raw token even if a host hands
 * one in by accident — it relies on the host marking the reference `redacted`.
 */
export function WizardRecoveryStatusPanel(props: WizardRecoveryStatusProps): React.ReactElement {
  const { title = 'Wizard recovery', status, actions } = props;
  const palette = RECOVERY_PALETTE[status.state];

  return h(
    'section',
    {
      className: `facetheory-stitch-wizard-recovery facetheory-stitch-wizard-recovery-${status.state}`,
      'data-recovery-state': status.state,
      role: status.state === 'failed' ? 'alert' : 'status',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '18px',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
        border: `1px solid ${palette.border}`,
      },
    },
    h(
      'header',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
        },
      },
      h('h2', { style: { margin: 0, fontSize: '16px' } }, title),
      renderChip(palette, status.label ?? palette.label, { 'data-recovery-chip': status.state }),
    ),
    status.description !== undefined
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
          status.description,
        )
      : null,
    status.lastSavedAt !== undefined || status.ageLabel !== undefined
      ? h(
          'dl',
          {
            className: 'facetheory-stitch-wizard-recovery-metadata',
            style: {
              margin: 0,
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px 12px',
              fontSize: '12px',
              color: 'var(--stitch-color-on-surface-variant, #464553)',
            },
          },
          status.lastSavedAt !== undefined
            ? [
                h('dt', { key: 'saved-label', style: { fontWeight: 600 } }, 'Last saved'),
                h('dd', { key: 'saved-value', style: { margin: 0 } }, status.lastSavedAt),
              ]
            : null,
          status.ageLabel !== undefined
            ? [
                h('dt', { key: 'age-label', style: { fontWeight: 600 } }, 'Age'),
                h('dd', { key: 'age-value', style: { margin: 0 } }, status.ageLabel),
              ]
            : null,
        )
      : null,
    status.resumeTokenReference !== undefined
      ? h(
          'div',
          {
            className: 'facetheory-stitch-wizard-recovery-resume-token',
            'data-resume-token-redacted': status.resumeTokenReference.redacted ? 'true' : 'false',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              color: 'var(--stitch-color-on-surface, #131b2e)',
            },
          },
          h(
            'span',
            { style: { fontWeight: 600 } },
            'Resume token',
          ),
          h(
            'code',
            {
              style: {
                fontFamily:
                  'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)',
                background: 'var(--stitch-color-surface-container, #eaedff)',
                padding: '2px 8px',
                borderRadius: '6px',
              },
            },
            status.resumeTokenReference.label,
          ),
        )
      : null,
    status.metadata !== undefined
      ? h(MetadataBadgeGroup, { metadata: status.metadata })
      : null,
    actions !== undefined
      ? h(
          'div',
          {
            className: 'facetheory-stitch-wizard-recovery-actions',
            style: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
          },
          actions,
        )
      : null,
  );
}

/* -------------------------------------------------------------------------- */
/* WizardEmptyState                                                           */
/* -------------------------------------------------------------------------- */

export interface WizardEmptyStateProps {
  config: WizardEmptyStateConfig;
  action?: React.ReactNode;
}

/**
 * Wizard-flavored empty/error state. Renders the safety policy into the DOM
 * so reviewers can confirm placeholders contain no secrets or
 * production-looking data.
 */
export function WizardEmptyState(props: WizardEmptyStateProps): React.ReactElement {
  const { config, action } = props;
  const actionNode = action ?? config.actionLabel;

  return h(
    'section',
    {
      className: `facetheory-stitch-wizard-empty-state facetheory-stitch-wizard-empty-state-${config.intent}`,
      'data-empty-intent': config.intent,
      'data-safety-policy': config.safetyPolicy,
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
        className: 'facetheory-stitch-wizard-empty-state-intent',
        style: {
          fontSize: '12px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--stitch-color-on-surface-variant, #464553)',
        },
      },
      INTENT_EMPTY_LABELS[config.intent],
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
            className: 'facetheory-stitch-wizard-empty-state-action',
            style: { marginTop: '4px' },
          },
          actionNode,
        )
      : null,
    renderSafetyFootnote(config.safetyPolicy),
  );
}
