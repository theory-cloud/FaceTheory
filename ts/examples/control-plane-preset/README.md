# Control Plane Preset Example

## Demonstrates

This example exercises the built-in control-plane preset in relaxed and strict CSP modes, and in both client-fill and streaming section delivery. It verifies the external control-plane assets, strict CSP header shape, section endpoint, and HEAD handling for the bootstrap module.

## Run

From `ts/`, run any preset combination:

```bash
npm run example:control-plane:client-fill:relaxed
npm run example:control-plane:client-fill:strict
npm run example:control-plane:streaming:relaxed
npm run example:control-plane:streaming:strict
```

The scripts print a JSON summary and assert the expected HTML, headers, assets, and section delivery behavior.

## Backs

- `docs/features/control-plane-boundary.md` — control-plane guardrails.
- `docs/getting-started.md` — brand-agnostic surface primitives and control-plane navigation guidance.
- Public package surface: `@theory-cloud/facetheory/control-plane`.
