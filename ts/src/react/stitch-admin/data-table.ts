import * as React from 'react';
import { Empty, Table } from 'antd';
import type { TableProps } from 'antd';

const h = React.createElement;

export interface DataTableToolbarSlots {
  /** Left-aligned: title or entity count. */
  left?: React.ReactNode;
  /** Center slot for search / filter controls. */
  center?: React.ReactNode;
  /** Right-aligned: primary and secondary actions (e.g. "New partner"). */
  right?: React.ReactNode;
}

export interface DataTableProps<RecordType extends object = object>
  extends Omit<TableProps<RecordType>, 'title'> {
  /** Toolbar slot content. When omitted, the toolbar is hidden. */
  toolbar?: DataTableToolbarSlots;
  /** Empty-state message. Defaults to "No records". */
  emptyLabel?: React.ReactNode;
  /** Row-level action slot renderer. Appended as the last column when set. */
  rowActions?: (record: RecordType, index: number) => React.ReactNode;
}

const TOOLBAR_CLASS = 'facetheory-stitch-data-table-toolbar';

function renderToolbar(
  slots: DataTableToolbarSlots | undefined,
): React.ReactNode {
  if (!slots) return null;
  const { left, center, right } = slots;
  if (left === undefined && center === undefined && right === undefined) {
    return null;
  }
  return h(
    'div',
    {
      className: TOOLBAR_CLASS,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '16px 24px',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
        borderTopLeftRadius: 'var(--stitch-radius-lg, 12px)',
        borderTopRightRadius: 'var(--stitch-radius-lg, 12px)',
      },
    },
    h(
      'div',
      { style: { flex: 1, minWidth: 0 } },
      left !== undefined ? left : null,
    ),
    h(
      'div',
      { style: { display: 'flex', justifyContent: 'center', flex: 1 } },
      center !== undefined ? center : null,
    ),
    h(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
          flex: 1,
        },
      },
      right !== undefined ? right : null,
    ),
  );
}

/**
 * Dense-admin data table. Wraps AntD's `Table` with a standardized toolbar,
 * a Stitch-tonal empty state, and an optional row-actions column. Honors the
 * Stitch "no dividers" rule via the token bridge's Table component overrides.
 */
export function DataTable<RecordType extends object = object>(
  props: DataTableProps<RecordType>,
): React.ReactElement {
  const { toolbar, emptyLabel, rowActions, columns, ...rest } = props;

  const finalColumns = React.useMemo(() => {
    const base = columns ?? [];
    if (!rowActions) return base;
    const actionColumn = {
      key: '__actions',
      title: '',
      width: 80,
      align: 'right' as const,
      render: (_value: unknown, record: RecordType, index: number) =>
        rowActions(record, index),
    };
    return [...base, actionColumn];
  }, [columns, rowActions]);

  const locale = {
    emptyText: h(Empty, {
      description:
        emptyLabel ??
        h(
          'span',
          {
            style: {
              color: 'var(--stitch-color-on-surface-variant, #464553)',
            },
          },
          'No records',
        ),
      image: Empty.PRESENTED_IMAGE_SIMPLE,
    }),
  };

  const tableProps = {
    ...rest,
    columns: finalColumns,
    locale: { ...rest.locale, ...locale },
    pagination: rest.pagination ?? false,
  } as unknown as TableProps<RecordType>;

  const toolbarNode = renderToolbar(toolbar);

  return h(
    'div',
    {
      className: 'facetheory-stitch-data-table',
      style: {
        background: 'var(--stitch-color-surface-container-lowest, #ffffff)',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        overflow: 'hidden',
      },
    },
    toolbarNode,
    // AntD's Table is invariant in its generic; cast through unknown so the
    // wrapper preserves the caller's record shape.
    h(Table as unknown as React.FC<TableProps<RecordType>>, tableProps),
  );
}
