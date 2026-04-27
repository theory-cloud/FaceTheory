<script lang="ts">
  import type { MetadataBadgeTone } from './types.js';

  export let label: unknown;
  export let detail: unknown = undefined;
  export let tone: MetadataBadgeTone = 'neutral';
  export let href: string | undefined = undefined;
  export let title: string | undefined = undefined;

  const safeHrefBase = 'https://facetheory.invalid';
  const palette: Record<MetadataBadgeTone, { background: string; color: string }> = {
    neutral: {
      background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
      color: 'var(--stitch-color-on-surface-variant, #464553)',
    },
    info: {
      background: 'var(--stitch-color-primary-container, #e0e0ff)',
      color: 'var(--stitch-color-on-primary-container, #000066)',
    },
    success: {
      background: 'var(--stitch-color-tertiary-container, #004c45)',
      color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    },
    warning: {
      background: 'var(--stitch-color-secondary-container, #ffecc0)',
      color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    },
    danger: {
      background: 'var(--stitch-color-error-container, #ffdad6)',
      color: 'var(--stitch-color-on-error-container, #93000a)',
    },
  };

  $: current = palette[tone];
  $: safeHref = sanitizeHref(href);
  $: badgeStyle = `display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:500;line-height:1.4;background:${current.background};color:${current.color};`;

  function sanitizeHref(value: string | undefined): string | undefined {
    const normalized = String(value ?? '').trim();
    if (normalized.length === 0) return undefined;

    try {
      const parsed = new URL(normalized, safeHrefBase);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
        ? normalized
        : undefined;
    } catch {
      return undefined;
    }
  }
</script>

{#if safeHref !== undefined}
  <a
    class={`facetheory-stitch-metadata-badge facetheory-stitch-metadata-badge-${tone}`}
    href={safeHref}
    {title}
    style={`${badgeStyle}text-decoration:none;`}
  >
    <span>{label}</span>
    {#if detail !== undefined}
      <span class="facetheory-stitch-metadata-badge-detail" style="opacity:0.78;">{detail}</span>
    {/if}
  </a>
{:else}
  <span
    class={`facetheory-stitch-metadata-badge facetheory-stitch-metadata-badge-${tone}`}
    {title}
    style={badgeStyle}
  >
    <span>{label}</span>
    {#if detail !== undefined}
      <span class="facetheory-stitch-metadata-badge-detail" style="opacity:0.78;">{detail}</span>
    {/if}
  </span>
{/if}
