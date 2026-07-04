# Navigation Pending Example

## Demonstrates

This example shows the navigation-pending browser helper as a neutral ESM entry. It starts `startNavigationPending()` for accepted same-origin link clicks and form submissions without taking over native navigation or mutating-form authority.

## Run

From `ts/`, typecheck the entry with the standard example compilation gate:

```bash
npm run typecheck
```

A host can bundle `navigation-pending-entry.ts`, or re-serve FaceTheory's built `dist/navigation-pending.js` same-origin and call `startNavigationPending()` from its own module.

## Backs

- `docs/getting-started.md` — control-plane navigation and pending-state guidance.
- Public package surface: `@theory-cloud/facetheory/navigation-pending`.
