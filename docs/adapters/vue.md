---
title: Vue adapter
---

The Vue adapter renders Faces using Vue 3's `@vue/server-renderer`. The framework-agnostic abstractions stay the same; the difference is how the render function shapes its output.

## Install

```bash
npm install --save-exact \
  https://github.com/theory-cloud/FaceTheory/releases/download/v3.4.2/theory-cloud-facetheory-3.4.2.tgz \
  vue @vue/server-renderer
```

## Minimal Face

`createVueFace.render` returns a Vue **VNode** (or a Promise of one) — not a component definition. Use the re-exported `h` to wrap your component:

```typescript
import {
  createFaceApp,
  createLambdaUrlStreamingHandler,
} from "@theory-cloud/facetheory";
import { createVueFace, h } from "@theory-cloud/facetheory/vue";

const Home = {
  setup() {
    return () => h("h1", "FaceTheory + Vue (SSR)");
  },
};

export const app = createFaceApp({
  faces: [
    createVueFace({
      route: "/",
      mode: "ssr",
      render: () => h(Home),
      renderOptions: {
        headTags: [{ type: "title", text: "Home" }],
      },
    }),
  ],
});

export const handler = createLambdaUrlStreamingHandler({ app });
```

## Streaming SSR

Use `createVueStreamFace` (or `renderVueStream` for lower-level adapter calls) when a Vue Face should return a streamed body. The Vue adapter uses `@vue/server-renderer`'s streaming renderer and returns the same `AsyncIterable<Uint8Array>` body contract as React streaming. FaceTheory still owns the document wrapper: `<head>` and structured style tags are emitted before the first body chunk, and mid-stream body errors are converted to FaceTheory's safe stream-error marker before the document closes.

```typescript
import { createFaceApp } from "@theory-cloud/facetheory";
import { createVueStreamFace, h } from "@theory-cloud/facetheory/vue";

const Home = {
  setup() {
    return () => h("main", "FaceTheory + Vue (streaming SSR)");
  },
};

export const app = createFaceApp({
  faces: [
    createVueStreamFace({
      route: "/",
      mode: "ssr",
      render: () => h(Home),
      renderOptions: {
        headTags: [{ type: "title", text: "Vue streaming" }],
      },
    }),
  ],
});
```

For strict no-inline CSP routes (`inlineScripts:false`, `inlineStyles:false`, or `rawHead:false`), FaceTheory buffers and validates the full streamed document before returning it. That preserves the same strict-CSP nonce, sidecar, and fail-closed behavior as buffered Vue SSR.

## Vite integration

For Vue + Vite SSR, use `viteAssetsForEntry` and `viteHydrationForEntry` from the core `vite.ts` module to pipe the dev/build manifest into your render options. The runnable shape is `ts/examples/vite-ssr-vue/src/entry-server.ts`:

```typescript
import { createFaceApp } from "@theory-cloud/facetheory";
import {
  viteAssetsForEntry,
  viteHydrationForEntry,
} from "@theory-cloud/facetheory";
import { createVueFace, h } from "@theory-cloud/facetheory/vue";

import { App } from "./app.js";

export function createApp(manifest) {
  return createFaceApp({
    faces: [
      createVueFace({
        route: "/",
        mode: "ssr",
        load: async () => ({ message: "from server" }),
        render: (_ctx, data) =>
          h("div", { id: "root" }, [h(App, { message: data.message })]),
        renderOptions: async (_ctx, data) => {
          const { headTags } = viteAssetsForEntry(
            manifest,
            "src/entry-client.ts",
            { includeAssets: true },
          );
          const hydration = viteHydrationForEntry(
            manifest,
            "src/entry-client.ts",
            data,
          );
          return { headTags, hydration };
        },
      }),
    ],
  });
}
```

## Sub-entry points

- `@theory-cloud/facetheory/stitch-tokens` — shared Stitch token utilities used by all adapters.
- `@theory-cloud/facetheory/vue/stitch-shell`, `/vue/stitch-hosted-auth`, `/vue/stitch-admin` — Stitch primitives for Vue.

## Examples in the repo

- `ts/examples/vite-ssr-vue/` — Vue + Vite SSR with hydration
- `ts/examples/vue-ssr-streaming/` — Vue streaming SSR

## Related docs

- [Render mode: SSR](../modes/ssr.md)
- [Deterministic head emission](../features/head.md)
- [SSR hydration sidecars](../features/ssr-hydration-sidecars.md)
