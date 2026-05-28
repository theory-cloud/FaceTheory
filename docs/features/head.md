---
title: Deterministic head emission
---

Head tags — title, meta, link, script, style — are emitted by FaceTheory in a stable order so that server-rendered HTML and client-hydrated DOM match exactly. Reaching around the head primitive to inject tags directly into a component body breaks the determinism guarantee.

## The head primitive

FaceTheory exposes three head helpers from the main entry:

```typescript
import {
  renderFaceHead,
  normalizeHeadTags,
  renderHeadTag,
  type FaceHeadTag,
} from '@theory-cloud/facetheory';
```

- `renderFaceHead(out, options)` — render the head section from a `FaceRenderResult`. Accepts an optional `cspNonce` and `allowedOrigin`.
- `normalizeHeadTags(tags, options)` — canonicalize an array of head tags (de-duplicate, apply nonces).
- `renderHeadTag(tag)` — serialize a single tag to HTML.

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
return {
  html: '<h1>Hello</h1>',
  headTags: [
    { type: 'title', text: 'Hello FaceTheory' },
    { type: 'meta', attrs: { name: 'description', content: 'A FaceTheory page' } },
    { type: 'link', attrs: { rel: 'stylesheet', href: '/assets/app.css' } },
  ],
};
```

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
