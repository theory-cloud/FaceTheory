<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { CalloutVariant } from '../../stitch-shell/callout-types.js';

  let {
    variant = 'info',
    title = undefined,
    icon = undefined,
    actions = undefined,
    children,
  }: {
    variant?: CalloutVariant;
    title?: unknown;
    icon?: unknown;
    actions?: unknown;
    children?: Snippet;
  } = $props();

  const palette: Record<
    CalloutVariant,
    { accent: string; background: string; color: string }
  > = {
    info: {
      accent: 'var(--stitch-color-primary, #3a48c8)',
      background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
      color: 'var(--stitch-color-on-surface, #131b2e)',
    },
    success: {
      accent: 'var(--stitch-color-tertiary, #00332e)',
      background: 'var(--stitch-color-tertiary-container, #004c45)',
      color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    },
    warning: {
      accent: 'var(--stitch-color-secondary, #6d5e0f)',
      background: 'var(--stitch-color-secondary-container, #ffecc0)',
      color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    },
    danger: {
      accent: 'var(--stitch-color-error, #ba1a1a)',
      background: 'var(--stitch-color-error-container, #ffdad6)',
      color: 'var(--stitch-color-on-error-container, #93000a)',
    },
  };

  const current = $derived(palette[variant]);
  const role = $derived(
    variant === 'danger' || variant === 'warning' ? 'alert' : 'note',
  );

  // `icon` and `actions` accept either a value (rendered as text) or a snippet
  // (rendered as markup, e.g. a button/link filled via `{#snippet actions()}`).
  const iconNode = $derived(
    typeof icon === 'function' ? (icon as Snippet) : undefined,
  );
  const actionsNode = $derived(
    typeof actions === 'function' ? (actions as Snippet) : undefined,
  );
</script>

<div
  class={`facetheory-stitch-callout facetheory-stitch-callout-${variant}`}
  role={role}
  style={`display:flex;gap:12px;padding:12px 16px;border-left:3px solid ${current.accent};background:${current.background};color:${current.color};border-top-right-radius:var(--stitch-radius-md, 8px);border-bottom-right-radius:var(--stitch-radius-md, 8px);`}
>
  {#if icon !== undefined}
    <span
      class="facetheory-stitch-callout-icon"
      aria-hidden="true"
      style={`flex-shrink:0;display:inline-flex;align-items:center;color:${current.accent};font-size:18px;line-height:1;margin-top:2px;`}
    >
      {#if iconNode}{@render iconNode()}{:else}{icon}{/if}
    </span>
  {/if}

  <div
    class="facetheory-stitch-callout-body"
    style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;"
  >
    {#if title !== undefined}
      <p
        class="facetheory-stitch-callout-title"
        style="margin:0;font-size:13px;font-weight:600;color:inherit;"
      >
        {title}
      </p>
    {/if}

    {#if children}
      <div
        class="facetheory-stitch-callout-content"
        style="font-size:13px;line-height:1.5;color:inherit;"
      >
        {@render children()}
      </div>
    {/if}
  </div>

  {#if actions !== undefined}
    <div
      class="facetheory-stitch-callout-actions"
      style="flex-shrink:0;display:flex;align-items:center;gap:8px;"
    >
      {#if actionsNode}{@render actionsNode()}{:else}{actions}{/if}
    </div>
  {/if}
</div>
