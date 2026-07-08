<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    classifyResponsiveLinkClick,
    forcedSafeLinkRel,
    handleResponsiveLinkClick,
    sanitizeResponsiveLinkHref,
    type ResponsiveLinkNavigateHandler,
  } from '../../responsive-primitives/index.js';

  let {
    href,
    onclick = undefined,
    onnavigate = undefined,
    rel = undefined,
    sameOriginBaseHref = undefined,
    shouldHandleUrl = undefined,
    target = undefined,
    window = undefined,
    class: className = '',
    children,
    ...rest
  }: {
    href: string;
    onclick?: ((event: MouseEvent) => void) | undefined;
    onnavigate?: ResponsiveLinkNavigateHandler | undefined;
    rel?: string | undefined;
    sameOriginBaseHref?: string | URL | undefined;
    shouldHandleUrl?:
      | ((url: URL, anchor: HTMLAnchorElement | null) => boolean)
      | undefined;
    target?: string | undefined;
    window?: Window | undefined;
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();

  const safeRel = $derived(
    forcedSafeLinkRel({ href, rel, sameOriginBaseHref, target }),
  );
  const safeHref = $derived(sanitizeResponsiveLinkHref(href));
  const resolvedClass = $derived(
    ['facetheory-rcp-link', className].filter(Boolean).join(' '),
  );

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
  {...rest}
  class={resolvedClass}
  href={safeHref}
  rel={safeRel}
  {target}
  onclick={handleClick}
>{@render children?.()}</a>
