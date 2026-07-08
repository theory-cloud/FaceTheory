<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    authStateClassName,
    authStateRole,
    authStateVariantPalette,
  } from '../../stitch-hosted-auth/index.js';
  import type { AuthStateVariant } from '../../stitch-hosted-auth/index.js';

  let {
    variant = 'info',
    title,
    description = undefined,
    icon,
    actions,
  }: {
    variant?: AuthStateVariant;
    title?: unknown;
    description?: unknown;
    icon?: Snippet;
    actions?: Snippet;
  } = $props();

  const palette = $derived(authStateVariantPalette(variant));
</script>

<div
  class={authStateClassName(variant)}
  role={authStateRole(variant)}
  style={`width:100%;max-width:440px;background:${palette.surface};color:${palette.text};border-radius:var(--stitch-radius-xl, 16px);padding:40px;display:flex;flex-direction:column;gap:16px;align-items:center;text-align:center;box-shadow:0 24px 48px -12px rgba(19, 27, 46, 0.04);`}
>
  <div
    aria-hidden="true"
    style={`width:48px;height:48px;border-radius:9999px;background:var(--stitch-color-surface-container-low, #f2f3ff);color:${palette.accent};display:flex;align-items:center;justify-content:center;font-size:22px;`}
  >
    {@render icon?.()}
  </div>

  <h1
    style='margin:0;font-size:22px;line-height:1.2;font-family:var(--stitch-font-display, "Space Grotesk"), system-ui, sans-serif;'
  >
    {title}
  </h1>

  {#if description !== undefined}
    <p style="margin:0;font-size:14px;line-height:1.5;">{description}</p>
  {/if}

  <div
    class="facetheory-stitch-auth-state-actions"
    style="display:flex;gap:12px;margin-top:8px;justify-content:center;flex-wrap:wrap;"
  >
    {@render actions?.()}
  </div>
</div>
