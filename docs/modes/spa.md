---
title: SPA navigation
---

SPA is FaceTheory's client-side navigation runtime. A server-rendered shell ships first (via SSR, SSG, or ISR), then `startFaceNavigation` hydrates and takes over routing on the client.

> SPA is **not** a `FaceMode` value. `FaceMode` only accepts `'ssr' | 'ssg' | 'isr'`. A Face that needs SPA behavior is delivered through one of the three server-rendered modes and the client opts into client-side routing by calling `startFaceNavigation()` from a bootstrap module.

## Client bootstrap

```typescript
import { startFaceNavigation } from '@theory-cloud/facetheory';

const controller = startFaceNavigation({
  // Defaults to '#facetheory-view' if omitted.
  viewSelector: '#facetheory-view',
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

## Related docs

- [Browser hydration loader (`@theory-cloud/facetheory/client`)](../api-reference.md#browser-hydration-loader)
- [Client navigation API](../api-reference.md#client-navigation)
- [Document shell attrs](../api-reference.md#document-shell-attrs)
