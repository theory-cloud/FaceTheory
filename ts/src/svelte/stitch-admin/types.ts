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
  OperatorEmptyStateConfig,
  OperatorEmptyStateIntent,
  OperatorGuardState,
  OperatorGuardStatus,
  OperatorHealthRow,
  OperatorHealthStatus,
  OperatorPlaceholderDataPolicy,
  OperatorVisibilityMetadata,
  ProvenanceMetadata,
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
