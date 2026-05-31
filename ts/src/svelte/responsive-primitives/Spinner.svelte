<script lang="ts">
  import {
    spinnerClassName,
    spinnerSvgSize,
    type SpinnerSize,
    type SpinnerTone,
  } from '../../responsive-primitives/index.js';

  export let label = 'Loading';
  export let size: SpinnerSize = 'md';
  export let tone: SpinnerTone = 'primary';
  let className = '';
  export { className as class };

  $: pixelSize = spinnerSvgSize(size);
  $: resolvedClass = spinnerClassName({ className, size, tone });
</script>

<span
  {...$$restProps}
  class={resolvedClass}
  role="status"
  aria-label={label}
  data-size={size}
  data-tone={tone}
>
  <svg
    class="facetheory-rcp-spinner__glyph"
    width={pixelSize}
    height={pixelSize}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
  <span class="facetheory-rcp-visually-hidden">{label}</span>
</span>
