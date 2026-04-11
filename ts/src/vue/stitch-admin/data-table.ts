import { defineComponent, h } from 'vue';
import type { PropType, VNodeChild } from 'vue';

import { renderPropContent, vnodeChildProp } from '../stitch-common.js';

export interface DataTableToolbarSlots {
  left?: VNodeChild;
  center?: VNodeChild;
  right?: VNodeChild;
}

export interface DataTableColumn<RecordType extends object = object> {
  key?: string;
  title: unknown;
  dataIndex?: keyof RecordType | string;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, record: RecordType, index: number) => unknown;
}

type RowKey<RecordType extends object> =
  | keyof RecordType
  | ((record: RecordType) => string);

function resolveRowKey<RecordType extends object>(
  record: RecordType,
  rowKey: RowKey<RecordType>,
): string {
  if (typeof rowKey === 'function') return rowKey(record);
  return String(record[rowKey]);
}

function cellValue<RecordType extends object>(
  record: RecordType,
  column: DataTableColumn<RecordType>,
): unknown {
  if (column.dataIndex === undefined) return undefined;
  return record[column.dataIndex as keyof RecordType];
}

export const DataTable = defineComponent({
  name: 'FaceTheoryVueDataTable',
  props: {
    rowKey: {
      type: [String, Function] as unknown as PropType<
        RowKey<Record<string, unknown>>
      >,
      required: true,
    },
    dataSource: {
      type: Array as PropType<Array<Record<string, unknown>>>,
      required: true,
    },
    columns: {
      type: Array as PropType<Array<DataTableColumn<Record<string, unknown>>>>,
      required: true,
    },
    toolbar: {
      type: Object as PropType<DataTableToolbarSlots | undefined>,
      required: false,
    },
    emptyLabel: vnodeChildProp,
    rowActions: {
      type: Function as PropType<
        | ((record: Record<string, unknown>, index: number) => unknown)
        | undefined
      >,
      required: false,
    },
  },
  setup(props, { slots }) {
    return () => {
      const toolbar = props.toolbar;
      const toolbarLeft =
        slots['toolbar-left']?.() ?? renderPropContent(toolbar?.left);
      const toolbarCenter =
        slots['toolbar-center']?.() ?? renderPropContent(toolbar?.center);
      const toolbarRight =
        slots['toolbar-right']?.() ?? renderPropContent(toolbar?.right);
      const showToolbar =
        toolbarLeft.length > 0 ||
        toolbarCenter.length > 0 ||
        toolbarRight.length > 0;
      const hasRowActions =
        props.rowActions !== undefined || slots.rowActions !== undefined;

      return h(
        'div',
        {
          class: 'facetheory-stitch-data-table',
          style: {
            background: 'var(--stitch-color-surface-container-lowest, #ffffff)',
            borderRadius: 'var(--stitch-radius-lg, 12px)',
            overflow: 'hidden',
          },
        },
        [
          showToolbar
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-data-table-toolbar',
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '16px 24px',
                    background:
                      'var(--stitch-color-surface-container-low, #f2f3ff)',
                    borderTopLeftRadius: 'var(--stitch-radius-lg, 12px)',
                    borderTopRightRadius: 'var(--stitch-radius-lg, 12px)',
                  },
                },
                [
                  h('div', { style: { flex: 1, minWidth: 0 } }, toolbarLeft),
                  h(
                    'div',
                    {
                      style: {
                        display: 'flex',
                        justifyContent: 'center',
                        flex: 1,
                      },
                    },
                    toolbarCenter,
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
                    toolbarRight,
                  ),
                ],
              )
            : null,
          props.dataSource.length === 0
            ? h(
                'div',
                {
                  style: {
                    padding: '32px 24px',
                    textAlign: 'center',
                    color: 'var(--stitch-color-on-surface-variant, #464553)',
                  },
                },
                props.emptyLabel !== undefined
                  ? renderPropContent(props.emptyLabel)
                  : 'No records',
              )
            : h(
                'table',
                {
                  style: {
                    width: '100%',
                    borderCollapse: 'collapse',
                  },
                },
                [
                  h(
                    'thead',
                    null,
                    h(
                      'tr',
                      {
                        style: {
                          background:
                            'var(--stitch-color-surface-container, #eaedff)',
                        },
                      },
                      [
                        ...props.columns.map((column) =>
                          h(
                            'th',
                            {
                              key:
                                column.key ??
                                String(column.dataIndex ?? column.title),
                              style: {
                                textAlign: column.align ?? 'left',
                                padding: '12px 16px',
                                fontSize: '12px',
                                color:
                                  'var(--stitch-color-on-surface-variant, #464553)',
                              },
                            },
                            column.title as any,
                          ),
                        ),
                        hasRowActions
                          ? h(
                              'th',
                              {
                                style: { width: '80px', padding: '12px 16px' },
                              },
                              '',
                            )
                          : null,
                      ],
                    ),
                  ),
                  h(
                    'tbody',
                    null,
                    props.dataSource.map((record, index) =>
                      h('tr', { key: resolveRowKey(record, props.rowKey) }, [
                        ...props.columns.map((column) => {
                          const value = cellValue(record, column);
                          return h(
                            'td',
                            {
                              key:
                                column.key ??
                                String(column.dataIndex ?? column.title),
                              style: {
                                padding: '16px',
                                textAlign: column.align ?? 'left',
                                color:
                                  'var(--stitch-color-on-surface, #131b2e)',
                              },
                            },
                            column.render
                              ? column.render(value, record, index)
                              : (value as any),
                          );
                        }),
                        hasRowActions
                          ? h(
                              'td',
                              {
                                style: {
                                  padding: '16px',
                                  textAlign: 'right',
                                },
                              },
                              slots.rowActions?.({ record, index }) ??
                                (props.rowActions
                                  ? (props.rowActions(record, index) as any)
                                  : []),
                            )
                          : null,
                      ]),
                    ),
                  ),
                ],
              ),
        ],
      );
    };
  },
});
