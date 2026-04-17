<!--
  Stitch Topbar (Svelte).

  Named slots:
    - `logo`         Brand logo slot (icon/img/component). Rendered at the far
                     left before `surfaceLabel` and `left`. Brand-agnostic:
                     FaceTheory provides the slot only.
    - `surfaceLabel` Surface label slot (e.g. a "surface chip" identifying
                     Core / MCP / Auth, or any consumer-defined
                     classification). Rendered to the right of `logo` and
                     before `left`. Brand-agnostic.
    - `left`         Left-aligned slot; typically the current page title or
                     search.
    - `center`       Center slot; typically contextual actions or filters.
    - `right`        Right-aligned slot; typically the account/user menu.
-->
<header
  class="facetheory-stitch-topbar"
  style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 32px;height:64px;background:var(--stitch-color-surface, #faf8ff);"
>
  <div
    class="facetheory-stitch-topbar-left"
    style="flex:1;min-width:0;display:flex;align-items:center;gap:12px;"
  >
    {#if $$slots.logo}
      <div class="facetheory-stitch-topbar-logo" style="display:flex;align-items:center;">
        <slot name="logo" />
      </div>
    {/if}
    {#if $$slots.surfaceLabel}
      <div class="facetheory-stitch-topbar-surface-label" style="display:flex;align-items:center;">
        <slot name="surfaceLabel" />
      </div>
    {/if}
    {#if $$slots.left}
      <div style="min-width:0;">
        <slot name="left" />
      </div>
    {/if}
  </div>
  <div style="flex:1;display:flex;justify-content:center;">
    <slot name="center" />
  </div>
  <div style="flex:1;display:flex;justify-content:flex-end;gap:12px;">
    <slot name="right" />
  </div>
</header>
