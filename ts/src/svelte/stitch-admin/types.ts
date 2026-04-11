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
