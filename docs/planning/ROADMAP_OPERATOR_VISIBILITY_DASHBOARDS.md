# Roadmap: Operator Visibility Dashboard Primitives

## Goal

Deliver issue #93 as an additive Stitch admin capability: shared operator-visibility contracts plus React, Vue, and Svelte visual primitives for guarded operator dashboards, non-authoritative data, provenance/confidence/staleness metadata, health/status panels, entity × dimension visibility matrices, and explicit no-mock empty states. The roadmap keeps FaceTheory inside its existing SSR/SSG/ISR/SPA and React/Vue/Svelte shape while giving Pay Theory `release-control-plane` reusable Phase 1 dashboard building blocks.

## Render modes and adapters affected

| Surface                     | SSR |               SSG |                              ISR |              SPA |
| --------------------------- | --: | ----------------: | -------------------------------: | ---------------: |
| Shared contracts            | yes |               yes |                              yes |              yes |
| React primitives            | yes |               yes | yes, only with safe partitioning |              yes |
| Vue primitives              | yes |               yes | yes, only with safe partitioning |              yes |
| Svelte primitives           | yes |               yes | yes, only with safe partitioning |              yes |
| Operator visibility example | yes | no live auth data |        no live auth-varying data | shell-compatible |

SSG and ISR can render static or safely partitioned visibility snapshots, but auth-varying operator dashboards should use SSR or a deterministic SPA shell.

## Determinism impact

The primitive work preserves determinism because components render caller-supplied state and metadata. The new determinism surface is the example and documentation for staleness/freshness: freshness labels must be server-computed or passed as stable serialized values rather than recomputed from `Date.now()` during render or hydration.

## Phases

### Phase 1: Shared contracts and safety-state primitives

**Milestone candidates:**

- **Operator visibility contracts** — Add the framework-neutral data shapes that every adapter uses.
  - Items: 1
  - Dependencies: none
  - Determinism-sensitive: no
  - Risks:
    - Naming churn can leak into all adapter APIs; mitigate by keeping names explicit (`AuthorityState`, `NonAuthoritativeBanner`, `OperatorGuardState`) and documenting semantics immediately.

- **Operator safety states across adapters** — Add non-authoritative notices, metadata badges, explicit empty states, and guarded operator shell states for React, Vue, and Svelte.
  - Items: 2, 3, 4, 5, 6, 7
  - Dependencies: item 1
  - Determinism-sensitive: no
  - Risks:
    - Svelte lacks the same direct stitch-admin unit coverage density as React/Vue; mitigate by adding `svelte-stitch-admin.test.ts` with compile/SSR assertions in the first Svelte primitive commit.
    - Guarded shell naming could imply FaceTheory owns auth; mitigate through caller-supplied guard state and docs that AppTheory/Autheory derive auth outside FaceTheory.

### Phase 2: Operational status and visibility surfaces

**Milestone candidates:**

- **Health panels across adapters** — Add status/health panel primitives that render Lambda/API-backed rows without fetching during render.
  - Items: 8, 9, 10
  - Dependencies: item 1; Phase 1 tests/patterns for adapter parity
  - Determinism-sensitive: no
  - Risks:
    - Consumers may expect the component to poll APIs; mitigate by keeping primitives presentational and documenting SSR initial state plus optional downstream client refresh.

- **Visibility matrices across adapters** — Add entity × dimension matrix primitives with cell-level metadata and empty-cell handling.
  - Items: 11, 12, 13
  - Dependencies: item 1; metadata badge primitives from Phase 1
  - Determinism-sensitive: no
  - Risks:
    - Matrix composition can drift across adapters; mitigate with shared row/cell contracts and SSR tests that assert the same class markers and semantic states across React/Vue/Svelte.

### Phase 3: Example, documentation, and release readiness

**Milestone candidates:**

- **Operator visibility SSR example** — Add a runnable React SSR example using injected real-shaped data and deterministic metadata.
  - Items: 14
  - Dependencies: Phases 1 and 2
  - Determinism-sensitive: yes
  - Risks:
    - Example tests can become flaky if they spawn dev servers through `npm run`; mitigate by either testing through `app.handle()` directly or spawning the underlying `tsx` process directly if an end-to-end server test is required.
    - Example placeholders could accidentally look like production data; mitigate with explicit no-data copy and test assertions that fixture placeholders do not include partner/version-looking values.

- **Operator dashboard guidance** — Document auth, cache, and no-mock boundaries for downstream operator dashboards.
  - Items: 15
  - Dependencies: Phases 1 and 2; example shape from item 14
  - Determinism-sensitive: no
  - Risks:
    - Docs may overstep into Autheory or release-control-plane logic; mitigate by documenting integration boundaries and caller-supplied state only.

## Release rollout plan

1. Implement on feature branch(es) targeting `staging`.
2. Land milestones to `staging` only after `cd ts && npm run check` and affected examples/tests pass.
3. Merge `staging` to `premain` to produce an RC, likely `v1.1.0-rc.N` assuming the current `1.0.x` line.
4. Ask Pay Theory to validate `release-control-plane` Phase 1 against the RC tarball before stable promotion.
5. If Autheory consumes affected Stitch admin/shell surfaces, notify Autheory for optional smoke validation; no Autheory code change is required by this roadmap.
6. After RC soak and downstream validation, merge `premain` to `main` for stable `v1.1.0`.
7. Back-merge `main` into `staging` after the stable release.

Recommended RC soak: short but explicit, at least one Pay Theory integration pass against the pinned RC release asset.

## Version-bump implication

Minor release: this is additive public API (`feat(stitch-admin)`, `feat(react)`, `feat(vue)`, `feat(svelte)`, `feat(examples)`) with no breaking contract. A feature release should move the line from `1.0.x` to `1.1.0` unless other pending release-please state changes the target.

## Cross-phase risks

- **Adapter parity risk:** React implementation may be easiest because AntD is already in the React admin surface. Vue and Svelte must remain first-class; no milestone is shippable until all three adapters have the same conceptual primitive family.
- **Determinism risk:** Staleness labels are tempting to compute during render. Mitigation: shared docs and examples require stable serialized timestamps/labels or server-computed age text.
- **Auth-boundary risk:** A guarded operator primitive could be mistaken for an authorization framework. Mitigation: contracts accept caller-supplied state; docs keep Autheory/AppTheory derivation outside FaceTheory.
- **ISR misuse risk:** Downstream dashboards may cache auth-varying HTML. Mitigation: docs explicitly warn to keep auth-varying dashboards SSR/SPA or provide safe ISR cache/tenant partitioning.
- **Example maintenance risk:** The new example becomes public API documentation. Mitigation: add a focused test and include the example build in validation for changes that touch these primitives.

## Cross-repo coordination

- **AppTheory:** no code change required. Docs should reference the existing AppTheory entrypoint and caller-supplied auth state.
- **TableTheory:** no change required. ISR cache semantics are documentation-only warnings.
- **Autheory:** no blocking change. Optional smoke validation if Autheory wants to consume the new guarded operator/shell patterns.
- **Pay Theory:** required downstream validation against the RC for `release-control-plane` Phase 1 before stable promotion.

## Open questions

- Confirm that the example should be React-first because Pay Theory `release-control-plane` is the immediate driver.
- Confirm whether Pay Theory needs client-refreshing health rows in Phase 1, or whether SSR-loaded health state plus documented refresh extension is enough.
- Confirm final component names before Linear creation: `NonAuthoritativeBanner`, `MetadataBadgeGroup`, `OperatorEmptyState`, `GuardedOperatorShell`, `HealthStatusPanel`, and `VisibilityMatrix` are the roadmap defaults.
