---
title: React adapter
---

The React adapter renders Faces using React 18+ APIs. FaceTheory exposes two helpers:

- **`createReactFace`** — buffered SSR. The full HTML body is rendered to a string before the response is flushed.
- **`createReactStreamFace`** — streaming SSR via React DOM Server's Node `renderToPipeableStream`, with explicit control over how Suspense and style readiness interact with first-byte flushing.

Both return a `FaceModule` you pass directly to `createFaceApp`.

## Install

```bash
npm install --save-exact \
  https://github.com/theory-cloud/FaceTheory/releases/download/v3.4.2/theory-cloud-facetheory-3.4.2.tgz \
  react react-dom
```

For Emotion-based styles add `@emotion/react @emotion/cache @emotion/server`. For Ant Design add `antd`.

## Minimal streaming Face

The same shape as `ts/examples/react-ssr-streaming/handler.ts` in the repo:

```typescript
import * as React from 'react';
import { createFaceApp, createLambdaUrlStreamingHandler } from '@theory-cloud/facetheory';
import { createReactStreamFace } from '@theory-cloud/facetheory/react';

function Home() {
  return React.createElement('h1', null, 'FaceTheory + React (streaming SSR)');
}

export const app = createFaceApp({
  faces: [
    createReactStreamFace({
      route: '/',
      mode: 'ssr',
      render: () => React.createElement(Home),
      renderOptions: {
        headTags: [{ type: 'title', text: 'Home' }],
        // Defaults to 'all-ready', which favors style correctness with
        // Suspense / async boundaries. For lower TTFB choose 'shell'.
        styleStrategy: 'all-ready',
      },
    }),
  ],
});

export const handler = createLambdaUrlStreamingHandler({ app });
```

## Style strategies

`createReactStreamFace`'s `renderOptions.styleStrategy` accepts:

- `'all-ready'` (default) — wait until all Suspense boundaries have resolved before flushing, so CSS-in-JS extraction can emit the complete stylesheet on the first chunk.
- `'shell'` — flush the shell as soon as it's ready and stream Suspense boundaries afterwards. Faster TTFB; consumers must handle the case where late chunks introduce styles after first paint.

The trade-off is described in [Core Patterns → Default React streaming to `all-ready`](../core-patterns.md#pattern-default-react-streaming-to-all-ready).

## Sub-entry points

The React adapter has additional entry points for opinionated stacks:

- `@theory-cloud/facetheory/react/emotion` — Emotion `<CacheProvider>` plumbing for SSR style extraction.
- `@theory-cloud/facetheory/react/antd` — Ant Design SSR helpers.
- `@theory-cloud/facetheory/react/antd-emotion` — combined AntD + Emotion path.
- `@theory-cloud/facetheory/react/stitch-tokens`, `/react/stitch-shell`, `/react/stitch-hosted-auth`, `/react/stitch-admin` — Stitch design-system primitives for React.

See [API Reference → Package Export Map](../api-reference.md#package-export-map) for the full surface.

## Examples in the repo

- `ts/examples/react-ssr-streaming/` — minimal streaming SSR
- `ts/examples/react-ssr-buffered/` — buffered SSR (no streaming)
- `ts/examples/vite-ssr-react/` — React via Vite
- `ts/examples/operator-visibility-react/` — Stitch admin operator dashboard

## Related docs

- [Render mode: SSR](../modes/ssr.md)
- [Render mode: ISR](../modes/isr.md)
- [Deterministic head emission](../features/head.md)
- [Strict CSP](../features/strict-csp.md)
