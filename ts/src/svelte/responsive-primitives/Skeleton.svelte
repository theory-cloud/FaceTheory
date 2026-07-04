<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    skeletonClassName,
    type SkeletonAnimation,
    type SkeletonHeightPreset,
    type SkeletonVariant,
    type SkeletonWidthPreset,
  } from '../../responsive-primitives/index.js';

  let {
    animation = 'pulse',
    decorative = true,
    height = undefined,
    loading = true,
    variant = 'text',
    width = undefined,
    class: className = '',
    children,
    ...rest
  }: {
    animation?: SkeletonAnimation;
    decorative?: boolean;
    height?: SkeletonHeightPreset | undefined;
    loading?: boolean;
    variant?: SkeletonVariant;
    width?: SkeletonWidthPreset | undefined;
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();

  const resolvedClass = $derived(
    skeletonClassName({
      animation,
      className,
      decorative,
      height,
      loading,
      variant,
      width,
    }),
  );
</script>

{#if loading}
  <div
    {...rest}
    class={resolvedClass}
    aria-hidden={decorative ? 'true' : undefined}
    role={decorative ? undefined : 'status'}
    aria-label={decorative ? undefined : 'Loading'}
    data-animation={animation}
    data-loading="true"
  ></div>
{:else}
  {@render children?.()}
{/if}
