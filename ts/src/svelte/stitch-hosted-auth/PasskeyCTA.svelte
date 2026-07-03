<script lang="ts">
  import { AUTH_SIGNATURE_GRADIENT_BACKGROUND } from '../../stitch-hosted-auth/index.js';
  import type { AuthPasskeyButtonType } from '../../stitch-hosted-auth/index.js';

  export let loading = false;
  export let disabled = false;
  export let onClick: ((event: MouseEvent) => void) | undefined = undefined;
  export let type: AuthPasskeyButtonType = 'button';
</script>

<button
  type={type}
  class="facetheory-stitch-passkey-cta"
  disabled={disabled || loading}
  aria-busy={loading ? 'true' : undefined}
  on:click={onClick}
  style={`width:100%;display:inline-flex;align-items:center;justify-content:center;gap:10px;background:${AUTH_SIGNATURE_GRADIENT_BACKGROUND};border:none;border-radius:9999px;height:48px;font-weight:600;font-size:15px;color:#ffffff;cursor:pointer;`}
>
  <slot name="icon" />
  {#if loading}
    Loading…
  {:else}
    <slot />
  {/if}
</button>
