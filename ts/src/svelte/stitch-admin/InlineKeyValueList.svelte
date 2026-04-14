<script lang="ts">
  import type { KeyValueEntry } from './types.js';

  export let entries: KeyValueEntry[] = [];
  export let labelWidth: number | string = '48px';
  export let valueMono = true;

  $: labelWidthValue =
    typeof labelWidth === 'number' ? `${labelWidth}px` : labelWidth;
</script>

<dl
  class="facetheory-stitch-inline-key-value-list"
  style="margin:0;display:flex;flex-direction:column;gap:2px;"
>
  {#each entries as entry (entry.key)}
    <div
      class="facetheory-stitch-inline-key-value-list-row"
      style="display:flex;align-items:baseline;gap:8px;min-width:0;"
    >
      <dt
        style={`flex:0 0 ${labelWidthValue};margin:0;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--stitch-color-on-surface-variant, #464553);`}
      >
        {entry.label}
      </dt>
      <dd
        style={`margin:0;min-width:0;font-size:12px;font-family:${valueMono ? 'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)' : 'inherit'};color:var(--stitch-color-on-surface, #131b2e);overflow-wrap:anywhere;`}
      >
        {entry.value}
      </dd>
    </div>
  {/each}
</dl>
