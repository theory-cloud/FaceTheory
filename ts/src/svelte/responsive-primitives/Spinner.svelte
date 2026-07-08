<script lang="ts">
  import {
    spinnerClassName,
    spinnerSvgSize,
    type SpinnerSize,
    type SpinnerTone,
  } from '../../responsive-primitives/index.js';

  let {
    label = 'Loading',
    size = 'md',
    tone = 'primary',
    class: className = '',
    ...rest
  }: {
    label?: string;
    size?: SpinnerSize;
    tone?: SpinnerTone;
    class?: string;
    [key: string]: unknown;
  } = $props();

  const pixelSize = $derived(spinnerSvgSize(size));
  const resolvedClass = $derived(spinnerClassName({ className, size, tone }));
</script>

<span
  {...rest}
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
