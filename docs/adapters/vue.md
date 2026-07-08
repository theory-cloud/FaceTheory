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

When a Vue streaming Face uses an integration with `contribute` or `finalize`, FaceTheory waits for Vue's server renderer to finish before assembling `<head>` and structured style tags. This keeps request-local styles registered by async component trees through `wrapApp` visible to `contribute`, while the response body still uses the `AsyncIterable<Uint8Array>` contract after head/style assembly is complete.

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

## Style extraction position

The supported Vue default is **build-time CSS through Vite**. Import component and library CSS in the client/Vite graph, then emit Vite's manifest-derived stylesheet tags with `viteAssetsForEntry(...)` so SSR, SSG, ISR, and hydration all see the same deterministic assets. This is the recommended path for Vue SFC scoped styles and application CSS.

FaceTheory does not ship a Vue-specific runtime CSS-in-JS extractor. If a Vue CSS-in-JS library needs SSR setup, integrate it through the adapter integration hooks:

1. `wrapApp(app, ctx, state)` installs the Vue plugin/provider for the request-local render.
2. The Vue render records styles into that request-local state.
3. `contribute(ctx, state)` returns structured `styleTags` (or external stylesheet `headTags`) for FaceTheory to serialize, nonce, order, and validate. In streaming mode, FaceTheory waits for async Vue render completion before calling `contribute` when an integration can contribute or finalize, so async setup/render style records are not omitted from the document head.

```typescript
import type { App, InjectionKey } from "vue";
import { inject } from "vue";
import {
  createVueFace,
  h,
  type VueUIIntegration,
} from "@theory-cloud/facetheory/vue";

const registerStyleKey: InjectionKey<(cssText: string) => void> =
  Symbol("register-style");

const cssInJsIntegration: VueUIIntegration<{ styles: string[] }> = {
  name: "example-vue-css-in-js",
  createState: () => ({ styles: [] }),
  wrapApp(app: App, _ctx, state) {
    app.provide(registerStyleKey, (cssText: string) => {
      state.styles.push(cssText);
    });
  },
  contribute(_ctx, state) {
    return {
      styleTags: state.styles.map((cssText, index) => ({
        cssText,
        attrs: { id: `example-vue-css-${index}` },
      })),
    };
  },
};

const StyledPanel = {
  setup() {
    const registerStyle = inject(registerStyleKey);
    registerStyle?.(".panel{color:rgb(12,34,56);}");
    return () => h("section", { class: "panel" }, "Styled by wrapApp");
  },
};

createVueFace({
  route: "/",
  mode: "ssr",
  render: () => h(StyledPanel),
  renderOptions: {
    integrations: [cssInJsIntegration],
  },
});
```

Do not inject raw `<style>` strings through component HTML or `head.html`. Use `styleTags`/structured head tags so FaceTheory can preserve deterministic head ordering and strict-CSP behavior. For strict no-inline CSP, prefer external CSS assets over inline `styleTags`.

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
