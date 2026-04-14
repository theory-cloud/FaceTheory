<script lang="ts">
  export let columns: number | 'auto' = 'auto';

  $: gridTemplateColumns =
    columns === 'auto'
      ? 'repeat(auto-fit, minmax(220px, 1fr))'
      : `repeat(${columns}, 1fr)`;
</script>

<div
  class="facetheory-stitch-summary-strip"
  style={`display:grid;grid-template-columns:${gridTemplateColumns};gap:16px;`}
>
  <slot />
</div>
