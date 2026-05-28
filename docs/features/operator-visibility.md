---
title: Operator visibility dashboards
---

FaceTheory's Stitch primitives include operator-visibility contracts and React, Vue, and Svelte primitives for guarded operator dashboards. The integration boundary is deliberate: hosts pass AppTheory- / Autheory-derived auth state into FaceTheory as caller-supplied `OperatorGuardStatus`, and FaceTheory renders that state. **FaceTheory does not validate sessions or embed Autheory business logic.**

## The Stitch surface

Three Stitch sub-packages compose into operator dashboards:

- **`@theory-cloud/facetheory/stitch-tokens`** — design tokens (color modes, palettes, typography, roundness, spacing). Exported as `StitchTokenSet` and rendered to CSS variables via `stitchToCssVars`.
- **`@theory-cloud/facetheory/stitch-shell`** — navigation, breadcrumbs, callouts, and surface tone primitives. Includes `resolveActiveNav()` for nav-state derivation.
- **`@theory-cloud/facetheory/stitch-admin`** — operator UI contracts (tabs, filters, log rows, status badges, wizard steps, audit trails, package upload, selectable cards, editable tokens, operator-visibility metadata).

Adapter-specific entry points expose the rendering primitives:

- `@theory-cloud/facetheory/react/stitch-admin`, `/vue/stitch-admin`, `/svelte/stitch-admin`
- `@theory-cloud/facetheory/react/stitch-shell`, `/vue/stitch-shell`, `/svelte/stitch-shell`
- `@theory-cloud/facetheory/react/stitch-hosted-auth`, `/vue/stitch-hosted-auth`, `/svelte/stitch-hosted-auth`

## The boundary

Operator dashboards are rendered from caller-supplied state. The host:

1. Authenticates the operator (typically through Autheory).
2. Derives an `OperatorGuardStatus` (and related visibility metadata) from the authenticated session.
3. Passes that state into the FaceTheory Face for rendering.

FaceTheory:

1. Renders the state through the Stitch admin primitives.
2. Applies the appropriate empty / placeholder states when the host indicates no-data or insufficient permissions.
3. Does not call into Autheory, AppTheory, or any session backend at render time.

This means operator dashboards work the same way across SSR, SSG, and ISR — FaceTheory is rendering what it's told. Authorization decisions happen above FaceTheory.

## Mode selection

- **For auth-varying dashboards, prefer SSR or a deterministic SPA shell.** Per-request rendering keeps the operator's view aligned with their session state.
- **Avoid SSG for live authorized visibility data.** SSG renders at build time; it cannot reflect per-operator state.
- **Use ISR only when the cache key fully separates every request-varying dimension** (operator, tenant, release, version). Otherwise ISR's tenant fail-closed default will refuse to serve — see [ISR tenant safety](isr-tenant-safety.md).

## Empty and placeholder states

Empty and placeholder states must use explicit no-data copy, not production-like partner / tenant / release / version mock values. The `stitch-admin` types encode this distinction directly (the staleness state and visibility matrix have explicit no-data variants).

## Related docs

- [API Reference → Operator Visibility Dashboard Boundary](../api-reference.md#operator-visibility-dashboard-boundary)
- [Core Patterns → Build operator dashboards from caller-supplied state](../core-patterns.md#pattern-build-operator-dashboards-from-caller-supplied-state)
- [Getting Started → Add Stitch control-plane primitives](../getting-started.md#add-stitch-control-plane-primitives)
- [Autheory integration](../integrations/autheory.md)
