<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    authConsentItemBackground,
    authConsentItemOpacity,
  } from '../../stitch-hosted-auth/index.js';

  let {
    label,
    description = undefined,
    granted = false,
    icon,
  }: {
    label?: unknown;
    description?: unknown;
    granted?: boolean;
    icon?: Snippet;
  } = $props();
</script>

<li
  class="facetheory-stitch-consent-item"
  style={`display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:${authConsentItemBackground(granted)};border-radius:var(--stitch-radius-md, 6px);opacity:${authConsentItemOpacity(granted)};`}
>
  <span
    aria-hidden="true"
    style="font-size:18px;color:var(--stitch-color-primary, #1f108e);flex-shrink:0;margin-top:2px;"
  >
    {@render icon?.()}
  </span>

  <div style="display:flex;flex-direction:column;gap:2px;flex:1;">
    <span
      style="font-size:14px;font-weight:500;color:var(--stitch-color-on-surface, #131b2e);"
    >
      {label}
    </span>
    {#if description !== undefined}
      <span
        style="font-size:12px;color:var(--stitch-color-on-surface-variant, #464553);"
      >
        {description}
      </span>
    {/if}
  </div>
</li>
