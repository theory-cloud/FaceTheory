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
