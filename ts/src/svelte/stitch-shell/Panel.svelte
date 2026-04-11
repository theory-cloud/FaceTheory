<script lang="ts">
  export let padded = true;
  export let elevated = true;
</script>

<div
  class="facetheory-stitch-panel"
  style={`background:${
    elevated
      ? 'var(--stitch-color-surface-container-lowest, #ffffff)'
      : 'var(--stitch-color-surface-container-low, #f2f3ff)'
  };border-radius:var(--stitch-radius-xl, 16px);padding:${padded ? '24px' : '0'};`}
>
  <slot />
</div>
