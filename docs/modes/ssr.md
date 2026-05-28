---
title: SSR (server-side rendering)
---

SSR is the default render mode: every request produces fresh HTML on a Lambda invocation. Pick SSR when content is personalized, frequently changing, or genuinely dynamic per request.

## Declaring an SSR Face

```typescript
import { createFaceApp, type FaceModule } from '@theory-cloud/facetheory';

const faces: FaceModule[] = [
  {
    route: '/',
    mode: 'ssr',
    render: async () => ({
      html: '<h1>Hello FaceTheory</h1>',
    }),
  },
];

export const app = createFaceApp({ faces });
```

`mode: 'ssr'` is one of three valid `FaceMode` values (`'ssr' | 'ssg' | 'isr'`). SPA navigation is **not** a `FaceMode` — see [SPA navigation](spa.md).

## Adapter helpers

Most consumers use an adapter helper rather than building `FaceRenderResult` by hand:

- React: [`createReactStreamFace`](../adapters/react.md) / `createReactFace`
- Vue: [`createVueFace`](../adapters/vue.md)
- Svelte: [`createSvelteFace`](../adapters/svelte.md)

## Lambda Function URL streaming

Expose the app via Lambda Function URL streaming:

```typescript
import { createLambdaUrlStreamingHandler } from '@theory-cloud/facetheory';
import { app } from './app.js';

export const handler = createLambdaUrlStreamingHandler({ app });
```

The handler expects Lambda's `awslambda.streamifyResponse` global at runtime. For local tests, call `handleLambdaUrlEvent(app, event)` with a synthesized event — see [Testing Guide](../testing-guide.md).

## What SSR guarantees

- Every request renders fresh HTML (no caching beyond what the request handler explicitly opts into via `headers`).
- The `render` function receives a `FaceContext` with the request, route params, and proxy hint, plus any data returned by an optional `load(ctx)` step.
- Output is deterministic if the consumer keeps it so — see [Deterministic head emission](../features/head.md) and FaceTheory's stewardship posture on determinism.

## When SSR is wrong

- Content that genuinely never changes between deploys → use [SSG](ssg.md).
- Content that changes on a schedule, not per-request → use [blocking ISR](isr.md) backed by TableTheory.
- An application shell whose interactivity dwarfs its initial render → consider [SPA navigation](spa.md) on top of SSR.

## Related docs

- [Getting Started](../getting-started.md)
- [Core Patterns](../core-patterns.md)
- [FaceModule API reference](../reference/face-module.md)
