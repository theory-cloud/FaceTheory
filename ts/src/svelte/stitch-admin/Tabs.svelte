<script lang="ts">
  import type { TabItem } from './types.js';

  export let items: TabItem[] = [];
  export let activeKey: string | undefined = undefined;
  export let defaultActiveKey: string | undefined = undefined;
  export let onChange: ((key: string) => void) | undefined = undefined;
  export let variant: 'line' | 'card' = 'line';

  let internalActiveKey = defaultActiveKey;

  $: visibleItems = items.filter((item) => item.hidden !== true);
  $: if (
    activeKey === undefined &&
    internalActiveKey === undefined &&
    visibleItems.length > 0
  ) {
    internalActiveKey = visibleItems[0].key;
  }
  $: resolvedActiveKey = activeKey ?? internalActiveKey;

  function selectTab(item: TabItem): void {
    if (item.disabled) return;
    if (activeKey === undefined) internalActiveKey = item.key;
    onChange?.(item.key);
  }
</script>

<div
  class="facetheory-stitch-tabs"
  style="display:flex;flex-direction:column;gap:12px;"
>
  <div
    class="facetheory-stitch-tabs-bar"
    role="tablist"
    style={`display:flex;flex-wrap:wrap;gap:${variant === 'card' ? '8px' : '24px'};${variant === 'line' ? 'border-bottom:1px solid var(--stitch-color-outline-variant, #c8c4d5);' : ''}`}
  >
    {#each visibleItems as item (item.key)}
      <button
        type="button"
        role="tab"
        aria-selected={item.key === resolvedActiveKey}
        disabled={item.disabled === true}
        class="facetheory-stitch-tabs-trigger"
        on:click={() => selectTab(item)}
        style={`display:inline-flex;align-items:center;gap:8px;padding:${variant === 'card' ? '8px 12px' : '10px 0 12px'};${variant === 'line' ? 'margin-bottom:-1px;' : ''}${variant === 'card' ? 'border:1px solid var(--stitch-color-outline-variant, #c8c4d5);border-radius:var(--stitch-radius-md, 8px);' : 'border:none;'}${variant === 'line' ? `border-bottom:2px solid ${item.key === resolvedActiveKey ? 'var(--stitch-color-primary, #3a48c8)' : 'transparent'};` : ''}background:${variant === 'card' && item.key === resolvedActiveKey ? 'var(--stitch-color-surface-container-low, #f2f3ff)' : 'transparent'};color:${item.disabled ? 'var(--stitch-color-on-surface-variant, #868391)' : item.key === resolvedActiveKey ? 'var(--stitch-color-on-surface, #131b2e)' : 'var(--stitch-color-on-surface-variant, #464553)'};font:inherit;cursor:${item.disabled ? 'default' : 'pointer'};`}
      >
        <span
          class="facetheory-stitch-tabs-label"
          style="display:inline-flex;align-items:center;gap:8px;"
        >
          {#if item.icon !== undefined}
            <span
              class="facetheory-stitch-tabs-icon"
              style="display:inline-flex;align-items:center;"
            >
              {item.icon}
            </span>
          {/if}
          <span>{item.label}</span>
          {#if item.count !== undefined}
            <span
              class="facetheory-stitch-tabs-count"
              style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:18px;padding:0 6px;font-size:11px;font-weight:600;line-height:1;border-radius:9999px;background:var(--stitch-color-surface-container-high, #e2e7ff);color:var(--stitch-color-on-surface-variant, #464553);"
            >
              {item.count}
            </span>
          {/if}
        </span>
      </button>
    {/each}
  </div>

  {#if resolvedActiveKey !== undefined && $$slots.default}
    <div class="facetheory-stitch-tabs-panel">
      <slot />
    </div>
  {/if}
</div>
