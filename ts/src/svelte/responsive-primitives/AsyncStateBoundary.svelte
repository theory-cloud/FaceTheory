<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    normalizeAsyncViewState,
    spinnerClassName,
    spinnerSvgSize,
    type AsyncViewStateStatus,
  } from '../../responsive-primitives/index.js';

  let {
    errorValue = undefined,
    loadingMessage = undefined,
    state,
    class: className = '',
    loading,
    idle,
    empty,
    error,
    children,
    ...rest
  }: {
    errorValue?: unknown;
    loadingMessage?: string | undefined;
    state: AsyncViewStateStatus;
    class?: string;
    loading?: Snippet;
    idle?: Snippet;
    empty?: Snippet;
    error?: Snippet;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();

  const descriptor = $derived(
    normalizeAsyncViewState({ error: errorValue, loadingMessage, status: state }),
  );
  const embeddedSpinnerClass = $derived(
    spinnerClassName({ size: 'md', tone: 'primary' }),
  );
  const pixelSize = $derived(spinnerSvgSize('md'));
</script>

<section
  {...rest}
  class={['facetheory-rcp-async-boundary', className].filter(Boolean).join(' ')}
  data-state={descriptor.status}
  aria-busy={descriptor.ariaBusy}
  aria-live={descriptor.status === 'loading' ? 'polite' : undefined}
  role={descriptor.status === 'error' ? 'alert' : undefined}
>
  {#if descriptor.status === 'loading'}
    {#if loading}
      {@render loading()}
    {:else}
      <div class="facetheory-rcp-loading-state" role="status" aria-live="polite" aria-busy="true">
        <div class="facetheory-rcp-loading-state__content">
          <span class={embeddedSpinnerClass} role="status" aria-label="Loading" data-size="md" data-tone="primary">
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
          <p class="facetheory-rcp-loading-state__message">{descriptor.loadingMessage ?? 'Loading…'}</p>
        </div>
      </div>
    {/if}
  {:else if descriptor.status === 'idle'}
    {@render idle?.()}
  {:else if descriptor.status === 'empty'}
    {@render empty?.()}
  {:else if descriptor.status === 'error'}
    {#if error}{@render error()}{:else}Something went wrong.{/if}
  {:else}
    {@render children?.()}
  {/if}
</section>
