<script lang="ts">
  import type { NavItem } from './nav-types.js';

  export let items: NavItem[] = [];
  export let activeKey: string | undefined = undefined;
  export let openKeys: string[] | undefined = undefined;
  export let onNavigate: ((path: string, key: string) => void) | undefined = undefined;

  function isOpen(item: NavItem): boolean {
    if (!item.children || item.children.length === 0) return false;
    if (openKeys === undefined) return true;
    return openKeys.includes(item.key);
  }

  function iconText(icon: unknown): string | null {
    if (typeof icon === 'string' || typeof icon === 'number') return String(icon);
    return null;
  }
</script>

{#each items.filter((item) => !item.hidden) as item (item.key)}
  <li style="list-style:none;">
    {#if item.path}
      <a
        href={item.path}
        on:click={(event) => {
          if (!onNavigate) return;
          event.preventDefault();
          onNavigate(item.path!, item.key);
        }}
        style={`display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--stitch-radius-lg, 12px);text-decoration:none;background:${
          item.key === activeKey
            ? 'var(--stitch-color-primary-fixed, #e2dfff)'
            : 'transparent'
        };color:${
          item.key === activeKey
            ? 'var(--stitch-color-on-primary-fixed, #0f0069)'
            : 'var(--stitch-color-on-surface, #131b2e)'
        };`}
      >
        {#if iconText(item.icon)}
          <span aria-hidden="true" style="display:inline-flex;">{iconText(item.icon)}</span>
        {/if}
        <span>{item.label}</span>
      </a>
    {:else}
      <div
        style="display:flex;align-items:center;gap:10px;padding:10px 12px;color:var(--stitch-color-on-surface-variant, #464553);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;"
      >
        {item.label}
      </div>
    {/if}

    {#if item.children && item.children.length > 0 && isOpen(item)}
      <ul
        style="display:flex;flex-direction:column;gap:4px;margin:4px 0 0 12px;padding:0;"
      >
        <svelte:self
          items={item.children}
          {activeKey}
          {openKeys}
          {onNavigate}
        />
      </ul>
    {/if}
  </li>
{/each}
