<script lang="ts">
  import type { PropertyItem } from './types.js';

  export let items: PropertyItem[] = [];
  export let columns = 2;
</script>

<dl
  class="facetheory-stitch-property-grid"
  style={`display:grid;grid-template-columns:repeat(${columns}, minmax(0, 1fr));column-gap:24px;row-gap:16px;margin:0;`}
>
  {#each items as item (item.key)}
    <div
      style={`grid-column:${item.span === 'full' ? `1 / span ${columns}` : 'auto'};display:flex;flex-direction:column;gap:4px;min-width:0;`}
    >
      <dt
        style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--stitch-color-on-surface-variant, #464553);margin:0;"
      >
        {item.label}
      </dt>
      <dd
        style="margin:0;font-size:14px;color:var(--stitch-color-on-surface, #131b2e);word-break:break-word;"
      >
        {item.value}
      </dd>
    </div>
  {/each}
</dl>
