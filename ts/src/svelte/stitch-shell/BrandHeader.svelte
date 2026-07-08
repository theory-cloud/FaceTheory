<!--
  Stitch BrandHeader (Svelte).

  Renders a caller-supplied logo + wordmark pair with an optional surface-chip
  label on the right. Brand-agnostic: all content is caller-provided, all
  colors bind through Stitch CSS variables.

  Props:
    - `logo`         Logo content (string or HTML fragment).
    - `wordmark`     Wordmark content (product or platform name).
    - `surfaceLabel` Optional surface-chip label.
    - `surfaceTone`  Optional tone hint. The value is normalized to a safe
                     lowercase kebab-case token suffix before binding the
                     chip's background / foreground to
                     `--stitch-color-{surfaceTone}-container` and
                     `--stitch-color-on-{surfaceTone}-container`. Omit it (or
                     provide a value that normalizes empty) for a neutral chip.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { resolveSurfaceTone } from '../../stitch-shell/surface-tone.js';

  let {
    logo = undefined,
    wordmark = undefined,
    surfaceLabel = undefined,
    surfaceTone = undefined,
  }: {
    logo?: unknown;
    wordmark?: unknown;
    surfaceLabel?: unknown;
    surfaceTone?: string | undefined;
  } = $props();

  // `logo`/`wordmark`/`surfaceLabel` accept either a value (rendered as text) or
  // a snippet (rendered as markup, filled via `{#snippet logo()}...`).
  const logoNode = $derived(
    typeof logo === 'function' ? (logo as Snippet) : undefined,
  );
  const wordmarkNode = $derived(
    typeof wordmark === 'function' ? (wordmark as Snippet) : undefined,
  );
  const surfaceLabelNode = $derived(
    typeof surfaceLabel === 'function' ? (surfaceLabel as Snippet) : undefined,
  );

  const surface = $derived(resolveSurfaceTone(surfaceTone));

  // Match the React / Vue `isRenderableNode` semantics: the surface-chip
  // wrapper only renders when the caller actually passes visible content.
  // Treat `undefined`, `null`, `false`, `true`, and `''` as non-rendering,
  // and recurse into arrays (an array of only non-renderable entries is
  // itself non-renderable). This preserves the `cond && text` / array
  // composition idioms downstream consumers reach for.
  function isRenderable(value: unknown): boolean {
    if (
      value === undefined ||
      value === null ||
      value === false ||
      value === true ||
      value === ''
    ) {
      return false;
    }
    if (Array.isArray(value)) {
      return value.some(isRenderable);
    }
    return true;
  }

  const hasSurfaceLabel = $derived(isRenderable(surfaceLabel));
</script>

<div
  class="facetheory-stitch-brand-header"
  style="display:inline-flex;align-items:center;gap:12px;"
>
  <span
    class="facetheory-stitch-brand-header-logo"
    style="display:inline-flex;align-items:center;"
  >
    {#if logoNode}{@render logoNode()}{:else if logo !== undefined}{logo}{/if}
  </span>
  <span
    class="facetheory-stitch-brand-header-wordmark"
    style="font-family:var(--stitch-font-display, inherit);font-weight:600;font-size:15px;letter-spacing:0.01em;color:var(--stitch-color-on-surface, #131b2e);"
  >
    {#if wordmarkNode}{@render wordmarkNode()}{:else if wordmark !== undefined}{wordmark}{/if}
  </span>
  {#if hasSurfaceLabel}
    <span
      class="facetheory-stitch-brand-header-surface-label"
      data-surface-tone={surface.normalizedTone}
      style={`display:inline-flex;align-items:center;padding:2px 10px;border-radius:var(--stitch-radius-sm, 4px);background:${surface.chipBg};color:${surface.chipColor};font-family:var(--stitch-font-label, inherit);font-size:11px;font-weight:600;letter-spacing:0.08em;`}
    >
      {#if surfaceLabelNode}{@render surfaceLabelNode()}{:else if surfaceLabel !== undefined}{surfaceLabel}{/if}
    </span>
  {/if}
</div>
