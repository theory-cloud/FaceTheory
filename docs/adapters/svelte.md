---
title: Svelte adapter
---

The Svelte adapter renders Faces using Svelte 5's SSR output. Components compile to a server module exporting `render()`; FaceTheory wires that through the same `FaceModule` contract used by React and Vue.

## Install

```bash
npm install --save-exact \
  https://github.com/theory-cloud/FaceTheory/releases/download/v3.4.2/theory-cloud-facetheory-3.4.2.tgz \
  svelte
```

## Minimal Face

`createSvelteFace.render` returns a `SvelteRenderInput`:

```typescript
interface SvelteRenderInput<Props = Record<string, unknown>> {
  component: unknown;          // Compiled Svelte component
  props?: Props;
  cssText?: string;            // Build-time CSS (Svelte 5 emits at compile)
}
```

The runnable shape is `ts/examples/vite-ssr-svelte/src/entry-server.ts`:

```typescript
import { createFaceApp, createLambdaUrlStreamingHandler } from '@theory-cloud/facetheory';
import { createSvelteFace } from '@theory-cloud/facetheory/svelte';

import App from './App.svelte';

export const app = createFaceApp({
  faces: [
    createSvelteFace({
      route: '/',
      mode: 'ssr',
      load: async () => ({ message: 'from server' }),
      render: (_ctx, data) => ({
        component: App,
        props: { message: (data as { message: string }).message },
      }),
      renderOptions: {
        headTags: [{ type: 'title', text: 'FaceTheory Svelte SSR' }],
      },
    }),
  ],
});

export const handler = createLambdaUrlStreamingHandler({ app });
```

## Library-host pattern

For consuming a Svelte component library that is built and distributed separately from the SSR host, see `ts/examples/vite-ssr-svelte-library/` and `ts/examples/svelte-component-library/`. The host imports compiled output from the library package and renders it through the same `createSvelteFace` boundary; the library is responsible for emitting its own CSS through `cssText` on the render input.

## Strict-CSP Svelte

Svelte plays well with the strict no-inline CSP path because its compile-time CSS extraction avoids inline `<style>` injection. See `ts/examples/vite-strict-csp-svelte/` and [Strict CSP](../features/strict-csp.md).

## Sub-entry points

- `@theory-cloud/facetheory/svelte/stitch-shell`, `/svelte/stitch-hosted-auth`, `/svelte/stitch-admin` — Stitch primitives for Svelte.

## Examples in the repo

- `ts/examples/vite-ssr-svelte/` — Svelte + Vite SSR
- `ts/examples/vite-ssr-svelte-library/` — external Svelte library host
- `ts/examples/vite-strict-csp-svelte/` — strict no-inline CSP delivery
- `ts/examples/svelte-component-library/` — library packaging shape

## Related docs

- [Render mode: SSR](../modes/ssr.md)
- [Strict CSP](../features/strict-csp.md)
- [SSR hydration sidecars](../features/ssr-hydration-sidecars.md)
