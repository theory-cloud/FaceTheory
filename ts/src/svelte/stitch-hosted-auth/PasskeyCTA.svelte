<script lang="ts">
  import type { Snippet } from 'svelte';
  import { AUTH_SIGNATURE_GRADIENT_BACKGROUND } from '../../stitch-hosted-auth/index.js';
  import type { AuthPasskeyButtonType } from '../../stitch-hosted-auth/index.js';

  let {
    loading = false,
    disabled = false,
    onClick = undefined,
    type = 'button',
    icon,
    children,
  }: {
    loading?: boolean;
    disabled?: boolean;
    onClick?: ((event: MouseEvent) => void) | undefined;
    type?: AuthPasskeyButtonType;
    icon?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<button
  type={type}
  class="facetheory-stitch-passkey-cta"
  disabled={disabled || loading}
  aria-busy={loading ? 'true' : undefined}
  onclick={onClick}
  style={`width:100%;display:inline-flex;align-items:center;justify-content:center;gap:10px;background:${AUTH_SIGNATURE_GRADIENT_BACKGROUND};border:none;border-radius:9999px;height:48px;font-weight:600;font-size:15px;color:#ffffff;cursor:pointer;`}
>
  {@render icon?.()}
  {#if loading}
    Loading…
  {:else}
    {@render children?.()}
  {/if}
</button>
