<script lang="ts">
  import type {
    WizardAuthorityContextItem,
    WizardAuthorityContextItemTone,
    WizardAuthorityContextStrip,
    WizardAuthorityContextStripLayout,
    WizardAuthorityContextStripSize,
  } from './types.js';

  let {
    title = undefined,
    description = undefined,
    strip,
    onCopyItem = undefined,
  }: {
    title?: unknown;
    description?: unknown;
    strip: WizardAuthorityContextStrip;
    onCopyItem?: ((itemKey: string, copyValue: string) => void) | undefined;
  } = $props();

  const safeHrefBase = 'https://facetheory.invalid';

  function sanitizeHref(value: string | undefined | null): string | undefined {
    const normalized = String(value ?? '').trim();
    if (normalized.length === 0) return undefined;
    try {
      const parsed = new URL(normalized, safeHrefBase);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? normalized : undefined;
    } catch {
      return undefined;
    }
  }

  function copyValueFor(item: WizardAuthorityContextItem): string | undefined {
    if (item.copyValue !== undefined) return item.copyValue;
    if (typeof item.value === 'string') return item.value;
    return undefined;
  }

  function tone(item: WizardAuthorityContextItem): WizardAuthorityContextItemTone {
    return item.tone ?? 'neutral';
  }

  const layout = $derived((strip.layout ?? 'auto') as WizardAuthorityContextStripLayout);
  const size = $derived((strip.size ?? 'md') as WizardAuthorityContextStripSize);
  const wrap = $derived(strip.wrap !== false);
  const itemCount = $derived(strip.items.length);
  const ariaLabel = $derived(typeof title === 'string' ? title : 'Server-resolved context');
</script>

<section
  class={`facetheory-stitch-wizard-authority-context-strip facetheory-stitch-wizard-authority-context-strip-layout-${layout} facetheory-stitch-wizard-authority-context-strip-size-${size}`}
  data-safety-policy={strip.safetyPolicy}
  data-layout={layout}
  data-size={size}
  data-wrap={wrap ? 'true' : 'false'}
  data-item-count={String(itemCount)}
  data-read-only={strip.readOnlyLabel !== undefined ? 'true' : 'false'}
  data-has-authority-label={strip.authorityLabel !== undefined ? 'true' : 'false'}
  role="region"
  aria-label={ariaLabel}
>
  {#if title !== undefined || description !== undefined || strip.authorityLabel !== undefined || strip.readOnlyLabel !== undefined || strip.actions !== undefined}
    <header class="facetheory-stitch-wizard-authority-context-strip-header">
      <div>
        {#if title !== undefined}<h2>{title}</h2>{/if}
        {#if description !== undefined}<p>{description}</p>{/if}
        {#if strip.authorityLabel !== undefined || strip.readOnlyLabel !== undefined}
          <div class="facetheory-stitch-wizard-authority-context-strip-status">
            {#if strip.authorityLabel !== undefined}
              <span
                class="facetheory-stitch-wizard-authority-context-strip-authority"
                data-authority-label="true"
              >{strip.authorityLabel}</span>
            {/if}
            {#if strip.readOnlyLabel !== undefined}
              <span
                class="facetheory-stitch-wizard-authority-context-strip-readonly"
                data-read-only-label="true"
                aria-label="Read-only"
              >{strip.readOnlyLabel}</span>
            {/if}
          </div>
        {/if}
      </div>
      {#if strip.actions !== undefined}
        <div class="facetheory-stitch-wizard-authority-context-strip-actions">
          {strip.actions}
        </div>
      {/if}
    </header>
  {/if}

  {#if itemCount > 0}
    <dl class="facetheory-stitch-wizard-authority-context-strip-items">
      {#each strip.items as item (item.key)}
        {@const itemTone = tone(item)}
        {@const copyVal = copyValueFor(item)}
        {@const showCopy = item.copyable === true && copyVal !== undefined}
        {@const href = sanitizeHref(item.href)}
        <div
          class={`facetheory-stitch-wizard-authority-context-strip-item facetheory-stitch-wizard-authority-context-strip-item-tone-${itemTone}`}
          data-item-key={item.key}
          data-item-tone={itemTone}
          data-item-copyable={showCopy ? 'true' : 'false'}
        >
          <dt class="facetheory-stitch-wizard-authority-context-strip-item-label">
            {#if item.icon !== undefined}
              <span
                class="facetheory-stitch-wizard-authority-context-strip-item-icon"
                aria-hidden="true"
              >{item.icon}</span>
            {/if}
            <span class="facetheory-stitch-wizard-authority-context-strip-item-label-text">{item.label}</span>
            {#if item.badge !== undefined}
              <span class="facetheory-stitch-wizard-authority-context-strip-item-badge">{item.badge}</span>
            {/if}
          </dt>
          <dd
            class="facetheory-stitch-wizard-authority-context-strip-item-value"
            title={item.title}
          >
            {#if href !== undefined}
              <a
                {href}
                class="facetheory-stitch-wizard-authority-context-strip-item-value-link"
              >{item.value}</a>
            {:else}
              <span class="facetheory-stitch-wizard-authority-context-strip-item-value-text">{item.value}</span>
            {/if}
            {#if showCopy && copyVal !== undefined}
              <button
                type="button"
                class="facetheory-stitch-wizard-authority-context-strip-item-copy"
                aria-label={`Copy ${typeof item.label === 'string' ? item.label : `item ${item.key}`}`}
                data-copy-item-key={item.key}
                data-copy-value={copyVal}
                onclick={() => onCopyItem?.(item.key, copyVal)}
              >Copy</button>
            {/if}
          </dd>
        </div>
      {/each}
    </dl>
  {:else}
    <div class="facetheory-stitch-wizard-authority-context-strip-empty" role="status">
      {strip.emptyLabel ?? 'No server-resolved context available.'}
    </div>
  {/if}
  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={strip.safetyPolicy}
  >Safety policy: {strip.safetyPolicy}</p>
</section>
