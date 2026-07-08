---
title: Deterministic head emission
---

Head tags — title, meta, link, script, style — are emitted by FaceTheory in a stable order so that server-rendered HTML and client-hydrated DOM match exactly. Reaching around the head primitive to inject tags directly into a component body breaks the determinism guarantee.

## The head primitive

FaceTheory exposes the head primitive and helper-first authoring APIs from the
main entry:

```typescript
import {
  canonical,
  jsonLd,
  metaTag,
  normalizeHeadTags,
  openGraph,
  renderFaceHead,
  renderHeadTag,
  titleTag,
  twitterCard,
  type FaceHeadTag,
} from '@theory-cloud/facetheory';
```

- `renderFaceHead(out, options)` — render the head section from a `FaceRenderResult`. Accepts an optional `cspNonce` and `allowedOrigin`.
- `normalizeHeadTags(tags, options)` — canonicalize an array of head tags (de-duplicate, apply nonces).
- `renderHeadTag(tag)` — serialize a single tag to HTML.
- `titleTag(title, { template })` — create a deterministic `<title>`, optionally applying a `%s` title template.
- `metaTag(name, content)` — create a named `<meta>` tag.
- `openGraph(...)` / `twitterCard(...)` — create typed Open Graph and Twitter card meta groups.
- `canonical(href)` — create a canonical same-origin or http(s) link tag.
- `jsonLd(data, { nonce? })` — create a safe `application/ld+json` script tag for structured data.

## `FaceHeadTag` shape

```typescript
type FaceHeadTag =
  | { type: 'title'; text: string }
  | { type: 'meta'; attrs: FaceAttributes }
  | { type: 'link'; attrs: FaceAttributes }
  | { type: 'script'; attrs: FaceAttributes; body?: string }
  | { type: 'style'; cssText: string; attrs?: FaceAttributes }
  | { type: 'raw'; html: string };
```

Faces declare head tags through `FaceRenderResult.headTags`:

```typescript
import {
  canonical,
  jsonLd,
  metaTag,
  openGraph,
  titleTag,
  twitterCard,
} from '@theory-cloud/facetheory';

return {
  html: '<h1>Hello</h1>',
  headTags: [
    titleTag('Hello', { template: '%s · FaceTheory' }),
    metaTag('description', 'A FaceTheory page'),
    ...openGraph({
      title: 'Hello FaceTheory',
      type: 'website',
      url: 'https://app.example/',
      image: '/assets/card.png',
    }),
    ...twitterCard({
      card: 'summary_large_image',
      title: 'Hello FaceTheory',
      image: '/assets/card.png',
    }),
    canonical('/'),
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Hello FaceTheory',
    }),
  ],
};
```

Helpers return normal `FaceHeadTag` objects. They do not create a parallel head
pipeline; de-duplication, nonce application, escaping, and stable ordering still
come from `renderFaceHead()` / `normalizeHeadTags()`.

For strict CSP routes that set `csp.inlineScripts === false`, JSON-LD is the one
nonce-carried inline script body FaceTheory permits. Pass the request nonce to
the renderer (`renderFaceHead(out, { cspNonce: ctx.request.cspNonce })`, or let
`createFaceApp()` do that for Face responses). The JSON-LD tag must be
`type="application/ld+json"` and carry the matching request nonce; inline
hydration JSON and generic inline scripts still fail closed.

## De-duplication

`normalizeHeadTags()` de-duplicates tags that have a deterministic key:

- the latest `<title>` wins;
- meta tags key by `charset`, `name`, `property`, or `http-equiv`;
- link tags key by `rel` + `href` + optional `as`;
- script tags key by `src` or `id`;
- style tags key by `id` or `data-emotion`.

Tags without one of those keys are intentionally exempt from de-duplication and
are emitted in order after charset/title normalization. That includes keyless
JSON-LD tags, because pages often need multiple structured-data blocks. Add an
`id` only when you want normal last-wins de-duplication for a specific JSON-LD
block.

## The `raw` escape hatch

`{ type: 'raw', html }` inserts HTML verbatim into `<head>` without escaping or nonce augmentation. Use it only when the caller fully owns the HTML, and never for content that could carry user input. Strict CSP rules disable this path — see [Strict CSP](strict-csp.md).

## Structured `<style>` vs raw HTML

Prefer structured `styleTags` (which take `cssText` + optional `attrs`) over `{ type: 'raw' }` for `<style>` injection. The structured path lets FaceTheory's deterministic emission and CSP enforcement apply consistently. See [Core Patterns → Emit custom head styles through structured tags](../core-patterns.md#pattern-emit-custom-head-styles-through-structured-tags-not-raw-head-html).

## CSS-in-JS extraction

For React + Emotion, the React adapter wires `@emotion/server` automatically when you use `createReactStreamFace` with Emotion-aware components. The extracted CSS is emitted as deterministic `<style>` tags. For Vue and Svelte, framework-native style emission (Vue scoped styles, Svelte compile-time CSS) flows through the same head primitive.

## Related docs

- [API Reference → Core Runtime Contracts](../api-reference.md#core-runtime-contracts)
- [Strict CSP](strict-csp.md)
- [Core Patterns → Set document-shell attrs in the render contract](../core-patterns.md#pattern-set-document-shell-attrs-in-the-render-contract)
