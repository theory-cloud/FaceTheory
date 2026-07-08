<!--
  Stitch Topbar (Svelte).

  Named snippets:
    - `logo`         Brand logo (icon/img/component). Rendered at the far
                     left before `surfaceLabel` and `left`. Brand-agnostic:
                     FaceTheory provides the snippet only.
    - `surfaceLabel` Surface label (e.g. a "surface chip" identifying
                     Core / MCP / Auth, or any consumer-defined
                     classification). Rendered to the right of `logo` and
                     before `left`. Brand-agnostic.
    - `left`         Left-aligned content; typically the current page title or
                     search.
    - `center`       Center content; typically contextual actions or filters.
    - `right`        Right-aligned content; typically the account/user menu.

  Props:
    - `showLogo`          Optional explicit override for whether the logo
                          wrapper chrome should render. When undefined,
                          Topbar falls back to whether a `logo` snippet was
                          provided. Shell passes this prop so callers of Shell
                          that do not provide a `topbarLogo` snippet get no
                          phantom wrapper — Shell's unconditional forwarding
                          would otherwise make the `logo` snippet read truthy
                          regardless.
    - `showSurfaceLabel`  Same pattern for the surface-label wrapper.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    showLogo = undefined,
    showSurfaceLabel = undefined,
    logo,
    surfaceLabel,
    left,
    center,
    right,
  }: {
    showLogo?: boolean | undefined;
    showSurfaceLabel?: boolean | undefined;
    logo?: Snippet;
    surfaceLabel?: Snippet;
    left?: Snippet;
    center?: Snippet;
    right?: Snippet;
  } = $props();

  const renderLogo = $derived(showLogo ?? Boolean(logo));
  const renderSurfaceLabel = $derived(showSurfaceLabel ?? Boolean(surfaceLabel));
</script>

<header
  class="facetheory-stitch-topbar"
  style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 32px;height:64px;background:var(--stitch-color-surface, #faf8ff);"
>
  <div
    class="facetheory-stitch-topbar-left"
    style="flex:1;min-width:0;display:flex;align-items:center;gap:12px;"
  >
    {#if renderLogo}
      <div class="facetheory-stitch-topbar-logo" style="display:flex;align-items:center;">
        {@render logo?.()}
      </div>
    {/if}
    {#if renderSurfaceLabel}
      <div class="facetheory-stitch-topbar-surface-label" style="display:flex;align-items:center;">
        {@render surfaceLabel?.()}
      </div>
    {/if}
    {#if left}
      <div style="min-width:0;">
        {@render left()}
      </div>
    {/if}
  </div>
  <div style="flex:1;display:flex;justify-content:center;">
    {@render center?.()}
  </div>
  <div style="flex:1;display:flex;justify-content:flex-end;gap:12px;">
    {@render right?.()}
  </div>
</header>
