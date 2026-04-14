<script lang="ts">
  import type { LogEntry, LogLevel } from './types.js';

  export let entries: LogEntry[] = [];
  export let variant: 'plain' | 'terminal' = 'plain';
  export let title: unknown = undefined;
  export let formatTimestamp:
    | ((value: string | number) => string)
    | undefined = undefined;
  export let maxHeight: number | string = '240px';

  const levelColor: Record<LogLevel, string> = {
    debug: 'var(--stitch-color-on-surface-variant, #464553)',
    info: 'var(--stitch-color-on-surface, #131b2e)',
    success: 'var(--stitch-color-tertiary, #00332e)',
    warn: 'var(--stitch-color-secondary, #6d5e0f)',
    error: 'var(--stitch-color-error, #ba1a1a)',
  };

  function defaultFormatTimestamp(value: string | number): string {
    if (typeof value === 'string') return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  $: format = formatTimestamp ?? defaultFormatTimestamp;
  $: maxHeightValue =
    typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;
</script>

{#if variant === 'terminal'}
  <div
    class="facetheory-stitch-log-stream facetheory-stitch-log-stream-terminal"
    style="background:var(--stitch-color-surface-container-lowest, #ffffff);border-radius:var(--stitch-radius-md, 8px);overflow:hidden;font-family:var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace);"
  >
    <div
      class="facetheory-stitch-log-stream-chrome"
      style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--stitch-color-surface-container-high, #e2e7ff);color:var(--stitch-color-on-surface-variant, #464553);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;"
    >
      <span
        aria-hidden="true"
        style="width:8px;height:8px;border-radius:9999px;background:var(--stitch-color-error, #ba1a1a);"
      />
      <span
        aria-hidden="true"
        style="width:8px;height:8px;border-radius:9999px;background:var(--stitch-color-secondary, #6d5e0f);"
      />
      <span
        aria-hidden="true"
        style="width:8px;height:8px;border-radius:9999px;background:var(--stitch-color-tertiary, #00332e);"
      />
      {#if title !== undefined}
        <span style="margin-left:8px;">{title}</span>
      {/if}
    </div>

    <div
      class="facetheory-stitch-log-stream-body"
      style={`padding:12px 16px;max-height:${maxHeightValue};overflow-y:auto;`}
    >
      {#each entries as entry (entry.id)}
        <div
          class={`facetheory-stitch-log-stream-row facetheory-stitch-log-stream-row-${entry.level}`}
          style={`display:flex;gap:12px;align-items:baseline;padding:2px 0;color:${levelColor[entry.level]};font-size:12px;line-height:1.5;font-variant-numeric:tabular-nums;`}
        >
          <span
            class="facetheory-stitch-log-stream-timestamp"
            style="flex-shrink:0;color:var(--stitch-color-on-surface-variant, #464553);font-family:var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace);"
          >
            {format(entry.timestamp)}
          </span>
          {#if entry.actor !== undefined}
            <span
              class="facetheory-stitch-log-stream-actor"
              style="flex-shrink:0;font-weight:600;color:var(--stitch-color-on-surface-variant, #464553);"
            >
              {entry.actor}
            </span>
          {/if}
          <span
            class="facetheory-stitch-log-stream-message"
            style="min-width:0;overflow-wrap:anywhere;"
          >
            {entry.message}
          </span>
        </div>
      {/each}
    </div>
  </div>
{:else}
  <div
    class="facetheory-stitch-log-stream facetheory-stitch-log-stream-plain"
    style="display:flex;flex-direction:column;gap:2px;"
  >
    {#if title !== undefined}
      <div
        class="facetheory-stitch-log-stream-title"
        style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--stitch-color-on-surface-variant, #464553);margin-bottom:4px;"
      >
        {title}
      </div>
    {/if}

    {#each entries as entry (entry.id)}
      <div
        class={`facetheory-stitch-log-stream-row facetheory-stitch-log-stream-row-${entry.level}`}
        style={`display:flex;gap:12px;align-items:baseline;padding:2px 0;color:${levelColor[entry.level]};font-size:12px;line-height:1.5;font-variant-numeric:tabular-nums;`}
      >
        <span
          class="facetheory-stitch-log-stream-timestamp"
          style="flex-shrink:0;color:var(--stitch-color-on-surface-variant, #464553);font-family:var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace);"
        >
          {format(entry.timestamp)}
        </span>
        {#if entry.actor !== undefined}
          <span
            class="facetheory-stitch-log-stream-actor"
            style="flex-shrink:0;font-weight:600;color:var(--stitch-color-on-surface-variant, #464553);"
          >
            {entry.actor}
          </span>
        {/if}
        <span
          class="facetheory-stitch-log-stream-message"
          style="min-width:0;overflow-wrap:anywhere;"
        >
          {entry.message}
        </span>
      </div>
    {/each}
  </div>
{/if}
