# Enumerated Changes: Operator Visibility Dashboard Primitives

Source scope: `docs/planning/SCOPED_NEED_OPERATOR_VISIBILITY_DASHBOARDS.md`.

This list keeps issue #93 inside the existing FaceTheory shape: no render-mode changes, no fourth adapter, no non-AWS deployment abstraction, no ISR/TableTheory storage change, no AppTheory runtime change, and no new package dependency. The work is an additive Stitch admin capability with React/Vue/Svelte parity.

### 1. Add shared operator visibility contracts

- **Paths**: `ts/src/stitch-admin/operator-visibility-types.ts`, `ts/src/stitch-admin/index.ts`, `docs/api-reference.md`
- **Layer**: stitch / docs
- **Render mode impact**: none
- **Determinism-sensitive**: no — this is type-only shared contract surface.
- **Acceptance**: `@theory-cloud/facetheory/stitch-admin` exports framework-neutral contracts for `AuthorityState`, `OperatorGuardState`, provenance/confidence/staleness metadata, health rows, visibility matrix rows/cells, and explicit empty-state intent.
- **Validation**: `cd ts && npm run typecheck`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(stitch-admin): add operator visibility contracts`

### 2. Add React authority notices, metadata badges, and explicit empty states

- **Paths**: `ts/src/react/stitch-admin/operator-notices.ts`, `ts/src/react/stitch-admin/index.ts`, `ts/test/unit/stitch-admin.test.ts`, `docs/api-reference.md`
- **Layer**: react adapter / stitch / docs
- **Render mode impact**: all render modes can render the primitives; no mode semantics change.
- **Determinism-sensitive**: no — components render caller-supplied stable labels and metadata only.
- **Acceptance**: React exports `NonAuthoritativeBanner`, metadata badge/group primitives, and `OperatorEmptyState`; SSR tests cover non-authoritative, stale, low-confidence, provenance, and no-mock empty states.
- **Validation**: `cd ts && npx tsx test/unit/stitch-admin.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(react): add operator visibility notice primitives`

### 3. Add Vue authority notices, metadata badges, and explicit empty states

- **Paths**: `ts/src/vue/stitch-admin/operator-notices.ts`, `ts/src/vue/stitch-admin/index.ts`, `ts/test/unit/vue-stitch-admin.test.ts`, `docs/api-reference.md`
- **Layer**: vue adapter / stitch / docs
- **Render mode impact**: all render modes can render the primitives; no mode semantics change.
- **Determinism-sensitive**: no — components render caller-supplied stable labels and metadata only.
- **Acceptance**: Vue exposes the same notice, badge/group, and empty-state conceptual surface as React with Vue-native slots/props; SSR tests assert parity markers and content.
- **Validation**: `cd ts && npx tsx test/unit/vue-stitch-admin.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(vue): add operator visibility notice primitives`

### 4. Add Svelte authority notices, metadata badges, and explicit empty states

- **Paths**: `ts/src/svelte/stitch-admin/NonAuthoritativeBanner.svelte`, `ts/src/svelte/stitch-admin/MetadataBadge.svelte`, `ts/src/svelte/stitch-admin/MetadataBadgeGroup.svelte`, `ts/src/svelte/stitch-admin/OperatorEmptyState.svelte`, `ts/src/svelte/stitch-admin/types.ts`, `ts/src/svelte/stitch-admin/index.ts`, `ts/test/unit/svelte-stitch-admin.test.ts`, `ts/test/run-unit.ts`, `docs/api-reference.md`, `docs/getting-started.md`
- **Layer**: svelte adapter / stitch / docs
- **Render mode impact**: all render modes can render the primitives; no mode semantics change.
- **Determinism-sensitive**: no — components render caller-supplied stable labels and metadata only.
- **Acceptance**: Svelte exposes notice, badge/group, and empty-state primitives with parity to React/Vue; a direct Svelte Stitch admin SSR/compile unit test is added to prevent relying only on broad Vite examples.
- **Validation**: `cd ts && npx tsx test/unit/svelte-stitch-admin.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(svelte): add operator visibility notice primitives`

### 5. Add React guarded operator shell states

- **Paths**: `ts/src/react/stitch-admin/operator-guard.ts`, `ts/src/react/stitch-admin/index.ts`, `ts/test/unit/stitch-admin.test.ts`, `docs/api-reference.md`
- **Layer**: react adapter / stitch / docs
- **Render mode impact**: ssr / spa
- **Determinism-sensitive**: no — guard output is selected from caller-supplied auth state, not read from ambient browser/session globals.
- **Acceptance**: React exports a guarded operator primitive that renders authorized children or explicit unauthorized/loading/error states without embedding Autheory or Pay Theory business logic.
- **Validation**: `cd ts && npx tsx test/unit/stitch-admin.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(react): add guarded operator shell states`

### 6. Add Vue guarded operator shell states

- **Paths**: `ts/src/vue/stitch-admin/operator-guard.ts`, `ts/src/vue/stitch-admin/index.ts`, `ts/test/unit/vue-stitch-admin.test.ts`, `docs/api-reference.md`
- **Layer**: vue adapter / stitch / docs
- **Render mode impact**: ssr / spa
- **Determinism-sensitive**: no — guard output is selected from caller-supplied auth state.
- **Acceptance**: Vue exposes the guarded operator primitive with parity to React, using Vue slots for authorized/fallback content and no embedded auth provider logic.
- **Validation**: `cd ts && npx tsx test/unit/vue-stitch-admin.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(vue): add guarded operator shell states`

### 7. Add Svelte guarded operator shell states

- **Paths**: `ts/src/svelte/stitch-admin/GuardedOperatorShell.svelte`, `ts/src/svelte/stitch-admin/types.ts`, `ts/src/svelte/stitch-admin/index.ts`, `ts/test/unit/svelte-stitch-admin.test.ts`, `docs/api-reference.md`, `docs/getting-started.md`
- **Layer**: svelte adapter / stitch / docs
- **Render mode impact**: ssr / spa
- **Determinism-sensitive**: no — guard output is selected from caller-supplied auth state.
- **Acceptance**: Svelte exposes the guarded operator primitive with parity to React/Vue and direct SSR tests for authorized, unauthorized, loading, and error states.
- **Validation**: `cd ts && npx tsx test/unit/svelte-stitch-admin.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(svelte): add guarded operator shell states`

### 8. Add React health/status panel primitives

- **Paths**: `ts/src/react/stitch-admin/health-status-panel.ts`, `ts/src/react/stitch-admin/index.ts`, `ts/test/unit/stitch-admin.test.ts`, `docs/api-reference.md`
- **Layer**: react adapter / stitch / docs
- **Render mode impact**: ssr / spa
- **Determinism-sensitive**: no — the panel displays caller-supplied health rows and stable timestamps/labels.
- **Acceptance**: React exports a health/status panel that renders healthy/degraded/down/unknown rows, API response metadata, and explicit stale/degraded visual markers.
- **Validation**: `cd ts && npx tsx test/unit/stitch-admin.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(react): add operator health status panel`

### 9. Add Vue health/status panel primitives

- **Paths**: `ts/src/vue/stitch-admin/health-status-panel.ts`, `ts/src/vue/stitch-admin/index.ts`, `ts/test/unit/vue-stitch-admin.test.ts`, `docs/api-reference.md`
- **Layer**: vue adapter / stitch / docs
- **Render mode impact**: ssr / spa
- **Determinism-sensitive**: no — the panel displays caller-supplied health rows and stable timestamps/labels.
- **Acceptance**: Vue exposes a health/status panel with parity to React and SSR tests for degraded/stale health states.
- **Validation**: `cd ts && npx tsx test/unit/vue-stitch-admin.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(vue): add operator health status panel`

### 10. Add Svelte health/status panel primitives

- **Paths**: `ts/src/svelte/stitch-admin/HealthStatusPanel.svelte`, `ts/src/svelte/stitch-admin/types.ts`, `ts/src/svelte/stitch-admin/index.ts`, `ts/test/unit/svelte-stitch-admin.test.ts`, `docs/api-reference.md`, `docs/getting-started.md`
- **Layer**: svelte adapter / stitch / docs
- **Render mode impact**: ssr / spa
- **Determinism-sensitive**: no — the panel displays caller-supplied health rows and stable timestamps/labels.
- **Acceptance**: Svelte exposes a health/status panel with parity to React/Vue and SSR tests for degraded/stale health states.
- **Validation**: `cd ts && npx tsx test/unit/svelte-stitch-admin.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(svelte): add operator health status panel`

### 11. Add React visibility matrix primitive

- **Paths**: `ts/src/react/stitch-admin/visibility-matrix.ts`, `ts/src/react/stitch-admin/index.ts`, `ts/test/unit/stitch-admin.test.ts`, `docs/api-reference.md`
- **Layer**: react adapter / stitch / docs
- **Render mode impact**: all render modes can render the primitive; no mode semantics change.
- **Determinism-sensitive**: no — cells render explicit caller-supplied values and metadata.
- **Acceptance**: React exports an entity × dimension matrix suitable for partner × service × environment views, with cell-level authority/confidence/staleness markers and explicit empty-cell behavior.
- **Validation**: `cd ts && npx tsx test/unit/stitch-admin.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(react): add operator visibility matrix`

### 12. Add Vue visibility matrix primitive

- **Paths**: `ts/src/vue/stitch-admin/visibility-matrix.ts`, `ts/src/vue/stitch-admin/index.ts`, `ts/test/unit/vue-stitch-admin.test.ts`, `docs/api-reference.md`
- **Layer**: vue adapter / stitch / docs
- **Render mode impact**: all render modes can render the primitive; no mode semantics change.
- **Determinism-sensitive**: no — cells render explicit caller-supplied values and metadata.
- **Acceptance**: Vue exposes the entity × dimension matrix with parity to React and SSR tests for metadata-rich cells and empty cells.
- **Validation**: `cd ts && npx tsx test/unit/vue-stitch-admin.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(vue): add operator visibility matrix`

### 13. Add Svelte visibility matrix primitive

- **Paths**: `ts/src/svelte/stitch-admin/VisibilityMatrix.svelte`, `ts/src/svelte/stitch-admin/types.ts`, `ts/src/svelte/stitch-admin/index.ts`, `ts/test/unit/svelte-stitch-admin.test.ts`, `docs/api-reference.md`, `docs/getting-started.md`
- **Layer**: svelte adapter / stitch / docs
- **Render mode impact**: all render modes can render the primitive; no mode semantics change.
- **Determinism-sensitive**: no — cells render explicit caller-supplied values and metadata.
- **Acceptance**: Svelte exposes the entity × dimension matrix with parity to React/Vue and SSR tests for metadata-rich cells and empty cells.
- **Validation**: `cd ts && npx tsx test/unit/svelte-stitch-admin.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(svelte): add operator visibility matrix`

### 14. Add an SSR operator visibility example with injected real-shaped data

- **Paths**: `ts/examples/operator-visibility-react/`, `ts/package.json`, `ts/test/unit/operator-visibility-example.test.ts`, `ts/test/run-unit.ts`, `docs/getting-started.md`, `docs/testing-guide.md`
- **Layer**: example / react adapter / docs
- **Render mode impact**: ssr / spa
- **Determinism-sensitive**: yes — the example demonstrates the deterministic SSR boundary for authority/staleness metadata and must not compute freshness labels from `Date.now()` during render.
- **Acceptance**: A runnable React SSR example renders a guarded operator dashboard from injected `load()` data, includes non-authoritative/stale/low-confidence states, contains no mock production-like partner/version values in placeholders, and has a unit test asserting deterministic output markers.
- **Validation**: `cd ts && npm run example:operator-visibility:build`; `cd ts && npx tsx test/unit/operator-visibility-example.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(examples): add operator visibility SSR example`

### 15. Document auth, cache, and no-mock-data boundaries for operator dashboards

- **Paths**: `docs/getting-started.md`, `docs/api-reference.md`, `docs/core-patterns.md`, `docs/testing-guide.md`, `README.md`
- **Layer**: docs
- **Render mode impact**: ssr / ssg / isr / spa
- **Determinism-sensitive**: no — documentation only, but it records determinism requirements for staleness labels.
- **Acceptance**: Consumer docs explain how to pass AppTheory/Autheory-derived auth state into FaceTheory without embedding Autheory logic, warn that auth-varying dashboards should avoid SSG and use ISR only with safe partitioning, and state that placeholder/empty screens must not include production-like mock data.
- **Validation**: `cd ts && npm run check`; documentation review against issue #93 acceptance criteria.
- **Conventional Commit subject**: `docs(stitch-admin): document operator visibility dashboard patterns`

## Self-check

- [x] Core runtime/render-mode primitives are not changed because the need fits inside Stitch/admin.
- [x] Shared contracts land before adapter implementations.
- [x] React, Vue, and Svelte implementations are enumerated for every shared visual primitive family.
- [x] Determinism-sensitive work is limited to the SSR example that demonstrates stable staleness metadata at the hydration boundary.
- [x] Examples and docs are included because this is consumer-facing UI surface.
- [x] No release manifests, version markers, dependencies, AWS-S3 code, ISR storage, or infrastructure stacks are part of the feature commits.
- [x] The full list satisfies issue #93's acceptance criteria without adding release-control-plane business logic to FaceTheory.
