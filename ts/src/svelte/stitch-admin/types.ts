import type { FilterChipConfig as SharedFilterChipConfig } from '../../stitch-admin/filter-types.js';
import type {
  LogEntry as SharedLogEntry,
  LogLevel as SharedLogLevel,
} from '../../stitch-admin/log-types.js';
import type { StatusVariant as SharedStatusVariant } from '../../stitch-admin/status-types.js';
import type { TabItem as SharedTabItem } from '../../stitch-admin/tabs-types.js';

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

export interface TabItem extends Omit<SharedTabItem, 'label' | 'icon'> {
  label: unknown;
  icon?: unknown;
}

export interface FilterChipConfig extends Omit<
  SharedFilterChipConfig,
  'label'
> {
  label: unknown;
}

export interface KeyValueEntry {
  key: string;
  label: unknown;
  value: unknown;
}

export interface LogEntry extends Omit<SharedLogEntry, 'message' | 'actor'> {
  message: unknown;
  actor?: unknown;
}

export type LogLevel = SharedLogLevel;
export type StatusVariant = SharedStatusVariant;

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

export type MetadataBadgeTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

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

export type {
  WizardEditableTokenInput,
  WizardEditableTokenInputFeedbackTone,
  WizardEditableTokenInputItem,
  WizardEditableTokenInputTone,
  WizardEditableTokenInputValidationResult,
} from '../../stitch-admin/wizard-editable-token-input-types.js';

export interface WizardEditableTokenInputPanelProps {
  input: import('../../stitch-admin/wizard-editable-token-input-types.js').WizardEditableTokenInput;
  onChange: (next: string[]) => void;
  onDraftChange?: (next: string) => void;
}

export type WizardChipListPanelProps = WizardEditableTokenInputPanelProps;

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

export type {
  ChoiceCardProps,
  SelectableCardGrid,
  SelectableCardGridLayout,
  SelectableCardGridSelection,
  SelectableCardGridSize,
  SelectableCardOption,
  SelectableCardTone,
} from '../../stitch-admin/selectable-card-grid-types.js';

export interface SelectableCardGridPanelProps {
  grid: import('../../stitch-admin/selectable-card-grid-types.js').SelectableCardGrid;
  onChange: (nextSelectedKeys: string[]) => void;
}

export interface ChoiceCardPanelProps {
  card: import('../../stitch-admin/selectable-card-grid-types.js').ChoiceCardProps;
  onChange?: (selected: boolean) => void;
}
