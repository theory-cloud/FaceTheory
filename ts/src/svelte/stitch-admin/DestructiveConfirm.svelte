<script lang="ts">
  export let title: unknown;
  export let description: unknown = undefined;
  export let requireText: string | undefined = undefined;
  export let confirmLabel: unknown = undefined;
  export let cancelLabel: unknown = undefined;
  export let onCancel: (() => void) | undefined = undefined;
  export let onConfirm: (() => void) | undefined = undefined;
  export let loading = false;

  let typed = '';

  $: confirmable = requireText === undefined || typed === requireText;
</script>

<div
  class="facetheory-stitch-destructive-confirm"
  style="display:flex;flex-direction:column;gap:16px;padding:4px 0;"
>
  <div style="display:flex;flex-direction:column;gap:6px;">
    <h2 style="margin:0;font-size:18px;color:var(--stitch-color-on-surface, #131b2e);">
      {title}
    </h2>
    {#if description !== undefined}
      <p
        style="margin:0;font-size:14px;line-height:1.5;color:var(--stitch-color-on-surface-variant, #464553);"
      >
        {description}
      </p>
    {/if}
  </div>

  {#if requireText !== undefined}
    <div style="display:flex;flex-direction:column;gap:6px;">
      <label
        style="font-size:12px;color:var(--stitch-color-on-surface-variant, #464553);"
      >
        Type "{requireText}" to confirm
      </label>
      <input
        bind:value={typed}
        placeholder={requireText}
        aria-label={`Type ${requireText} to confirm`}
        style="padding:10px 12px;border-radius:var(--stitch-radius-md, 6px);border:1px solid var(--stitch-color-outline-variant, #c8c4d5);"
      />
    </div>
  {/if}

  <div
    style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;"
  >
    <button
      type="button"
      disabled={loading}
      on:click={onCancel}
      style="padding:10px 14px;border-radius:var(--stitch-radius-md, 6px);border:1px solid var(--stitch-color-outline-variant, #c8c4d5);background:transparent;cursor:pointer;"
    >
      {#if cancelLabel !== undefined}
        {cancelLabel}
      {:else}
        Cancel
      {/if}
    </button>
    <button
      type="button"
      disabled={!confirmable || loading}
      on:click={onConfirm}
      style="padding:10px 14px;border-radius:var(--stitch-radius-md, 6px);border:none;background:var(--stitch-color-error, #ba1a1a);color:#ffffff;cursor:pointer;"
    >
      {#if loading}
        Loading…
      {:else if confirmLabel !== undefined}
        {confirmLabel}
      {:else}
        Delete
      {/if}
    </button>
  </div>
</div>
