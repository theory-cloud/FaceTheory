<script lang="ts">
  import {
    normalizeAsyncViewState,
    spinnerClassName,
    spinnerSvgSize,
    type AsyncViewStateStatus,
  } from '../../responsive-primitives/index.js';

  export let errorValue: unknown = undefined;
  export let loadingMessage: string | undefined = undefined;
  export let state: AsyncViewStateStatus;
  let className = '';
  export { className as class };

  $: descriptor = normalizeAsyncViewState({ error: errorValue, loadingMessage, status: state });
  $: embeddedSpinnerClass = spinnerClassName({ size: 'md', tone: 'primary' });
  $: pixelSize = spinnerSvgSize('md');
</script>

<section
  {...$$restProps}
  class={['facetheory-rcp-async-boundary', className].filter(Boolean).join(' ')}
  data-state={descriptor.status}
  aria-busy={descriptor.ariaBusy}
  aria-live={descriptor.status === 'loading' ? 'polite' : undefined}
  role={descriptor.status === 'error' ? 'alert' : undefined}
>
  {#if descriptor.status === 'loading'}
    {#if $$slots.loading}
      <slot name="loading" />
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
    <slot name="idle" />
  {:else if descriptor.status === 'empty'}
    <slot name="empty" />
  {:else if descriptor.status === 'error'}
    <slot name="error">Something went wrong.</slot>
  {:else}
    <slot />
  {/if}
</section>
