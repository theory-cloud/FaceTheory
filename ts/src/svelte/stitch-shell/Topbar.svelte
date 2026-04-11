<header
  class="facetheory-stitch-topbar"
  style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 32px;height:64px;background:var(--stitch-color-surface, #faf8ff);"
>
  <div style="flex:1;min-width:0;">
    <slot name="left" />
  </div>
  <div style="flex:1;display:flex;justify-content:center;">
    <slot name="center" />
  </div>
  <div style="flex:1;display:flex;justify-content:flex-end;gap:12px;">
    <slot name="right" />
  </div>
</header>
