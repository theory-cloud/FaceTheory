# Roadmap: Product Strengthening (Assessment Remediation + Full Svelte 5 Migration)

**Date:** 2026-07-02
**Inputs:** `docs/planning/SCOPED_NEED_PRODUCT_STRENGTHENING.md`,
`docs/planning/ENUMERATED_CHANGES_PRODUCT_STRENGTHENING.md` (53 items)
**Fixed constraints:** items 1–45 ride the fix/additive release train (addendum items 54–55 are
additive and unordered, 55 externally gated); item 46 (Svelte SSR fixtures) must land before 47–50;
items 47–53 ship together as one deliberate **v4.0.0** breaking release. Cross-steward asks
(TableTheory meta schema + purge; AppTheory `distributionPaths`) are external dependencies tracked as
coordination, never milestone work.
**Alignment rule (user directive, 2026-07-02):** FaceTheory aligns with the AppTheory and TableTheory
improvement programs unless an explicit reason to diverge is recorded in this document. Current recorded
divergences: ESM-only packaging (aligns with AppTheory's ESM-only TS package; TableTheory's CJS support
is foundation-layer breadth the upper layers deliberately do not mirror). The former Node ≥24 divergence
is retired: item 55 lowers the floor to Node 20 LTS in step with AppTheory item 94 and TableTheory
items 16–17.

## Goal

Convert the 2026-07-02 product assessment into shipped releases: first a fix/additive train that makes
FaceTheory's failures visible and survivable, its primary types safe, its adapters structurally unable to
drift, its deployment paved on `AppTheorySsrSite`, and its examples/docs verified in CI — then one
deliberate v4.0.0 that completes the full Svelte 5 runes migration and curates the public API surface.
At the end, every claim the framework makes (peer adapters, deterministic emission, one way to deploy)
is either enforced by CI or backed by a runnable example.

## Render modes and adapters affected

All four mode surfaces × all three adapters. Heaviest cells: ISR × core (resilience, metadata, purge),
SSR × Vue (streaming parity), everything × Svelte (full runes migration). SPA is touched only by example
coverage and naming reconciliation.

## Determinism impact

Preserves determinism throughout; **strengthens** its observability (error hook, stream-error metric,
hydration beacon, consumer testing surface). Two determinism-critical passages, both gated: the shared
render pipeline refactor (M5 — byte-identical output required, existing golden tests + React streaming
example as the gate) and the Svelte 5 recompilation (M18 — gated by the M17 fixture suite captured
against the legacy components before any migration begins).

## Phases

### Phase 1 — Correctness and failure visibility (fix train)

**Milestone candidates:**

- **M1 `test-integrity`** — Every test file on disk runs in CI, structurally.
  - Items: 1
  - Dependencies: none (first milestone; may spawn a prerequisite `fix(apptheory)` commit if the
    never-run adapter suite fails)
  - Determinism-sensitive: no
  - Risks: unknown state of the orphaned suite — budget for adapter fixes before anything else merges

