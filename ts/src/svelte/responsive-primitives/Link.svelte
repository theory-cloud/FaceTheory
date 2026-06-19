<script lang="ts">
  import {
    classifyResponsiveLinkClick,
    forcedSafeLinkRel,
    handleResponsiveLinkClick,
    sanitizeResponsiveLinkHref,
    type ResponsiveLinkNavigateHandler,
  } from '../../responsive-primitives/index.js';

  export let href: string;
  export let onclick: ((event: MouseEvent) => void) | undefined = undefined;
  export let onnavigate: ResponsiveLinkNavigateHandler | undefined = undefined;
  export let rel: string | undefined = undefined;
  export let sameOriginBaseHref: string | URL | undefined = undefined;
  export let shouldHandleUrl:
    | ((url: URL, anchor: HTMLAnchorElement | null) => boolean)
    | undefined = undefined;
  export let target: string | undefined = undefined;
  export let window: Window | undefined = undefined;
  let className = '';
  export { className as class };

  $: safeRel = forcedSafeLinkRel({ href, rel, sameOriginBaseHref, target });
  $: safeHref = sanitizeResponsiveLinkHref(href);
  $: resolvedClass = ['facetheory-rcp-link', className].filter(Boolean).join(' ');

  function handleClick(event: MouseEvent): void {
    onclick?.(event);
    if (event.defaultPrevented) return;
    if (onnavigate === undefined) return;

    const intent = classifyResponsiveLinkClick(event, { shouldHandleUrl, window });
    if (!intent) return;

    handleResponsiveLinkClick(event, { onNavigate: onnavigate, shouldHandleUrl, window });
  }
</script>

<a
  {...$$restProps}
  class={resolvedClass}
  href={safeHref}
  rel={safeRel}
  {target}
  onclick={handleClick}
><slot /></a>
