# Roadmap: Strict CSP Hydration and Navigation

Source scope: `docs/planning/SCOPED_NEED_STRICT_CSP_HYDRATION_NAVIGATION.md`.
Source enumeration: `docs/planning/ENUMERATED_CHANGES_STRICT_CSP_HYDRATION_NAVIGATION.md`.

## Goal

Deliver a first-class strict no-inline CSP path for FaceTheory hydration, head/style emission, SPA navigation, SSG/ISR sidecars, OAC navigation handoff, and adapter parity across React, Vue, and Svelte. The roadmap keeps FaceTheory inside the existing SSR/SSG/ISR/SPA and React/Vue/Svelte shape while giving Simulacrum and future installed-client consumers an auditable invariant: strict routes do not rely on inline scripts/styles and fail closed when FaceTheory-owned surfaces would violate that policy.

## Render modes and adapters affected

| Surface | SSR | SSG | ISR | SPA |
|---|---:|---:|---:|---:|
| Core hydration/head policy | yes | yes | yes | yes |
| External hydration data | yes, consumer `dataUrl` first | yes, sidecar JSON | yes, pointer-derived sidecar | yes, async fetch/load |
| React adapter | yes | via generated output | via generated output | shell/navigation |
| Vue adapter | yes | via generated output | via generated output | shell/navigation |
| Svelte adapter | yes | via generated output | via generated output | shell/navigation |
| OAC navigation | form outcomes | static form pages | cached form pages | navigation handoff |

## Determinism impact

This roadmap introduces a new determinism-sensitive surface: the server-rendered HTML and externally served hydration JSON must remain an exact pair. The strict path strengthens determinism by preventing app-local recomputation of client props, but every core, adapter, SSG, ISR, and SPA helper change must preserve the server/client data equivalence that the legacy inline hydration script currently provides. Streaming paths must fail closed when they cannot be certified before first byte.

## Phases

### Phase 1: Core strict-CSP contracts and external hydration

**Milestone candidates:**

- **strict-csp-core-contracts** — Establish the adapter-neutral policy, hydration union, head validation, Vite helper, and SPA external hydration loading.
  - Items: 1, 2, 3, 4
  - Dependencies: approved scoped need and enumeration
  - Determinism-sensitive: yes
  - Risks:
    - Public type shape could be hard to migrate if the discriminant is wrong; mitigate by preserving legacy inline shape and keeping helper names explicit.
    - SPA sync APIs cannot fetch external data; mitigate with additive async helpers while retaining legacy synchronous parsing.
    - Cross-origin data/module references could weaken CSP; mitigate with same-origin defaults and fail-closed tests.

### Phase 2: Runtime enforcement and delivery-mode storage

**Milestone candidates:**

- **strict-csp-runtime-enforcement** — Enforce strict policy before response flush and expose canonical strict-CSP security helpers.
  - Items: 5, 6
  - Dependencies: strict-csp-core-contracts
  - Determinism-sensitive: yes
  - Risks:
    - Streaming failures after flush would be unrecoverable; mitigate by validating/certifying before streaming begins or rejecting uncertifiable configurations.
    - Header builder could imply FaceTheory owns deployment headers; mitigate by keeping attachment explicit in docs and APIs.

- **strict-csp-static-isr-sidecars** — Make SSG and ISR produce/cache strict external hydration sidecars without TableTheory schema changes.
  - Items: 7, 8
  - Dependencies: strict-csp-core-contracts, strict-csp-runtime-enforcement for policy semantics
  - Determinism-sensitive: yes
  - Risks:
    - Pointer-derived ISR sidecars may not cover all consistency cases; mitigate with stale/failure tests and stop for TableTheory coordination if needed.
    - SSG must avoid changing existing non-strict output; mitigate with compatibility snapshots and explicit strict options.

### Phase 3: Navigation and adapter parity

**Milestone candidates:**

- **strict-csp-navigation-oac** — Add named CSP-safe OAC navigation policies and external-hydration-aware SPA handoff.
  - Items: 9
  - Dependencies: strict-csp-core-contracts and SPA external hydration loading
  - Determinism-sensitive: no for initial render, but CSP/fail-closed sensitive
  - Risks:
    - Partial DOM navigation can drift from full document CSP semantics; mitigate by making full same-origin navigation the strict default and SPA handoff explicit.

- **strict-csp-adapter-parity** — Wire React, Vue, and Svelte into the strict policy with parity tests and adapter-specific fail-closed behavior.
  - Items: 10, 11, 12
  - Dependencies: strict-csp-runtime-enforcement
  - Determinism-sensitive: yes
  - Risks:
    - React streaming/Suspense may emit inline scripts in some paths; mitigate by rejecting or using safe all-ready/buffered strategy for strict routes.
    - Svelte raw head parsing is risky; mitigate by rejecting raw Svelte SSR `head` under strict mode in the first implementation.
    - Vue may appear trivial and miss parity tests; mitigate with explicit Vue strict success/failure coverage.

