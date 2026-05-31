<script lang="ts">
  import {
    buttonClassName,
    spinnerClassName,
    spinnerSvgSize,
    suppressButtonActivation,
    type ButtonSize,
    type ButtonVariant,
    type LoadingPlacement,
  } from '../../responsive-primitives/index.js';

  export let disabled = false;
  export let loading = false;
  export let loadingAnnouncement: unknown = 'Loading';
  export let loadingPlacement: LoadingPlacement = 'replace-prefix';
  export let onclick: ((event: MouseEvent) => void) | undefined = undefined;
  export let size: ButtonSize = 'md';
  export let type: 'button' | 'submit' | 'reset' = 'button';
  export let variant: ButtonVariant = 'primary';
  let className = '';
  export { className as class };

  $: blocked = disabled || loading;
  $: resolvedClass = buttonClassName({
    className,
    disabled,
    loading,
    loadingPlacement,
    size,
    variant,
  });
  $: spinnerSize = size === 'lg' ? 'sm' : 'xs';
  $: embeddedSpinnerClass = spinnerClassName({ size: spinnerSize, tone: 'current' });
  $: pixelSize = spinnerSvgSize(spinnerSize);

  function handleClick(event: MouseEvent): void {
    if (blocked) {
      suppressButtonActivation(event);
      return;
    }
    onclick?.(event);
  }
</script>


<button
  {...$$restProps}
  class={resolvedClass}
  {type}
  disabled={blocked}
  aria-disabled={blocked}
  aria-busy={loading ? 'true' : undefined}
  data-loading={loading ? 'true' : undefined}
  onclick={handleClick}
>
  {#if loading && loadingPlacement === 'prepend'}
    <span class="facetheory-rcp-button__spinner facetheory-rcp-button__spinner--prepend" aria-hidden="true">
      {#if $$slots.spinner}
        <slot name="spinner" />
      {:else}
        <span class={embeddedSpinnerClass} role="status" aria-label="Loading" data-size={spinnerSize} data-tone="current">
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
          <span class="facetheory-rcp-visually-hidden">Loading</span>
        </span>
      {/if}
    </span>
  {/if}

  {#if loading && loadingPlacement === 'replace-prefix'}
    <span class="facetheory-rcp-button__spinner facetheory-rcp-button__spinner--prefix" aria-hidden="true">
      {#if $$slots.spinner}
        <slot name="spinner" />
      {:else}
        <span class={embeddedSpinnerClass} role="status" aria-label="Loading" data-size={spinnerSize} data-tone="current">
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
          <span class="facetheory-rcp-visually-hidden">Loading</span>
        </span>
      {/if}
    </span>
  {:else if $$slots.prefix}
    <span class="facetheory-rcp-button__prefix"><slot name="prefix" /></span>
  {/if}

  <span class="facetheory-rcp-button__content"><slot /></span>

  {#if loading && loadingPlacement === 'append'}
    <span class="facetheory-rcp-button__spinner facetheory-rcp-button__spinner--append" aria-hidden="true">
      {#if $$slots.spinner}
        <slot name="spinner" />
      {:else}
        <span class={embeddedSpinnerClass} role="status" aria-label="Loading" data-size={spinnerSize} data-tone="current">
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
          <span class="facetheory-rcp-visually-hidden">Loading</span>
        </span>
      {/if}
    </span>
  {:else if $$slots.suffix}
    <span class="facetheory-rcp-button__suffix"><slot name="suffix" /></span>
  {/if}

  {#if loading}
    <span class="facetheory-rcp-visually-hidden" role="status" aria-live="polite">{loadingAnnouncement}</span>
  {/if}
</button>
