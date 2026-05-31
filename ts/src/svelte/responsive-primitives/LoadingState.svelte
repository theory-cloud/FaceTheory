<script lang="ts">
  import {
    loadingStateClassName,
    spinnerClassName,
    spinnerSvgSize,
    type LoadingStateSize,
  } from '../../responsive-primitives/index.js';

  export let fullscreen = false;
  export let label = 'Loading';
  export let message: unknown = undefined;
  export let size: LoadingStateSize = 'md';
  let className = '';
  export { className as class };

  $: resolvedClass = loadingStateClassName({ className, fullscreen, label, message: String(message ?? ''), size });
  $: pixelSize = spinnerSvgSize(size);
  $: embeddedSpinnerClass = spinnerClassName({ size, tone: 'primary' });
</script>

<div
  {...$$restProps}
  class={resolvedClass}
  role="status"
  aria-live="polite"
  aria-busy="true"
  data-fullscreen={fullscreen ? 'true' : undefined}
>
  <div class="facetheory-rcp-loading-state__content">
    {#if $$slots.default}
      <slot />
    {:else if $$slots.spinner}
      <slot name="spinner" />
    {:else}
      <span class={embeddedSpinnerClass} role="status" aria-label={label} data-size={size} data-tone="primary">
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
    {/if}

    {#if $$slots.message || message !== undefined}
      <p class="facetheory-rcp-loading-state__message"><slot name="message">{message}</slot></p>
    {/if}
  </div>
</div>
