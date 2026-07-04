<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    loadingStateClassName,
    spinnerClassName,
    spinnerSvgSize,
    type LoadingStateSize,
  } from '../../responsive-primitives/index.js';

  let {
    fullscreen = false,
    label = 'Loading',
    message = undefined,
    size = 'md',
    class: className = '',
    spinner,
    children,
    ...rest
  }: {
    fullscreen?: boolean;
    label?: string;
    message?: unknown;
    size?: LoadingStateSize;
    class?: string;
    spinner?: Snippet;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();

  const resolvedClass = $derived(
    loadingStateClassName({
      className,
      fullscreen,
      label,
      message: String(message ?? ''),
      size,
    }),
  );
  const pixelSize = $derived(spinnerSvgSize(size));
  const embeddedSpinnerClass = $derived(spinnerClassName({ size, tone: 'primary' }));
</script>

<div
  {...rest}
  class={resolvedClass}
  role="status"
  aria-live="polite"
  aria-busy="true"
  data-fullscreen={fullscreen ? 'true' : undefined}
>
  <div class="facetheory-rcp-loading-state__content">
    {#if children}
      {@render children()}
    {:else if spinner}
      {@render spinner()}
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

    {#if message !== undefined}
      <p class="facetheory-rcp-loading-state__message">{message}</p>
    {/if}
  </div>
</div>