- **M2 `failure-visibility`** — A FaceTheory failure is never silent, never serves the wrong metadata,
  and never 500s when stale content can serve.
  - Items: 9 (pulled forward — item 3's acceptance depends on the error hook), 2, 3, 4
  - Dependencies: M1 (trustworthy test signal)
  - Determinism-sensitive: no
  - Risks: item 2's S3-metadata round-trip adds a read dependency on object metadata — verify no extra
    S3 GET is introduced on the hot path (metadata rides the existing object read)

- **M3 `contract-guards`** — Misconfiguration fails loudly at construction and routing/key behavior is
  explicit, without changing any default.
  - Items: 5, 6, 7, 8
  - Dependencies: none (parallel with M2; items 7–8 serialize behind 2–3 in-repo since all touch `isr.ts`)
  - Determinism-sensitive: no
  - Risks: throw-on-invalid-mode surfaces latent consumer misconfigurations — that is the point, but
    release notes must say so

### Phase 2 — Core primitives (minor train)

- **M4 `typed-faces`** — The primary consumer primitive is type-safe end to end.
  - Items: 10, 11
  - Dependencies: none
  - Determinism-sensitive: no
  - Risks: generic-default inference edge cases under `exactOptionalPropertyTypes`; mitigated by
    compile-time fixtures over every existing Face in repo and examples

- **M5 `shared-render-pipeline`** — One core pipeline renders for all three adapters, byte-identically
  to today. Ships as a single PR: core primitive + React + Vue + Svelte adoption (the atomic
  "framework grew" unit).
  - Items: 12, 13, 14, 15, 16
  - Dependencies: M1 (test integrity), M2 (error hook exists so the pipeline can route errors)
  - Determinism-sensitive: **yes** — the central determinism-critical refactor of the additive train
  - Risks: Vue's contribute-loop ordering divergence becomes observable when unified — if output
    differs, the commit body must name it and Vue downstream validation must cover it; mitigation is the
    byte-identical requirement enforced by existing golden tests plus all Vite example smoke runs

- **M6 `head-and-security-helpers`** — Head authoring and CSP composition become helper-first without
  changing any default emission.
  - Items: 20, 21
  - Dependencies: M5 (item 12's consolidated escaping lands inside M5's PR; head helpers build on it)
  - Determinism-sensitive: **yes** (head emission)
  - Risks: JSON-LD-under-strict-CSP needs the security decision (nonce-carried default) reviewed during
    implementation — flagged as an open question, not a blocker

### Phase 3 — Parity and consumer capability (minor train)

- **M7 `vue-parity`** — Vue streams like React and its style story is documented, not silent.
  - Items: 17, 18
  - Dependencies: M5 (streaming builds on the shared pipeline)
  - Determinism-sensitive: **yes** (new streaming emission path)
  - Risks: `@vue/server-renderer` streaming has no direct analogue of React's
    `onShellReady`/`onAllReady` — style/readiness timing may not map one-to-one (known unknown);
    mitigation: mirror the react-stream test matrix and accept a documented reduced readiness surface
    rather than inventing non-parity API

- **M8 `stitch-hosted-auth-core`** — Hosted-auth has one shared contract like every other Stitch family.
  - Items: 19
  - Dependencies: none
  - Determinism-sensitive: no
  - Risks: Autheory consumes these bindings — notify via the user before the release that carries it

- **M9 `consumer-testing-and-telemetry`** — Consumers can test their Faces and operators can see ISR,
  stream, and hydration health.
  - Items: 22, 23, 24, 25
  - Dependencies: M2 (ops surface), M5 (stable pipeline for `renderFace`)
  - Determinism-sensitive: **yes** (item 24 touches the streaming document path; golden tests gate)
  - Risks: `./testing` subpath becomes public API surface — review its export list against the v4
    curation (M19) so nothing ships in 3.x that v4 immediately renames

- **M10 `ssg-throughput`** — Large SSG builds are parallel, fault-isolated, and optionally incremental.
  - Items: 26, 27
  - Dependencies: none
  - Determinism-sensitive: no
  - Risks: concurrency exposes any hidden shared-state in consumer `load()` implementations — default
    stays serial (`concurrency: 1`), so opt-in only

- **M11 `dev-loop`** — A code edit reflects without a manual rebuild.
  - Items: 28
  - Dependencies: none (parallel)
  - Determinism-sensitive: no (dev-only branch; production manifest path asserted untouched)
  - Risks: scope creep toward full SSR-module HMR — scoped-need open question 3 caps this milestone at
    middleware-mode + client HMR; deeper reload is a future scope

### Phase 4 — Deployment convergence and onboarding (minor train)

- **M12 `deploy-convergence`** — The reference stacks and deploy docs demonstrate exactly one paved
  path: FaceTheory app on `AppTheorySsrSite`.
  - Items: 31, 32, 33
  - Dependencies: none (infra-only; parallel with Phase 3)
  - Determinism-sensitive: no
  - Risks: behavior parity between the hand-rolled distribution and the construct's `SSG_ISR` mode
    (rewrite semantics, request-id echo) — snapshot-diff review against the current template; any gap
    found becomes an AppTheory coordination item, not a local workaround

- **M13 `onboarding-cli`** — Zero-to-deployed is a scaffold command, and install problems self-diagnose.
  - Items: 29, 30
  - Dependencies: M12 (the scaffold's CDK template must emit the paved path, not the old one)
  - Determinism-sensitive: no
  - Risks: template drift as versions move — mitigated by the scaffold smoke test that typechecks a
    generated project in CI

- **M14 `examples-integrity`** — Examples exercise the published package surface and cannot rot silently.
  - Items: 34, 35, 40
  - Dependencies: M1; soft on M5 (avoid rebasing the import rewrite across the pipeline refactor —
    land after M5)
  - Determinism-sensitive: no
  - Risks: the import rewrite is the first real consumer of the full `exports` map — expect it to
    surface map gaps (that is its job); fixes ride the same PR

- **M15 `examples-coverage`** — Every documented capability claim has a runnable example behind it.
  - Items: 36, 37, 38, 39
  - Dependencies: M14 (new examples follow the package-import convention from birth)
  - Determinism-sensitive: no
  - Risks: none beyond maintenance surface; each example carries a CI smoke test by construction

### Phase 5 — Docs, positioning, CI gates (minor train)

- **M16 `docs-and-gates`** — The docs tell the truth about the version, the modes, and the exports —
  and CI keeps it that way.
  - Items: 41, 42, 43, 44, 45, 54 (public-API JSDoc — enumeration addendum), 55 (Node 20 floor —
    externally gated: lands with the pin bumps to the AppTheory/TableTheory releases that ship their
    floors; if those releases post-date wave 4, item 55 rides whatever train the pin bump rides)
  - Dependencies: M14/M15 (export map and example claims settle first); item 45 goes through the
    normal release train with release-steward care (config only, never manifests)
  - Determinism-sensitive: no
  - Risks: item 45 touches release-notes automation — validated by the existing changelog-preservation
    self-test and a premain RC dry-run before it can affect a stable release

### Phase 6 — v4.0.0 breaking train

- **M17 `svelte5-fixtures`** — The determinism baseline for the migration exists before anything migrates.
  - Items: 46
  - Dependencies: M5 (fixtures capture output of the *final* 3.x pipeline, not a moving target).
    **Ships in the last 3.x minor.**
  - Determinism-sensitive: **yes** — this milestone *is* the gate
  - Risks: fixture breadth — representative props cannot cover every prop combination; mitigate with
    head/style-contribution assertions per component and the hydration harness, with downstream
    validation against the release as the residual net

- **M18 `v4-svelte5`** — The Svelte surface is fully Svelte 5: runes, snippets, uniform event syntax,
  `>=5.55.7` peers, structurally gated against regression.
  - Items: 47, 48, 49, 50
  - Dependencies: M17 (hard); last 3.x stable back-merged to staging
  - Determinism-sensitive: **yes** — every item; fixture suite green is the merge gate per chunk
  - Risks: **named `<slot>` → snippet-prop migration changes the component authoring API for consumers**
    (Autheory templates that pass named slots must update) — this is a consumer-visible break beyond the
    peer bump and must be explicit in the migration guide and the Autheory notification; the Svelte
    exclusion band decision (drop vs keep) needs the upstream bug re-tested during item 47

- **M19 `v4-surface-curation`** — The public API is a curated, documented, deliberately-shaped surface.
  - Items: 51, 52, 53
  - Dependencies: every additive item landed (the curated list must include the new exports: testing
    subpath, head helpers, pipeline primitive); 11→52, 5→53, 41→51 (the export-map CI gate verifies the
    curated surface)
  - Determinism-sensitive: **yes** (item 52 changes head emission: `head.html` removal + keyless dedup)
  - Risks: any consumer import of a removed internal breaks at install — the `BREAKING CHANGE:` body
    lists every removed name with its replacement, and the RC exists for downstream validation to catch
    stragglers

## Release rollout plan

Five release waves on the standard train (`staging` → `premain` RC → `main` stable → back-merge).
**All promotion gates are events, not durations** — a wave promotes the moment its gates are green:

| Wave | Milestones | Release | Promotion gate (events) |
|---|---|---|---|
| 1 | M1–M3 | v3.9.0 | CI green including the new regression tests |
| 2 | M4–M6 | v3.10.0 | CI green + React streaming example hydration smoke |
| 3 | M7–M11 | v3.11.0 | CI green + Vue streaming example smoke |
| 4 | M12–M16 + M17 | v3.12.0 (last planned 3.x minor) | CI green + deploy walkthrough executed once end-to-end + fixture suite green |
| 5 | M18–M19 | **v4.0.0** | CI green + Svelte fixture suite green + standard release verification |

Waves are merge-order groupings, not calendar units; they collapse into consecutive release trains as
fast as the gates pass. The v4 wave starts only after v3.12.0 back-merges, so the breaking train is the
sole content of the 4.0.0 diff. **v4 promotion is gated on FaceTheory's internal verification only**:
pinned tarballs mean publishing v4.0.0 forces no consumer to move. Pay Theory, Autheory, and
keybank-app-example are notified at RC cut (mandatory coordination), validate against the RC or the
stable on their own initiative, and re-pin when green — the migration guide's version-shaped section
(item 42) plus the scaffold (M13) give them the paved upgrade. Rollback story per wave: RCs that fail
validation are abandoned in place (immutable — never retagged), fixed on `staging`, and re-cut as
`-rc.N+1`; a bad *stable* is answered by a forward fix release, never a retag.

## Version-bump implication

Waves 1–4 are minors/patches under post-1.0 semver (`feat:`/`fix:` — release-please computes). Wave 5 is
a true **major**: `feat(svelte)!:` (peer drop), `feat(core)!:` (surface curation), `feat(head)!:`,
`feat(app)!:`. The repo is at 3.x, so post-1.0 rules apply in fact regardless of the legacy "pre-1.0"
wording — which item 42 retires in wave 4, conveniently before the major that exercises it.

## Cross-phase risks

- **Interleaved work:** dependency pins and security fixes will land between waves. Mitigation: every
  milestone is independently green (`npm run check` per commit), so unrelated releases can cut between
  waves without stranding anything.
- **Fixture staleness (M17→M18 gap):** if other Svelte-touching work lands between the fixture capture
  and the migration, fixtures must be re-validated at M18 start. Mitigation: schedule no Svelte-touching
  work between M17 and M18; the fixture suite runs in CI continuously from M17 on.
- **`./testing` API shipped in 3.x, curated in 4.x:** M9's export list is reviewed against M19's curation
  plan when M9 lands, so v4 does not immediately rename what 3.11 introduced.
- **Assessment findings are point-in-time:** file:line citations in the enumeration drift as commits
  land; each milestone re-verifies its target sites at implementation start (the `implement-milestone`
  skill's grounding beat).

## Cross-repo coordination

Required — surfaced here, executed via the user; none of it blocks waves 1–4:

1. **TableTheory** — `FaceTheoryIsrMeta` gains `status`/`contentType` fields and a purge/invalidate
   operation. FaceTheory ships interims regardless (S3-metadata round-trip, item 2;
   `IsrInvalidateUnsupportedError`, item 25); when TableTheory ships, follow-up FaceTheory commits move
   the source of truth and light up the TableTheory-backed purge (tracked as post-roadmap items).
2. **AppTheory** — `AppTheorySsrSite` `BucketDeployment` lacks `distributionPaths` (no CloudFront
   invalidation on deploy); plus any behavior-parity gaps M12's snapshot diff surfaces.
3. **Autheory** — two notifications: M8/wave-3 (hosted-auth shared core) and, critically, the v4 RC
   (Svelte named-slot → snippet authoring change + peer bump + surface curation). Notification at RC cut
   is mandatory; Autheory validates and re-pins on its own initiative — pinned tarballs mean v4 stable
   forces no consumer to move.
4. **Pay Theory checkout** — notified at each wave's RC cut; validates and re-pins on its own initiative.

### Sibling program overlap verification (2026-07-02)

The parallel improvement programs were checked for overlap: AppTheory's 106-item strengthening program
(`../AppTheory/ENUMERATED-CHANGES-improvement-program.md`) and TableTheory's 113+-item program
(`../TableTheory/docs/development/planning/tabletheory-improvement-program-enumerated-changes-2026-07.md`).

**No duplicated work.** Neither program contains FaceTheory's cross-repo asks:

- AppTheory's program has zero `AppTheorySsrSite`/CloudFront/invalidation items (its "Deployment
  surface" section covers cdk-go modularization, HTTP-construct domains, WAF, log retention, canaries) —
  the `distributionPaths` invalidation ask stands and should be **added to their program**, not assumed.
- TableTheory's program has zero `FaceTheoryIsrMeta` items — no `status`/`contentType` fields, no
  purge/invalidate operation — both asks stand and should be **added to their program**.

**Collisions and alignment seams found (5):**

1. **TableTheory items 106/122** add TS subpath exports (`/facetheory`, `/lease`) with root re-exports
   deprecated then **removed at their item 122**. FaceTheory's `ts/src/tabletheory/index.ts` imports from
   the root today — when TableTheory's major lands, FaceTheory needs a pin-bump commit switching to
   `@theory-cloud/tabletheory-ts/facetheory` (future pin work, not in this enumeration).
2. **AppTheory item 93 (project scaffold generator)** overlaps in spirit with FaceTheory M13
   (`facetheory create`). Different products, but the FaceTheory scaffold emits an AppTheory CDK app —
   coordinate so the two generators compose (FaceTheory's may delegate its infra scaffolding to
   AppTheory's when it ships) rather than diverge.
3. **AppTheory items 44–45 (first-party EMF metrics sinks)** pair with FaceTheory M2/M9 observability:
   FaceTheory's hooks stay sink-agnostic, and the reference handler/docs should demonstrate wiring hooks
   into AppTheory's EMF sink once it exists (replacing the current `console.log` JSON).
4. **AppTheory items 18/20 (canonical error envelope for framework-emitted errors, TS)** touch the
   FaceTheory-on-AppTheory adapter path: FaceTheory 500s are HTML documents and must not be re-wrapped
   into JSON envelopes by the adapter. The revived `apptheory-adapter` suite (item 1) is where this
   contract gets asserted; add the case when AppTheory's envelope work lands.
5. **TableTheory items 46–49 (version-conflict error distinction)** may reshape conditional-write error
   classification under the ISR lease path; FaceTheory item 3's generic meta-store failure wrapping
   absorbs this by design, but the ISR resilience tests should include a classified-conflict case once
   TableTheory ships it.

**Node floor alignment (updated 2026-07-02):** AppTheory's plan now carries a Node 20 floor
(item 94, CI-matrix-proven) alongside TableTheory's items 16–17. Per the alignment rule, FaceTheory
follows: enumeration addendum item 55 lowers `engines.node` to `>=20` with a Node 20 + 24 CI matrix,
gated on the upstream releases that ship their floors (FaceTheory cannot advertise a floor below what
its pinned dependencies enforce; a source scan shows no Node >20 API usage in FaceTheory itself).
ESM-only remains the one recorded divergence from TableTheory's compatibility work, with its reason
stated at item 55.

## Open questions

1. **JSON-LD strict-CSP mechanism** — nonce-carried inline works for SSR but cannot serve cached modes
   (a per-request nonce cannot be baked into SSG/ISR HTML); hash-based allowlisting works for cached
   pages. Recommended: both, selected by mode (nonce for SSR, hash for SSG/ISR); needs the user's
   confirmation or delegation to the M6 security review.
2. **Scaffold delivery form** — enumerated as an in-repo `facetheory create` CLI (versioned with the
   release, smoke-tested in CI); the scoped need allowed a separate template repository instead.
   Confirm the in-repo form.
3. **Execution vehicle** — `create-linear-project` for tracked milestones, or informal execution via
   `implement-milestone` directly from this roadmap.

Resolved without user input: the Svelte 5.46.0–5.55.6 exclusion band is re-tested empirically during
item 47 (drop vs keep is an implementation outcome); the coverage threshold is set after item 43
produces baseline data (report-only until then). Promotion gating was resolved by user directive:
event-based internal gates only, no soak, downstream validation post-notification on consumer initiative.

## Handoff

If approved: `create-linear-project` translates this into a Linear project (19 milestones, wave
groupings as cycles/labels). Cross-repo asks 1–2 should be surfaced to the TableTheory and AppTheory
stewards via the user in parallel with wave 1 — neither blocks it.
