# SPA Navigation Example

## Demonstrates

This example shows end-to-end FaceTheory SPA navigation across two SSR Faces
(`/` and `/details`) sharing a persistent shell. It wires `startFaceNavigation`
to intercept same-origin link clicks, swap only the `[data-facetheory-view]`
region, and sync the head; `startNavigationPending` to surface a pending
indicator while a navigation is in flight; and a per-Face `hydrateFaceNavigation`
hook that runs after each swap. Each Face publishes its hydration data as an
external SSR sidecar (`__FACETHEORY_DATA_URL__` → `/spa-data/<page>.json`, served
with `jsonResourceResponse`), so navigation loads the target Face's data from its
sidecar before running the hook. The full flow (initial hydration, link
navigation, sidecar load, view swap, pending clear) is smoke-tested in CI.

## Run

From `ts/`, run the CI-covered smoke:

```bash
node --import tsx --test --test-concurrency=1 test/unit/examples-spa-navigation.test.ts
```

Or serve it in a browser (the client entry is bundled with esbuild on startup):

```bash
npm run example:spa-navigation:serve
```

Open `http://localhost:4181/` and navigate between Home and Details — only the
view region and head change, and each Face's data loads from its sidecar.

## Backs

- `docs/modes/spa.md` — SPA shell + client navigation shape.
- `docs/features/ssr-hydration-sidecars.md` — external hydration sidecars.
- `docs/core-patterns.md` — `startFaceNavigation` / navigation-pending wiring.
- Public package surface: `startFaceNavigation` from `@theory-cloud/facetheory/spa`,
  `startNavigationPending` from `@theory-cloud/facetheory/navigation-pending`,
  and `createFaceApp` / `jsonResourceResponse` from `@theory-cloud/facetheory`.
