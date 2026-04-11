<script lang="ts">
  export let loading = false;
  export let disabled = false;
  export let onClick: ((event: MouseEvent) => void) | undefined = undefined;
  export let type: 'button' | 'submit' = 'button';
</script>

<button
  type={type}
  class="facetheory-stitch-passkey-cta"
  disabled={disabled || loading}
  aria-busy={loading ? 'true' : undefined}
  on:click={onClick}
  style="width:100%;display:inline-flex;align-items:center;justify-content:center;gap:10px;background:linear-gradient(135deg, var(--stitch-color-primary, #1f108e) 0%, var(--stitch-color-primary-container, #3730a3) 100%);border:none;border-radius:9999px;height:48px;font-weight:600;font-size:15px;color:#ffffff;cursor:pointer;"
>
  <slot name="icon" />
  {#if loading}
    Loading…
  {:else}
    <slot />
  {/if}
</button>
