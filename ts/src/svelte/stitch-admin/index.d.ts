import type { Component } from 'svelte';

export interface DataTableToolbarSlots {
  left?: unknown;
  center?: unknown;
  right?: unknown;
}

export interface DataTableColumn<
  RecordType extends object = Record<string, unknown>,
> {
  key?: string;
  title: unknown;
  dataIndex?: keyof RecordType | string;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, record: RecordType, index: number) => unknown;
}

export interface PropertyItem {
  key: string;
  label: unknown;
  value: unknown;
  span?: 'half' | 'full';
}

export interface TabItem extends Omit<
  import('../../stitch-admin/tabs-types.js').TabItem,
  'label' | 'icon'
> {
  label: unknown;
  icon?: unknown;
}

export interface FilterChipConfig extends Omit<
  import('../../stitch-admin/filter-types.js').FilterChipConfig,
  'label'
> {
  label: unknown;
}

export interface KeyValueEntry {
  key: string;
  label: unknown;
  value: unknown;
}

export type LogLevel = import('../../stitch-admin/log-types.js').LogLevel;

export interface LogEntry extends Omit<
  import('../../stitch-admin/log-types.js').LogEntry,
  'message' | 'actor'
> {
  message: unknown;
  actor?: unknown;
}

export type StatusVariant =
  import('../../stitch-admin/status-types.js').StatusVariant;

export type {
  AuthorityState,
  ConfidenceLevel,
  ConfidenceMetadata,
  OperatorCorrelationMetadata,
  OperatorEmptyStateConfig,
  OperatorEmptyStateIntent,
  OperatorGuardState,
  OperatorGuardStatus,
  OperatorHealthRow,
  OperatorHealthStatus,
  OperatorPlaceholderDataPolicy,
  OperatorVisibilityMetadata,
  ProvenanceMetadata,
  VisibilityMatrixCell,
  VisibilityMatrixCellState,
  VisibilityMatrixDimension,
  VisibilityMatrixEntity,
  VisibilityMatrixRow,
  StalenessMetadata,
  StalenessState,
} from '../../stitch-admin/operator-visibility-types.js';

export interface HealthStatusPanelProps {
  title?: unknown;
  description?: unknown;
  rows: import('../../stitch-admin/operator-visibility-types.js').OperatorHealthRow[];
  actions?: unknown;
  emptyLabel?: unknown;
}

export interface VisibilityMatrixProps {
  title?: unknown;
  description?: unknown;
  dimensions: import('../../stitch-admin/operator-visibility-types.js').VisibilityMatrixDimension[];
  rows: import('../../stitch-admin/operator-visibility-types.js').VisibilityMatrixRow[];
  actions?: unknown;
  emptyLabel?: unknown;
  emptyCellLabel?: unknown;
}

export interface GuardedOperatorShellProps {
  guard: import('../../stitch-admin/operator-visibility-types.js').OperatorGuardStatus;
  authorized?: unknown;
  unauthorized?: unknown;
  loading?: unknown;
  error?: unknown;
  placeholderDataPolicy?: import('../../stitch-admin/operator-visibility-types.js').OperatorPlaceholderDataPolicy;
}

export type MetadataBadgeTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

export interface MetadataBadgeProps {
  label: unknown;
  detail?: unknown;
  tone?: MetadataBadgeTone;
  href?: string;
  title?: string;
}

export interface MetadataBadgeGroupProps {
  metadata: import('../../stitch-admin/operator-visibility-types.js').OperatorVisibilityMetadata;
  includeAuthority?: boolean;
}

export interface NonAuthoritativeBannerProps {
  title?: unknown;
  description?: unknown;
  metadata?: import('../../stitch-admin/operator-visibility-types.js').OperatorVisibilityMetadata;
  actions?: unknown;
}

export interface OperatorEmptyStateProps {
  config: import('../../stitch-admin/operator-visibility-types.js').OperatorEmptyStateConfig;
  action?: unknown;
}

export interface DataTableProps {
  rowKey: string | ((record: Record<string, unknown>) => string);
  dataSource: Array<Record<string, unknown>>;
  columns: Array<DataTableColumn<Record<string, unknown>>>;
  emptyLabel?: unknown;
}

