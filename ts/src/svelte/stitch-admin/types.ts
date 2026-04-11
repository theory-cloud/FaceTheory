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
