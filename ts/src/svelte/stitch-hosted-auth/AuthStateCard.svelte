<script lang="ts">
  export type AuthStateVariant = 'info' | 'success' | 'warning' | 'error';

  export let variant: AuthStateVariant = 'info';
  export let title: unknown;
  export let description: unknown = undefined;

  const variantPalette: Record<
    AuthStateVariant,
    { accent: string; surface: string; text: string }
  > = {
    info: {
      accent: 'var(--stitch-color-primary, #1f108e)',
      surface: 'var(--stitch-color-surface-container-lowest, #ffffff)',
      text: 'var(--stitch-color-on-surface, #131b2e)',
    },
    success: {
      accent: 'var(--stitch-color-tertiary, #00332e)',
      surface: 'var(--stitch-color-surface-container-lowest, #ffffff)',
      text: 'var(--stitch-color-on-surface, #131b2e)',
    },
    warning: {
      accent: 'var(--stitch-color-error, #ba1a1a)',
      surface: 'var(--stitch-color-surface-container-lowest, #ffffff)',
      text: 'var(--stitch-color-on-surface, #131b2e)',
    },
    error: {
      accent: 'var(--stitch-color-error, #ba1a1a)',
      surface: 'var(--stitch-color-error-container, #ffdad6)',
      text: 'var(--stitch-color-on-error-container, #93000a)',
    },
  };

  $: palette = variantPalette[variant];
</script>

<div
  class={`facetheory-stitch-auth-state facetheory-stitch-auth-state-${variant}`}
  role={variant === 'error' || variant === 'warning' ? 'alert' : undefined}
  style={`width:100%;max-width:440px;background:${palette.surface};color:${palette.text};border-radius:var(--stitch-radius-xl, 16px);padding:40px;display:flex;flex-direction:column;gap:16px;align-items:center;text-align:center;box-shadow:0 24px 48px -12px rgba(19, 27, 46, 0.04);`}
>
  <div
    aria-hidden="true"
    style={`width:48px;height:48px;border-radius:9999px;background:var(--stitch-color-surface-container-low, #f2f3ff);color:${palette.accent};display:flex;align-items:center;justify-content:center;font-size:22px;`}
  >
    <slot name="icon" />
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
    <slot name="actions" />
  </div>
</div>
