# Vue SSG Example

## Demonstrates

This example statically generates a real Vue tree at build time. It uses
`createVueFace({ mode: 'ssg' })` with a render-function component, injects Vite
client assets (CSS + hydration module) from the build manifest via
`viteAssetsForEntry`, and pre-renders a dynamic `/products/{slug}` route with
`generateStaticParams` alongside a static `/` catalog page. `buildSsgSite` writes
each page to `dist-static`, and the pages carry inline hydration data so the Vue
tree hydrates on the client. The build (Vite client bundle → SSG render) is
smoke-tested in CI.

## Run

From `ts/`:

```bash
npm run example:vue:ssg:build
npm run example:vue:ssg:serve
```

`example:vue:ssg:build` runs the Vite client build, then `buildSsgSite` renders
the Vue Faces into `examples/vue-ssg/dist-static` (one page per product from
`generateStaticParams`). `example:vue:ssg:serve` serves that static output plus
the built client assets at `http://localhost:4182`.

## Backs

- `docs/modes/ssg.md` — build-time static generation and `generateStaticParams`.
- `docs/adapters/vue.md` — Vue adapter rendering.
- Public package surface: `createVueFace` / `h` from `@theory-cloud/facetheory/vue`
  plus `buildSsgSite`, `viteAssetsForEntry`, and `viteHydrationForEntry` from
  `@theory-cloud/facetheory`.
