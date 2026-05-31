<script lang="ts">
  import {
    skeletonClassName,
    type SkeletonAnimation,
    type SkeletonHeightPreset,
    type SkeletonVariant,
    type SkeletonWidthPreset,
  } from '../../responsive-primitives/index.js';

  export let animation: SkeletonAnimation = 'pulse';
  export let decorative = true;
  export let height: SkeletonHeightPreset | undefined = undefined;
  export let loading = true;
  export let variant: SkeletonVariant = 'text';
  export let width: SkeletonWidthPreset | undefined = undefined;
  let className = '';
  export { className as class };

  $: resolvedClass = skeletonClassName({
    animation,
    className,
    decorative,
    height,
    loading,
    variant,
    width,
  });
</script>

{#if loading}
  <div
    {...$$restProps}
    class={resolvedClass}
    aria-hidden={decorative ? 'true' : undefined}
    role={decorative ? undefined : 'status'}
    aria-label={decorative ? undefined : 'Loading'}
    data-animation={animation}
    data-loading="true"
  ></div>
{:else}
  <slot />
{/if}
