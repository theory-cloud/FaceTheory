---
title: SPA navigation
---

SPA is FaceTheory's client-side navigation runtime. A server-rendered shell ships first (via SSR, SSG, or ISR), then `startFaceNavigation` hydrates and takes over routing on the client.

> SPA is **not** a `FaceMode` value. `FaceMode` only accepts `'ssr' | 'ssg' | 'isr'`. A Face that needs SPA behavior is delivered through one of the three server-rendered modes and the client opts into client-side routing by calling `startFaceNavigation()` from a bootstrap module.

## Client bootstrap

```typescript
import { startFaceNavigation } from '@theory-cloud/facetheory';

const controller = startFaceNavigation({
  // Optional override; omit to use the default '[data-facetheory-view]'.
  viewSelector: '[data-facetheory-view]',
});

// Programmatic navigation:
await controller.navigate('/about');

// Stop client-side routing (the browser falls back to full page loads):
controller.stop();
```

The `FaceNavigationController` returned by `startFaceNavigation` exposes `navigate(url)` and `stop()`. Hydration data from the initial render is loaded automatically through the same `loadFaceHydrationData()` path used for inline, SSG, ISR, framework-owned SSR, and caller-managed external hydration.

## Same-origin snapshot fetch

`startFaceNavigation` fetches the next page's HTML and hydration data from the same origin, parses it, and applies the new view in place. Helpers exposed for advanced use:

- `fetchFaceNavigationSnapshot(url)` — fetch raw HTML + hydration JSON.
- `parseFaceNavigationSnapshot(html)` — parse the response.
- `applyFaceNavigationSnapshot(snapshot)` — swap the rendered view in the DOM.
- `loadFaceNavigationModule(snapshot)` — load the matching client bootstrap.

These compose into the default controller behavior; most consumers do not need to call them directly.

## Stable view container

The SPA runtime requires a stable view container in your shell so it can replace the inner HTML on navigation. See [Core Patterns → Use `startFaceNavigation()` with a stable view container](../core-patterns.md#pattern-use-startfacenavigation-with-a-stable-view-container).

## When to choose SPA navigation

Pick SPA navigation when:

- The application is interaction-heavy after the initial paint.
- Subsequent route changes can be expressed as data swaps rather than full re-renders.
- You still want the deterministic SSR / SSG / ISR shell that FaceTheory provides for the first paint.

Avoid SPA navigation when:

- The site is primarily document-style content where full page loads are fine.
- You can't keep client-side and server-side render output deterministic.

## Destination Content-Security-Policy

`fetchFaceNavigationSnapshot` reads the destination response's
`Content-Security-Policy` and validates the fetched document against it before
returning a snapshot. SPA navigation injects the destination's HTML into the
active document, and `fetch` cannot install the destination's CSP headers, so
content the destination policy would have blocked must not be revived under the
shell's policy. The helper refuses a document that carries, under a policy that
blocks them:

- inline event handler attributes (`onclick` and friends)
- `javascript:` / `vbscript:` URLs in `href`, `src`, `action`, `formaction`,
  `poster`, `background`, `data`, or `xlink:href`
- script-capable `data:` documents (`text/html`, `image/svg+xml`, XHTML/XML, or
  JavaScript media types) in navigable or document-embedding attributes;
  ordinary image `data:` URLs such as inline PNG or SVG icons stay allowed
- `iframe srcdoc` documents
- inline `style` attributes or `<style>` elements

A destination that complies with its own policy — including FaceTheory's
strict-CSP output — passes unchanged, and the derived policy is available on
`snapshot.csp`. The default controller reports a refusal through `onError`; use
that hook to fall back to a full page load (`window.location.assign(url)`) when
the destination legitimately needs content its own policy blocks. Report-only
headers never block and are ignored.

## Related docs

- [Browser hydration loader (`@theory-cloud/facetheory/client`)](../api-reference.md#browser-hydration-loader)
- [Client navigation API](../api-reference.md#client-navigation)
- [Document shell attrs](../api-reference.md#document-shell-attrs)
