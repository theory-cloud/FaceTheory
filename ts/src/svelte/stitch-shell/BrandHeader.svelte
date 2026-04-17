<!--
  Stitch BrandHeader (Svelte).

  Renders a caller-supplied logo + wordmark pair with an optional surface-chip
  label on the right. Brand-agnostic: all content is caller-provided, all
  colors bind through Stitch CSS variables.

  Props:
    - `logo`         Logo content. Use the prop for simple strings / HTML
                     fragments, or the `logo` named slot for rich content.
    - `wordmark`     Wordmark content (product or platform name). Use the
                     prop for strings, or the `wordmark` named slot for rich
                     content.
    - `surfaceLabel` Optional surface-chip label. Use the prop for strings,
                     or the `surfaceLabel` named slot for rich content.
    - `surfaceTone`  Optional free-form tone hint. Binds the chip's
                     background / foreground to
                     `--stitch-color-{surfaceTone}-container` and
                     `--stitch-color-on-{surfaceTone}-container`. Omit for a
                     neutral chip. FaceTheory ships no enumerated vocabulary.
-->
<script lang="ts">
  export let logo: unknown = undefined;
  export let wordmark: unknown = undefined;
  export let surfaceLabel: unknown = undefined;
  export let surfaceTone: string | undefined = undefined;

  $: chipBg =
    surfaceTone !== undefined
      ? `var(--stitch-color-${surfaceTone}-container, var(--stitch-color-surface-container-high, #e2e7ff))`
      : 'var(--stitch-color-surface-container-high, #e2e7ff)';
  $: chipColor =
    surfaceTone !== undefined
      ? `var(--stitch-color-on-${surfaceTone}-container, var(--stitch-color-on-surface, #131b2e))`
      : 'var(--stitch-color-on-surface, #131b2e)';

  // Match the React / Vue `isRenderableNode` semantics: the surface-chip
  // wrapper only renders when the caller actually passes visible content.
  // `undefined`, `null`, `false`, and `''` are Svelte "non-rendering"
  // values — treating them as no-content preserves the `cond && text`
  // composition idiom downstream consumers reach for.
  $: hasSurfaceLabelProp =
    surfaceLabel !== undefined &&
    surfaceLabel !== null &&
    (surfaceLabel as unknown) !== false &&
    surfaceLabel !== '';
  $: hasSurfaceLabel = Boolean($$slots.surfaceLabel) || hasSurfaceLabelProp;
</script>

<div
  class="facetheory-stitch-brand-header"
  style="display:inline-flex;align-items:center;gap:12px;"
>
  <span
    class="facetheory-stitch-brand-header-logo"
    style="display:inline-flex;align-items:center;"
  >
    <slot name="logo">{#if logo !== undefined}{logo}{/if}</slot>
  </span>
  <span
    class="facetheory-stitch-brand-header-wordmark"
    style="font-family:var(--stitch-font-display, inherit);font-weight:600;font-size:15px;letter-spacing:0.01em;color:var(--stitch-color-on-surface, #131b2e);"
  >
    <slot name="wordmark">{#if wordmark !== undefined}{wordmark}{/if}</slot>
  </span>
  {#if hasSurfaceLabel}
    <span
      class="facetheory-stitch-brand-header-surface-label"
      data-surface-tone={surfaceTone}
      style={`display:inline-flex;align-items:center;padding:2px 10px;border-radius:var(--stitch-radius-sm, 4px);background:${chipBg};color:${chipColor};font-family:var(--stitch-font-label, inherit);font-size:11px;font-weight:600;letter-spacing:0.08em;`}
    >
      <slot name="surfaceLabel">{#if surfaceLabel !== undefined}{surfaceLabel}{/if}</slot>
    </span>
  {/if}
</div>