export interface DetailPanelProps {
  title?: unknown;
  description?: unknown;
  properties: PropertyItem[];
  columns?: number;
}

export interface PropertyGridProps {
  items: PropertyItem[];
  columns?: number;
}

export interface FormRowProps {
  label: unknown;
  description?: unknown;
  required?: boolean;
  error?: unknown;
}

export interface FormSectionProps {
  title?: unknown;
  description?: unknown;
}

export type SplitFormProps = Record<string, never>;

export interface StatusTagProps {
  variant: StatusVariant;
  label?: unknown;
}

export interface DestructiveConfirmProps {
  title: unknown;
  description?: unknown;
  requireText?: string;
  confirmLabel?: unknown;
  cancelLabel?: unknown;
  onCancel?: () => void;
  onConfirm?: () => void;
  loading?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeKey?: string;
  defaultActiveKey?: string;
  onChange?: (key: string) => void;
  variant?: 'line' | 'card';
}

export interface FilterChipProps extends Omit<FilterChipConfig, 'key'> {
  onClick?: () => void;
  onRemove?: () => void;
}

export interface FilterChipGroupProps {
  chips: FilterChipConfig[];
  onChipClick?: (key: string) => void;
  onChipRemove?: (key: string) => void;
  trailing?: unknown;
}

export interface InlineKeyValueListProps {
  entries: KeyValueEntry[];
  labelWidth?: number | string;
  valueMono?: boolean;
}

export interface CopyableCodeProps {
  code: string;
  copyLabel?: string;
  size?: 'sm' | 'md';
  onCopy?: (code: string) => void;
}

export interface LogStreamProps {
  entries: LogEntry[];
  variant?: 'plain' | 'terminal';
  title?: unknown;
  formatTimestamp?: (value: string | number) => string;
  maxHeight?: number | string;
}

export declare const DataTable: Component<DataTableProps>;
export declare const DetailPanel: Component<DetailPanelProps>;
export declare const PropertyGrid: Component<PropertyGridProps>;
export declare const FormRow: Component<FormRowProps>;
export declare const FormSection: Component<FormSectionProps>;
export declare const SplitForm: Component<SplitFormProps>;
export declare const StatusTag: Component<StatusTagProps>;
export declare const DestructiveConfirm: Component<DestructiveConfirmProps>;
export declare const Tabs: Component<TabsProps>;
export declare const FilterChip: Component<FilterChipProps>;
export declare const FilterChipGroup: Component<FilterChipGroupProps>;
export declare const GuardedOperatorShell: Component<GuardedOperatorShellProps>;
export declare const HealthStatusPanel: Component<HealthStatusPanelProps>;
export declare const VisibilityMatrix: Component<VisibilityMatrixProps>;
export declare const InlineKeyValueList: Component<InlineKeyValueListProps>;
export declare const CopyableCode: Component<CopyableCodeProps>;
export declare const LogStream: Component<LogStreamProps>;
export declare const MetadataBadge: Component<MetadataBadgeProps>;
export declare const MetadataBadgeGroup: Component<MetadataBadgeGroupProps>;
export declare const NonAuthoritativeBanner: Component<NonAuthoritativeBannerProps>;
export declare const OperatorEmptyState: Component<OperatorEmptyStateProps>;

export interface WizardEditableTokenInputPanelProps {
  input: import('../../stitch-admin/wizard-editable-token-input-types.js').WizardEditableTokenInput;
  onChange: (next: string[]) => void;
  onDraftChange?: (next: string) => void;
}
export type WizardChipListPanelProps = WizardEditableTokenInputPanelProps;
export declare const WizardEditableTokenInputPanel: Component<WizardEditableTokenInputPanelProps>;
export declare const WizardChipListPanel: Component<WizardChipListPanelProps>;
export type {
  WizardEditableTokenInput,
  WizardEditableTokenInputFeedbackTone,
  WizardEditableTokenInputItem,
  WizardEditableTokenInputTone,
  WizardEditableTokenInputValidationResult,
} from '../../stitch-admin/wizard-editable-token-input-types.js';

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
} from '../../stitch-admin/wizard-types.js';

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
} from '../../stitch-admin/wizard-reconciliation-plan-types.js';

