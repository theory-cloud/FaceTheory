---
title: FaceModule API reference
---

# FaceModule API reference

The `FaceModule` is the atomic unit of FaceTheory's routing model. A consumer declares an array of FaceModules and passes them to `createFaceApp`; the runtime picks the correct rendering pipeline per Face based on its declared `mode`.

## `FaceModule`

```typescript
interface FaceModule<TData = unknown> {
  route: string;
  mode: FaceMode;
  generateStaticParams?: () => Promise<Array<Record<string, string>>>;
  revalidateSeconds?: number;
  load?: (ctx: FaceContext) => Promise<TData> | TData;
  render(
    ctx: FaceContext,
    data: TData,
  ): Promise<FaceRenderResult> | FaceRenderResult;
}
```

Use `defineFace()` for the primary typed pattern. It returns the same
`FaceModule<TData>` object at runtime while preserving the type inferred from
`load` for `render`:

```typescript
import { defineFace } from '@theory-cloud/facetheory';

const profileFace = defineFace({
  route: '/profile',
  mode: 'ssr',
  load: async () => ({ displayName: 'Ada', loginCount: 7 }),
  render: (_ctx, data) => ({
    html: `<main>${data.displayName}: ${data.loginCount.toFixed(0)}</main>`,
  }),
});
```

No `data` parameter annotation is required in `render`; TypeScript knows it is
`{ displayName: string; loginCount: number }` from the loader. If you prefer an
explicit contract, annotate the Face directly:

```typescript
type ProfileData = { displayName: string; loginCount: number };

const profileFace: FaceModule<ProfileData> = {
  route: '/profile',
  mode: 'ssr',
  load: async () => ({ displayName: 'Ada', loginCount: 7 }),
  render: (_ctx, data) => ({
    html: `<main>${data.displayName}: ${data.loginCount.toFixed(0)}</main>`,
  }),
};
```

Untyped `FaceModule` remains valid and defaults `TData` to `unknown`.

### `route`

A URL pattern. Path parameters use `{name}` syntax (e.g. `/blog/{slug}`).

### `mode`

```typescript
type FaceMode = 'ssr' | 'ssg' | 'isr';
```

Only three values are valid. **`'spa'` is not a `FaceMode`** — SPA navigation is a client-side runtime layered on top of a server-rendered shell, started via `startFaceNavigation()` from a bootstrap module. See [SPA navigation](../modes/spa.md).

### `generateStaticParams`

Required for parameterized SSG routes; optional otherwise. Returns the matrix of `params` to render at build time.

### `revalidateSeconds`

Used by `mode: 'isr'` to determine cache freshness. The cached entry is served until it ages past this value; the next request after expiry triggers a regeneration.

### `load`

Optional pre-render data loader. The return value is passed as the typed `data` argument to `render`.

### `render`

The render function. Receives the `FaceContext` and the `TData` value returned by `load`; returns a `FaceRenderResult` (synchronously or as a Promise).

## `FaceContext`

```typescript
interface FaceContext {
  request: Readonly<Required<FaceRequest>>;
  params: Readonly<Record<string, string>>;
  proxy: string | null;
}
```

## `FaceRequest`

```typescript
interface FaceRequest {
  method: string;
  path: string;
  query?: Query;
  headers?: Headers;
  cookies?: CookieMap;
  body?: Uint8Array;
  isBase64?: boolean;
  cspNonce?: string | null;
}
```

## `FaceResponse`

```typescript
interface FaceResponse {
  status: number;
  headers: Headers;
  cookies: string[];
  body: FaceBody;       // Uint8Array | AsyncIterable<Uint8Array>
  isBase64: boolean;
}
```

## `FaceRenderResult`

```typescript
interface FaceRenderResult {
  status?: number;
  headers?: FaceResponseHeaders;
  cookies?: string[];
  lang?: string;
  htmlAttrs?: FaceAttributes;
  bodyAttrs?: FaceAttributes;
  head?: FaceHead;
  headTags?: FaceHeadTag[];
  styleTags?: FaceStyleTag[];
  csp?: FaceCspPolicy;
  html: string | AsyncIterable<Uint8Array>;
  hydration?: FaceHydration;
}
```

## `FaceHead` and `FaceHeadTag`

```typescript
interface FaceHead {
  title?: string;
  html?: string;  // legacy escaped head text, not raw HTML
}

type FaceHeadTag =
  | { type: 'title'; text: string }
  | { type: 'meta'; attrs: FaceAttributes }
  | { type: 'link'; attrs: FaceAttributes }
  | { type: 'script'; attrs: FaceAttributes; body?: string }
  | { type: 'style'; cssText: string; attrs?: FaceAttributes }
  | { type: 'raw'; html: string };
```

## `FaceCspPolicy`

```typescript
interface FaceCspPolicy {
  inlineScripts?: boolean;
  inlineStyles?: boolean;
  rawHead?: boolean;
}
```

Set any of these to `false` to disable that emission channel — the strict CSP path uses `{ inlineScripts: false, inlineStyles: false, rawHead: false }`.

## `FaceHydration`

```typescript
type FaceHydration = FaceInlineHydration | FaceExternalHydration;

interface FaceInlineHydration {
  type?: 'inline';
  data: unknown;
  bootstrapModule: string;
}

interface FaceExternalHydration {
  type: 'external';
  data: unknown;
  dataUrl: string;
  bootstrapModule: string;
}
```

## `createFaceApp`

```typescript
function createFaceApp(options: FaceAppOptions): FaceApp;

interface FaceAppOptions {
  faces: FaceModule[];
  resources?: FaceResourceRoute[];
  isr?: FaceIsrOptions;
  ssrHydrationSidecars?: FaceSsrHydrationSidecarOptions;
  observability?: FaceObservabilityHooks;
  strictCsp?: FaceStrictCspOptions;
}
```

The returned `FaceApp` exposes `handle(request: FaceRequest): Promise<FaceResponse>`.

## Lambda Function URL handlers

```typescript
function createLambdaUrlStreamingHandler(
  options: { app: FaceRequestHandler; awslambda?: AwsLambdaGlobalLike },
): (event: LambdaUrlEvent, context: unknown) => Promise<void>;

function handleLambdaUrlEvent(
  app: FaceRequestHandler,
  event: LambdaUrlEvent,
): Promise<LambdaUrlResult>;
```

`createLambdaUrlStreamingHandler` is the production entry — it expects `awslambda.streamifyResponse` at runtime. `handleLambdaUrlEvent` is the unit-test entry — it accepts a synthesized event and returns what the handler would emit.

## Related docs

- [API Reference](../api-reference.md) — the full export surface
- [Render Modes Compared](render-modes.md)
- [Render mode: SSR](../modes/ssr.md)
- [Render mode: SSG](../modes/ssg.md)
- [Render mode: Blocking ISR](../modes/isr.md)
- [Render mode: SPA navigation](../modes/spa.md)
