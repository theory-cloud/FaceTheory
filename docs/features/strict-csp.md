---
title: Strict CSP
---

Routes that need a no-inline Content Security Policy can opt into FaceTheory's strict CSP path: no inline scripts, no inline styles, no raw head HTML, with hydration data moved to a same-origin sidecar instead of an inline `__FACETHEORY_DATA__` block.

## Opting in

Set `FaceRenderResult.csp` to disable the inline channels:

```typescript
return {
  html: '<h1>Hello</h1>',
  csp: {
    inlineScripts: false,
    inlineStyles: false,
    rawHead: false,
  },
  hydration: externalHydrationForEntry(manifest, 'src/entry-client.ts', data),
};
```

When `csp.inlineScripts === false`, FaceTheory refuses to emit inline `<script>` bodies and routes hydration through an external sidecar.

## Building the CSP header

```typescript
import { buildStrictCspHeader, createCspNonce } from '@theory-cloud/facetheory';

const nonce = createCspNonce();
const cspHeader = buildStrictCspHeader({ cspNonce: nonce });
```

`buildStrictCspHeader` emits the canonical strict directive set:

```
default-src 'self'
base-uri 'self'
object-src 'none'
frame-ancestors 'none'
script-src 'self'
style-src 'self'
img-src 'self' data:
font-src 'self'
connect-src 'self'
form-action 'self'
```

Nonces are unique per response and consistent within a response so that `<script nonce>` attributes match the `Content-Security-Policy` header.

## Document validation

For defense in depth, FaceTheory can validate the rendered document against the policy before emitting it:

```typescript
import {
  validateStrictCspDocument,
  requiresStrictCspDocumentValidation,
} from '@theory-cloud/facetheory';

if (requiresStrictCspDocumentValidation(policy)) {
  validateStrictCspDocument(html, { policy });
}
```

The validator throws on inline `<script>` bodies, inline `style` attributes, and raw head HTML that the policy forbids.

## Sidecar hydration

Strict CSP requires external hydration data. Use one of:

- **Framework-owned same-origin sidecars** — configure `createFaceApp({ ssrHydrationSidecars })` and return normal `viteHydrationForEntry()` data from the SSR Face. FaceTheory writes the exact render-time payload once before emitting a same-origin `/_facetheory/ssr-data/...` link.
- **Caller-managed external sidecars** — use `externalHydrationForEntry()` when the host owns the same-origin JSON URL.

See [SSR hydration sidecars](ssr-hydration-sidecars.md) for the full path.

## Examples in the repo

- `ts/examples/vite-strict-csp-svelte/` — strict CSP delivery with Svelte + Vite

## Related docs

- [Deterministic head emission](head.md)
- [SSR hydration sidecars](ssr-hydration-sidecars.md)
- [Core Patterns → Render strict no-inline CSP pages with external hydration](../core-patterns.md#pattern-render-strict-no-inline-csp-pages-with-external-hydration)