export type {
  WizardAuthorityContextItem,
  WizardAuthorityContextItemTone,
  WizardAuthorityContextStrip,
  WizardAuthorityContextStripLayout,
  WizardAuthorityContextStripSize,
  WizardServerResolvedContextBar,
  WizardServerResolvedContextBarItem,
  WizardServerResolvedContextBarLayout,
  WizardServerResolvedContextBarSize,
  WizardServerResolvedContextBarTone,
} from '../../stitch-admin/wizard-authority-context-strip-types.js';

export interface WizardProgressPanelProps {
  title?: unknown;
  description?: unknown;
  state: import('../../stitch-admin/wizard-types.js').WizardProgressState;
}
export interface WizardPackageSummaryPanelProps {
  title?: unknown;
  summary: import('../../stitch-admin/wizard-types.js').WizardPackageSummary;
  emptyLabel?: unknown;
}
export interface WizardFindingListPanelProps {
  title?: unknown;
  description?: unknown;
  list: import('../../stitch-admin/wizard-types.js').WizardFindingList;
  emptyLabel?: unknown;
}
export interface WizardReconcileSummaryPanelProps {
  title?: unknown;
  description?: unknown;
  summary: import('../../stitch-admin/wizard-types.js').WizardReconcileSummary;
  emptyLabel?: unknown;
}
export interface WizardCapabilityReviewPanelProps {
  title?: unknown;
  description?: unknown;
  review: import('../../stitch-admin/wizard-types.js').WizardCapabilityReview;
  emptyLabel?: unknown;
}
export interface WizardEnablementChecklistPanelProps {
  title?: unknown;
  description?: unknown;
  checklist: import('../../stitch-admin/wizard-types.js').WizardEnablementChecklist;
  emptyLabel?: unknown;
}
export interface WizardRecoveryStatusPanelProps {
  title?: unknown;
  status: import('../../stitch-admin/wizard-types.js').WizardRecoveryStatus;
}
export interface WizardEmptyStatePanelProps {
  config: import('../../stitch-admin/wizard-types.js').WizardEmptyStateConfig;
  action?: unknown;
}
export interface WizardReconciliationPlanPanelProps {
  title?: unknown;
  description?: unknown;
  plan: import('../../stitch-admin/wizard-reconciliation-plan-types.js').WizardReconciliationPlan;
  emptyLabel?: unknown;
  onToggleRow?: (rowKey: string, nextExpanded: boolean) => void;
}
export type WizardDiffListPanelProps = WizardReconciliationPlanPanelProps;
export interface WizardAuthorityContextStripPanelProps {
  title?: unknown;
  description?: unknown;
  strip: import('../../stitch-admin/wizard-authority-context-strip-types.js').WizardAuthorityContextStrip;
  onCopyItem?: (itemKey: string, copyValue: string) => void;
}
export type WizardServerResolvedContextBarPanelProps = WizardAuthorityContextStripPanelProps;

export declare const WizardProgress: Component<WizardProgressPanelProps>;
export declare const WizardPackageSummaryPanel: Component<WizardPackageSummaryPanelProps>;
export declare const WizardFindingListPanel: Component<WizardFindingListPanelProps>;
export declare const WizardReconcileSummaryPanel: Component<WizardReconcileSummaryPanelProps>;
export declare const WizardCapabilityReviewPanel: Component<WizardCapabilityReviewPanelProps>;
export declare const WizardEnablementChecklistPanel: Component<WizardEnablementChecklistPanelProps>;
export declare const WizardRecoveryStatusPanel: Component<WizardRecoveryStatusPanelProps>;
export declare const WizardEmptyState: Component<WizardEmptyStatePanelProps>;
export declare const WizardReconciliationPlanPanel: Component<WizardReconciliationPlanPanelProps>;
export declare const WizardDiffListPanel: Component<WizardDiffListPanelProps>;
export declare const WizardAuthorityContextStripPanel: Component<WizardAuthorityContextStripPanelProps>;
export declare const WizardServerResolvedContextBarPanel: Component<WizardServerResolvedContextBarPanelProps>;
