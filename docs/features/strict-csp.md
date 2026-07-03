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
  hydration: externalHydrationForEntry(
    manifest,
    'src/entry-client.ts',
    data,
    { dataUrl: '/hydration/hello.json' },
  ),
};
```

When `csp.inlineScripts === false`, FaceTheory refuses to emit inline `<script>` bodies. Hydration must be external already or be externalized through a configured framework-owned path (SSR hydration sidecars, SSG build sidecars, or ISR sidecars); otherwise inline or Vite hydration fails closed.

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

Hosts can extend the canonical directives without abandoning the strict helper:

```typescript
const cspHeader = buildStrictCspHeader({
  directives: {
    'connect-src': ['https://api.example.com', 'wss://events.example.com'],
    'img-src': 'https://img.example.com',
    'report-to': 'facetheory-csp',
  },
});
```

Extension values are appended to existing directives when the directive is part
of the baseline (`connect-src`, `img-src`, and so on). New directives such as
`report-to` are appended after the baseline in deterministic name order. Values
are individual CSP tokens; pass multiple values as an array instead of a
space-separated string.

The strict builder remains fail-closed. It rejects directive injection shapes
(invalid names, semicolons, or whitespace inside a single value), and it refuses
`'unsafe-inline'` and `'unsafe-eval'` with actionable errors. Use external assets
or FaceTheory-owned request nonces; do not weaken the strict CSP baseline.

JSON-LD structured data uses the head helper path:

```typescript
import { jsonLd } from '@theory-cloud/facetheory';

return {
  csp: { inlineScripts: false, inlineStyles: false, rawHead: false },
  headTags: [
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Strict page',
    }),
  ],
  html: '<main>Strict page</main>',
};
```

`createFaceApp()` carries the request nonce into head emission. The JSON-LD tag
must remain in `<head>`, use `type="application/ld+json"`, and carry the
matching nonce. This allowance does not apply to inline hydration data or generic
inline scripts.

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

Strict CSP requires hydration data, when present, to be external. Use one of:

- **Framework-owned same-origin sidecars** — configure `createFaceApp({ ssrHydrationSidecars })` and return normal `viteHydrationForEntry()` data from the SSR Face. FaceTheory writes the exact render-time payload once before emitting a same-origin `/_facetheory/ssr-data/...` link.
- **Caller-managed external sidecars** — use `externalHydrationForEntry()` when the host owns the same-origin JSON URL.

See [SSR hydration sidecars](ssr-hydration-sidecars.md) for the full path.

## Examples in the repo

- `ts/examples/vite-strict-csp-svelte/` — strict CSP delivery with Svelte + Vite

## Related docs

- [Deterministic head emission](head.md)
- [SSR hydration sidecars](ssr-hydration-sidecars.md)
- [Core Patterns → Render strict no-inline CSP pages with external hydration](../core-patterns.md#pattern-render-strict-no-inline-csp-pages-with-external-hydration)
