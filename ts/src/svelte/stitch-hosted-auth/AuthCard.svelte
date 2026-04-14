<script lang="ts">
  export let title: unknown;
  export let description: unknown = undefined;
</script>

<div
  class="facetheory-stitch-auth-card"
  style="width:100%;max-width:440px;background:var(--stitch-color-surface-container-lowest, #ffffff);border-radius:var(--stitch-radius-xl, 16px);padding:40px;display:flex;flex-direction:column;gap:24px;box-shadow:0 24px 48px -12px rgba(19, 27, 46, 0.04);"
>
  <header
    class="facetheory-stitch-auth-card-header"
    style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;"
  >
    <div style="display:flex;flex-direction:column;gap:6px;">
      <h1
        style='margin:0;font-size:24px;line-height:1.2;font-family:var(--stitch-font-display, "Space Grotesk"), system-ui, sans-serif;'
      >
        {title}
      </h1>
      {#if description !== undefined}
        <p
          style="margin:0;font-size:14px;line-height:1.4;color:var(--stitch-color-on-surface-variant, #464553);"
        >
          {description}
        </p>
      {/if}
    </div>

    <div style="flex-shrink:0;">
      <slot name="headerAction" />
    </div>
  </header>

  <div
    class="facetheory-stitch-auth-card-body"
    style="display:flex;flex-direction:column;gap:16px;"
  >
    <slot />
  </div>

  <div
    class="facetheory-stitch-auth-card-footer"
    style="display:flex;justify-content:center;font-size:13px;"
  >
    <slot name="footer" />
  </div>
</div>
