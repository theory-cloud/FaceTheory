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

export type StatusVariant =
  | 'active'
  | 'pending'
  | 'suspended'
  | 'archived'
  | 'error';

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

export declare const DataTable: Component<DataTableProps>;
export declare const DetailPanel: Component<DetailPanelProps>;
export declare const PropertyGrid: Component<PropertyGridProps>;
export declare const FormRow: Component<FormRowProps>;
export declare const FormSection: Component<FormSectionProps>;
export declare const SplitForm: Component<SplitFormProps>;
export declare const StatusTag: Component<StatusTagProps>;
export declare const DestructiveConfirm: Component<DestructiveConfirmProps>;
