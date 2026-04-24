# Scoped Need: Operator Visibility Dashboard Primitives

## Background

Pay Theory's `release-control-plane` needs Phase 1 operator visibility panels that show real imported release and partner visibility while making safety boundaries obvious. The UI must distinguish real data from placeholders, mark data as non-authoritative until a later gate transition, expose provenance/confidence/staleness metadata, and keep authorization integration outside FaceTheory's business logic. These patterns are reusable for Theory Cloud operator dashboards beyond `release-control-plane`.

## Driver

Pay Theory `release-control-plane` Phase 1, with likely reuse by future Theory Cloud operator/control-plane surfaces.

## Problem

FaceTheory's current Stitch shell/admin primitives provide generic layout, callouts, tables, status tags, logs, filters, and hosted-auth state cards, but they do not provide domain-neutral operator-visibility semantics. Downstream dashboards must currently hand-roll the same safety cues: non-authoritative data banners, provenance/confidence/staleness badges, guarded shell states, health/API panels, entity-by-dimension visibility matrices, and explicit empty states that cannot be mistaken for mock partner/version data.

## Render modes affected

Mode-agnostic primitives, with examples focused on SSR and SPA-shell use:

- **SSR:** supported and preferred for guarded operator pages that render request-authorized data through `load()`.
- **SPA:** supported for hydrated operator shells and client-refreshing health panels, while preserving deterministic initial shell output.
- **SSG:** only for static documentation/demo snapshots; not for live authorized visibility data.
- **ISR:** only for non-personalized, correctly partitioned visibility snapshots with explicit cache keys/tenant keys. Auth-varying dashboards should stay SSR or SPA.

## Adapters affected

All three first-class adapters: React, Vue, and Svelte. Shared data contracts belong under the framework-neutral Stitch contract surface; visual primitives must land under parallel adapter subpaths.

## Shape impact

Fits inside the existing FaceTheory shape as an additive Stitch capability. It does not add a render mode, adapter, deployment target, or alternate render pipeline. The likely shape is a new operator-visibility grouping within Stitch admin contracts and parallel React/Vue/Svelte visual primitives, implemented using existing SSR/SPA rendering paths.

## Determinism impact

Preserves determinism if the primitives receive already-resolved display values and serialized metadata rather than reading time/random/browser state during render. Staleness display must be deterministic at the server/client boundary: examples should pass ISO timestamps, stable labels, or server-computed age text through `load()`/hydration data instead of recomputing `Date.now()` during render. Empty/loading/unauthorized states must render explicit stable markup.

## AWS-first posture

Preserves the AWS-first posture. Health/status examples should assume a Lambda/API response behind AppTheory/FaceTheory on AWS and should not introduce non-AWS deployment abstractions. Auth examples may show AppTheory request handling and caller-supplied authorization state, but FaceTheory must not embed Autheory or Pay Theory business rules.

## Success criteria

- Shared operator-visibility contracts exist for:
  - authority/non-authoritative state,
  - provenance/confidence/staleness metadata,
  - guarded operator access states,
  - health/status panel rows,
  - entity × dimension visibility matrix rows/cells,
  - explicit empty/placeholder states that prohibit mock production-like values.
- React, Vue, and Svelte expose parallel visual primitives for those contracts.
- SSR tests for each adapter verify stable class markers and deterministic output for authorized, unauthorized, empty, stale, low-confidence, and health-degraded states.
- At least one example shows a guarded operator visibility page using real-shaped injected data without shipping release-control-plane business logic.
- Documentation explains how to connect AppTheory/Autheory-derived auth state without putting Autheory logic inside FaceTheory.
- Documentation explicitly warns that auth-varying visibility dashboards should not use SSG, and should use ISR only with safe cache partitioning.

## Nearest existing surface

- `@theory-cloud/facetheory/stitch-shell`: `Shell`, `PageFrame`, `Panel`, `Callout`, navigation helpers, and brand/surface slots.
- `@theory-cloud/facetheory/stitch-admin`: `TabItem`, `FilterChipConfig`, `LogEntry`, `LogLevel`, `StatusVariant`.
- Adapter visual subpaths: `react/stitch-admin`, `vue/stitch-admin`, `svelte/stitch-admin` already provide `DataTable`, `StatusTag`, `DetailPanel`, `InlineKeyValueList`, and `LogStream`.
- `@theory-cloud/facetheory/apptheory`: request adapter surface for AWS Lambda Function URL handling via AppTheory.

## Out of scope

- Release-control-plane-specific release, partner, pin, rollback, deploy, promotion, or gate-transition business logic.
- Embedding Autheory authorization rules or session validation in FaceTheory.
- Treating Linear, GitHub, or any external tracker as the source of truth for the UI.
- A fifth render mode, a fourth framework adapter, or non-AWS deployment portability.
- Client-side-only rendering with no SSR shell.
- Cache invalidation or persistence changes in ISR/TableTheory.

## Open questions

- Should the new surface live under existing `stitch-admin` exports, or as a narrower `stitch-operator` subpath? Default recommendation: keep it under `stitch-admin` unless the enumerated surface becomes too large.
- Should the guarded shell be a dedicated component (`OperatorGuard` / `GuardedOperatorShell`) or a documented composition of `Shell`, `PageFrame`, and state primitives? Default recommendation: provide a small guard component that accepts caller-supplied state and delegates layout to existing shell primitives.
- What naming should win for data authority: `NonAuthoritativeBanner`, `DataAuthorityBanner`, or `AuthorityNotice`? Default recommendation: use explicit `NonAuthoritativeBanner` for the high-risk warning and shared `AuthorityState` for contracts.
- Does Pay Theory need the health/status panel to be SSR-loaded only for Phase 1, or also client-refreshing after hydration? Default recommendation: document both, with deterministic SSR initial state.