### Phase 4: Examples and validation gates

**Milestone candidates:**

- **strict-csp-example-validation** — Add the canonical Simulacrum-shaped Svelte/Vite example and reusable strict-CSP validation harness.
  - Items: 13, 14
  - Dependencies: strict-csp-static-isr-sidecars and strict-csp-adapter-parity
  - Determinism-sensitive: yes
  - Risks:
    - Example may become too Simulacrum-specific; mitigate by using Simulacrum-shaped constraints without Simulacrum business logic.
    - Browser validation can be brittle; mitigate with DOM/CSP structural tests plus an example build gate.

### Phase 5: Documentation, deployment guidance, and release readiness

**Milestone candidates:**

- **strict-csp-docs-release** — Document APIs, migration, AWS deployment, RC validation, and release promotion criteria.
  - Items: 15, 16
  - Dependencies: all behavior milestones or at least stable final API names
  - Determinism-sensitive: no, but documents determinism-sensitive behavior
  - Risks:
    - Docs lagging code would make strict mode hard to adopt; mitigate by landing docs before RC promotion.
    - Deployment guidance could imply non-AWS portability; mitigate by naming S3, CloudFront, Lambda, OAC, and TableTheory boundaries explicitly.

## Release rollout plan

1. Land milestone PRs into `staging` in phase order.
2. Run `cd ts && npm run check` on every milestone PR; run affected examples for adapter/example milestones.
3. Before opening or updating any PR into `staging`, run `scripts/verify-version-alignment.sh` and confirm stable and premain manifests remain aligned with the intended line.
4. Promote `staging` to `premain` after all milestones land and examples/docs are complete.
5. Let Release Please create the prerelease candidate from `premain`; do not create tags or assets manually.
6. Simulacrum validates the RC tarball against its strict-CSP dogfood path without loosening CSP or patching FaceTheory locally.
7. RC soak should include at least: strict Svelte/Vite example build, SPA navigation with external hydration, SSG sidecar output, ISR sidecar cache hit/stale paths, and OAC strict navigation policy tests.
8. After RC validation, promote `premain` to `main`, inspect the stable Release Please PR version/changelog against the latest stable baseline, merge only if correct, and verify the stable GitHub Release assets.
9. Back-merge `main` into `staging` after stable release so the next cycle starts from the released baseline.

## Version-bump implication

Minor release. The capability is additive and preserves legacy nonce-compatible inline hydration, but it introduces a substantial new public API surface. FaceTheory is pre-1.0 in stewardship posture historically, but the current release line is `3.1.2`; under semver, this should be a minor feature release unless implementation discovers a breaking API change. If any commit removes or changes existing behavior, it must use `feat!:`/`fix!:` and the roadmap must be revisited before release.

## Cross-phase risks

- **Hydration pair consistency:** external JSON must match server-rendered HTML across SSR, SSG, ISR, and SPA. Mitigation: pair data URL/key generation with render output and test stale/failed sidecar paths.
- **Streaming certification:** strict mode cannot discover violations after flush. Mitigation: preflight validation, all-ready/buffered fallback, or fail-closed rejection.
- **Adapter parity:** React has streaming/style complexity, Svelte has raw head/CSS fallback complexity, Vue can be under-tested. Mitigation: separate adapter items with explicit success/failure tests.
- **Raw consumer body limits:** FaceTheory-owned surfaces are certified first; arbitrary body validation remains optional/test utility. Mitigation: document the boundary and provide a validation harness.
- **ISR/TableTheory boundary:** pointer-derived sidecars are preferred to avoid schema changes. Mitigation: stop and coordinate with TableTheory if consistency requires metadata changes.
- **OAC/navigation semantics:** fetched CSP-protected HTML cannot be installed with `document.write()`. Mitigation: full same-origin navigation default and explicit SPA policy.
- **Version/release hygiene:** this project spans many deterministic surfaces. Mitigation: normal staging → premain → main flow, RC validation, Release Please only, no manual tags/assets.

## Cross-repo coordination

- **Simulacrum:** primary RC validator and source of strict-CSP acceptance criteria.
- **TableTheory:** no schema change expected. Coordinate only if ISR sidecar consistency cannot be solved by pointer-derived keys.
- **AppTheory:** no runtime change expected. Coordination may be needed only if CSP header attachment or OAC navigation docs reveal an AppTheory construct gap.
- **Autheory / Pay Theory:** notify if final API changes affect hosted-auth/control-plane or checkout integration patterns, but no direct dependency is known at roadmap time.

## Open questions

- Final public names for the policy object, hydration discriminants, helper, and navigation policies.
- Whether optional body/document validation should be public API in the first release or test utility only.
- Whether the canonical strict example should be a new `vite-strict-csp-svelte` example or an extension of the existing Svelte Vite example. Default recommendation: a new example to avoid weakening current non-strict example coverage.
- Whether any consumer besides Simulacrum needs FaceTheory-owned SSR hydration data storage in the first release. Default recommendation: defer until a concrete need appears.
