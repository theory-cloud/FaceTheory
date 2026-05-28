---
title: SSR hydration sidecars
---

Hydration sidecars carry the exact render-time data from server to client without embedding it inline in the document. They are the cornerstone of strict no-inline CSP delivery and the safer default for any hydration payload large enough to be worth caching.

## Three sidecar shapes

FaceTheory supports three hydration shapes from `FaceRenderResult.hydration`:

1. **Inline hydration** — the legacy default. Data is serialized into a `<script>` tag in the document. Conflicts with strict CSP.
2. **Framework-owned external sidecars** — FaceTheory writes the data to a same-origin `/_facetheory/ssr-data/<key>.json` URL and emits an external `<link>` to it. Use this when you want the framework to manage sidecar persistence.
3. **Caller-managed external sidecars** — FaceTheory emits an external link to a URL you own; you persist the data yourself.

## Framework-owned sidecars

Configure `ssrHydrationSidecars` on the app:

```typescript
import { createFaceApp } from '@theory-cloud/facetheory';

export const app = createFaceApp({
  faces,
  ssrHydrationSidecars: {
    // Provide the store FaceTheory writes sidecar JSON into. See
    // FaceSsrHydrationSidecarOptions in api-reference for the contract.
  },
});
```

Then return normal `viteHydrationForEntry()` data from the SSR Face's `renderOptions`:

```typescript
import { viteHydrationForEntry } from '@theory-cloud/facetheory';

renderOptions: async (_ctx, data) => ({
  hydration: viteHydrationForEntry(manifest, 'src/entry-client.ts', data),
}),
```

FaceTheory writes the exact render-time payload once before emitting a same-origin `/_facetheory/ssr-data/...` link. Route that prefix to the same Lambda / FaceApp handler as the HTML.

## Static SSG sidecars

For SSG, sidecars live under `/_facetheory/data/*` for S3 / CloudFront delivery. The SSG build writes them automatically when a Face's `renderOptions.hydration` declares an external shape.

## Caller-managed sidecars

When the host owns the URL:

```typescript
import { externalHydrationForEntry } from '@theory-cloud/facetheory';

renderOptions: async (_ctx, data) => ({
  hydration: externalHydrationForEntry({
    data,
    dataUrl: '/my/sidecar.json',
    bootstrapModule: '/entry-client.js',
  }),
}),
```

You are responsible for serving `/my/sidecar.json` with the matching payload.

## Browser bootstrap

The client bootstrap loads hydration data through a single same-origin loader:

```typescript
import { loadFaceHydrationData } from '@theory-cloud/facetheory/client';

const data = await loadFaceHydrationData();
hydrateApp(data);
```

`loadFaceHydrationData` works uniformly across inline, SSG, ISR, framework-owned SSR, and caller-managed external hydration — the bootstrap does not need to know which shape produced the data.

## Related docs

- [Strict CSP](strict-csp.md)
- [Getting Started → Add a raw resource route](../getting-started.md#add-a-raw-resource-route)
- [Core Patterns → Let FaceTheory own strict SSR hydration sidecars](../core-patterns.md#pattern-let-facetheory-own-strict-ssr-hydration-sidecars)
- [API Reference → Browser Hydration Loader](../api-reference.md#browser-hydration-loader)
