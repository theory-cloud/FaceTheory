<script lang="ts">
  import type { DataTableColumn } from './types.js';

  export let rowKey: string | ((record: Record<string, unknown>) => string);
  export let dataSource: Array<Record<string, unknown>> = [];
  export let columns: Array<DataTableColumn<Record<string, unknown>>> = [];
  export let emptyLabel: unknown = undefined;

  function resolveRowKey(record: Record<string, unknown>): string {
    if (typeof rowKey === 'function') return rowKey(record);
    return String(record[rowKey]);
  }

  function cellValue(
    record: Record<string, unknown>,
    column: DataTableColumn<Record<string, unknown>>,
  ): unknown {
    if (column.dataIndex === undefined) return undefined;
    return record[column.dataIndex as keyof typeof record];
  }
</script>

<div
  class="facetheory-stitch-data-table"
  style="background:var(--stitch-color-surface-container-lowest, #ffffff);border-radius:var(--stitch-radius-lg, 12px);overflow:hidden;"
>
  <div
    class="facetheory-stitch-data-table-toolbar"
    style="display:flex;align-items:center;gap:16px;padding:16px 24px;background:var(--stitch-color-surface-container-low, #f2f3ff);border-top-left-radius:var(--stitch-radius-lg, 12px);border-top-right-radius:var(--stitch-radius-lg, 12px);"
  >
    <div style="flex:1;min-width:0;"><slot name="toolbar-left" /></div>
    <div style="display:flex;justify-content:center;flex:1;"><slot name="toolbar-center" /></div>
    <div
      style="display:flex;justify-content:flex-end;gap:8px;flex:1;"
    ><slot name="toolbar-right" /></div>
  </div>

  {#if dataSource.length === 0}
    <div
      style="padding:32px 24px;text-align:center;color:var(--stitch-color-on-surface-variant, #464553);"
    >
      {#if emptyLabel !== undefined}
        {emptyLabel}
      {:else}
        No records
      {/if}
    </div>
  {:else}
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:var(--stitch-color-surface-container, #eaedff);">
          {#each columns as column}
            <th
              style={`text-align:${column.align ?? 'left'};padding:12px 16px;font-size:12px;color:var(--stitch-color-on-surface-variant, #464553);`}
            >
              {column.title}
            </th>
          {/each}
          <th style="width:80px;padding:12px 16px;"></th>
        </tr>
      </thead>
      <tbody>
        {#each dataSource as record, index (resolveRowKey(record))}
          <tr>
            {#each columns as column}
              <td
                style={`padding:16px;text-align:${column.align ?? 'left'};color:var(--stitch-color-on-surface, #131b2e);`}
              >
                {#if column.render}
                  {column.render(cellValue(record, column), record, index)}
                {:else}
                  {cellValue(record, column)}
                {/if}
              </td>
            {/each}
            <td style="padding:16px;text-align:right;">
              <slot name="rowActions" {record} {index} />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
