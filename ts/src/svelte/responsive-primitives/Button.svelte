<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    buttonClassName,
    spinnerClassName,
    spinnerSvgSize,
    suppressButtonActivation,
    type ButtonSize,
    type ButtonVariant,
    type LoadingPlacement,
  } from '../../responsive-primitives/index.js';

  let {
    disabled = false,
    loading = false,
    loadingAnnouncement = 'Loading',
    loadingPlacement = 'replace-prefix',
    onclick = undefined,
    size = 'md',
    type = 'button',
    variant = 'primary',
    class: className = '',
    spinner,
    prefix,
    suffix,
    children,
    ...rest
  }: {
    disabled?: boolean;
    loading?: boolean;
    loadingAnnouncement?: unknown;
    loadingPlacement?: LoadingPlacement;
    onclick?: ((event: MouseEvent) => void) | undefined;
    size?: ButtonSize;
    type?: 'button' | 'submit' | 'reset';
    variant?: ButtonVariant;
    class?: string;
    spinner?: Snippet;
    prefix?: Snippet;
    suffix?: Snippet;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();

  const blocked = $derived(disabled || loading);
  const resolvedClass = $derived(
    buttonClassName({
      className,
      disabled,
      loading,
      loadingPlacement,
      size,
      variant,
    }),
  );
  const spinnerSize = $derived(size === 'lg' ? 'sm' : 'xs');
  const embeddedSpinnerClass = $derived(
    spinnerClassName({ size: spinnerSize, tone: 'current' }),
  );
  const pixelSize = $derived(spinnerSvgSize(spinnerSize));

  function handleClick(event: MouseEvent): void {
    if (blocked) {
      suppressButtonActivation(event);
      return;
    }
    onclick?.(event);
  }
</script>


<button
  {...rest}
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
      {#if spinner}
        {@render spinner()}
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
      {#if spinner}
        {@render spinner()}
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
  {:else if prefix}
    <span class="facetheory-rcp-button__prefix">{@render prefix()}</span>
  {/if}

  <span class="facetheory-rcp-button__content">{@render children?.()}</span>

  {#if loading && loadingPlacement === 'append'}
    <span class="facetheory-rcp-button__spinner facetheory-rcp-button__spinner--append" aria-hidden="true">
      {#if spinner}
        {@render spinner()}
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
  {:else if suffix}
    <span class="facetheory-rcp-button__suffix">{@render suffix()}</span>
  {/if}

  {#if loading}
    <span class="facetheory-rcp-visually-hidden" role="status" aria-live="polite">{loadingAnnouncement}</span>
  {/if}
</button>
