# Scoped Need: Product Strengthening (Assessment Remediation + Full Svelte 5 Migration)

**Date:** 2026-07-02
**Source:** `docs/planning/PRODUCT_IMPROVEMENT_ASSESSMENT.md` (assessed v3.8.0)
**Decision input:** User directive — cover **all** assessment findings, and migrate the Svelte surface
**fully to Svelte 5** (runes, unified event syntax) rather than the assessment's softer
"migrate deliberately or pin `<6`" option.

## Background

The 2026-07-02 product improvement assessment closed out the historical roadmaps (R0–R7, H0–H4 are
complete) and found the remaining gaps are not missing milestones but accumulated debt across six themes:
verified correctness bugs, consumer ergonomics, adapter parity, operational blind spots, API surface
hygiene, and positioning drift. This need converts the entire assessment into an executable scope. It is
the first scoped need driven by a whole-product audit rather than a single capability request.

## Driver

Framework stewardship on behalf of all current consumers — Pay Theory checkout (production), Autheory
hosted-auth and control-plane surfaces, the keybank-app-example integration, and local development of
future Theory Cloud UIs. No single consumer is blocked today; the driver is product strength: several
findings (ISR hit-path status loss, swallowed render errors, unguarded AppTheory adapter contract) are
latent production incidents for every consumer at once.

## Problem

Grouped as the assessment found them (section references are to the assessment):

1. **Correctness (§2):** TableTheory ISR adapter reverts cached `status`/`contentType` to `200 text/html`
   on every cache hit (verified); `apptheory-adapter.test.ts` runs in no runner (verified); ISR
   metadata-store failures 500 instead of serving available stale HTML; streaming ignores writable
   backpressure; a `mode` typo silently disables caching; trailing slashes 404 with no policy; default
   ISR cache key folds all cookies (fragmentation footgun); custom tenant headers bypass the fail-closed
   guard.
2. **Consumer ergonomics (§3):** `FaceModule` is not generic (`load → render` untyped); render errors are
   swallowed with no error hook; no scaffold/template and a fragmented deploy story despite
   `AppTheorySsrSite` already covering it; no dev server/HMR; no consumer testing surface; no head
   authoring helpers (and no JSON-LD path under strict CSP); `buildStrictCspHeader` is non-extensible.
3. **Adapter parity (§4):** streaming SSR, Suspense handling, and deferred style timing are React-only;
   Vue has no style-extraction story; **all 66 Svelte components use legacy Svelte 4 syntax with mixed
   event idioms** — per user decision, this migrates fully to Svelte 5 runes; the render scaffold is
   triplicated across adapters; `stitch-hosted-auth` has no shared core.
4. **Operations (§5):** the SSG/ISR reference stack hand-rolls ~350 lines that `AppTheorySsrSite`'s
   `SSG_ISR` mode already provides; no on-demand ISR invalidation; no ISR hit-rate/regeneration metrics;
   mid-stream failures and client hydration failures are invisible; SSG builds are sequential and
   all-or-nothing.
5. **API hygiene (§6):** wildcard barrel leaks ~251 names including internals; `Headers` shadows the
   global; a source-code linter ships as runtime API; security-sensitive escaping helpers are duplicated
   3×; four overlapping head-input channels.
6. **Positioning/docs (§7):** README says "pre-1.0" at v3.8.0; "four render modes" contradicts the
   three-value `FaceMode` type; api-reference misses 8 published subpaths; examples import `../../src`
   and only 7/21 run in CI; changelog duplicates every release as an identical `-rc` entry; no coverage
   or format gate in CI.

## Render modes affected

All (SSR, SSG, ISR, SPA-runtime) plus mode-agnostic core. No mode's guarantee changes: SSR stays
per-request, SSG stays build-time, ISR stays blocking stale-while-revalidate in TableTheory, SPA stays a
server-rendered shell with client navigation. §7.2 reconciles *naming* only ("three server render modes +
a SPA client runtime" vs a literal `mode: 'spa'`), and is resolved as a documentation/wording change —
not a mode addition or removal.

## Adapters affected

All three. React: minor (shared-scaffold extraction, strict-CSP example). Vue: significant additive
(streaming SSR, style-extraction position). Svelte: **major — full migration of all 66 components to
Svelte 5 runes (`$props`/`$state`/`$derived`, snippets/`{@render}` where slots are used, `onclick=`
event attributes throughout).**

**Consequence, stated explicitly:** runes do not compile under Svelte 4, so the peer range moves from
`>=4 <5.46.0 || >=5.55.7` to `>=5.55.7` — **dropping Svelte 4 support is a breaking change** and must
ship in a major release with `feat(svelte)!:` and a migration-guide entry. The exclusion band
(5.46.0–5.55.6) and the `svelte/server` fallback workaround in `ts/src/svelte/index.ts:97-112` are
re-evaluated as part of the migration: if the workaround exists solely for the legacy path, it is removed;
if it guards a live Svelte 5 SSR bug, it stays with a documented rationale.

## Shape impact

**Fits inside + additive core.** No fifth render mode, no fourth adapter. The largest structural items are
additive core capabilities: the shared adapter render scaffold, the generic `FaceModule<TData>`, the
`onError` observability hook, the `./testing` subpath, head authoring helpers, ISR key/guard options, and
an `invalidate` extension to the ISR meta-store interface. Barrel curation *removes* leaked surface, which
is breaking but shape-preserving.

## Determinism impact

**Preserves — with one explicitly managed risk.** Most items strengthen determinism observability (error
hook, hydration-failure beacon, testing surface with server/client comparison). The managed risk is the
Svelte 5 migration: recompiling 66 components under runes may alter SSR HTML output (whitespace, attribute
ordering, hydration markers). Success criteria therefore require **before/after SSR output equivalence
fixtures** for every migrated component, and hydration verification via the existing strict-CSP/portal
harnesses, before the migration commit lands. Any intentional output difference must be captured in the
fixtures and called out in the migration guide, not discovered by consumers.

## AWS-first posture

**Preserves and strengthens.** Deployment converges on AppTheory's `AppTheorySsrSite` (`SSG_ISR` mode),
deleting hand-rolled CloudFront wiring from the reference stack. ISR stays in TableTheory; schema needs
(`status`/`contentType` persistence, purge) route through TableTheory coordination, with an S3
object-metadata round-trip as the FaceTheory-local interim exactly as CSP already does. No non-AWS
deployment path is created anywhere in this scope.

## Success criteria

Observable, testable:

1. An ISR Face returning 404 or non-HTML content type serves the same status/content-type on cache HIT as
   on MISS through the TableTheory-backed store — proven by a new hit-path unit test.
2. Every `*.test.ts` under `ts/test/unit/` executes in CI, enforced structurally (glob discovery), not by
   a hand-maintained list; the `apptheory-adapter` suite passes.
3. With a stale entry present, an injected metadata-store failure serves stale (with an
   `x-facetheory-isr` state reflecting degraded mode) instead of a 500 — unit-tested.
4. `createFaceApp` throws at construction for an invalid `mode`, an `isr` Face without
   `revalidateSeconds`, and an `ssg` param route without `generateStaticParams`.
5. A thrown `load`/`render` reaches a consumer-registered `onError` hook with the original error, and the
   request metric carries an error-class tag — unit-tested for buffered, streaming, resource, and
   control-plane paths.
6. `FaceModule<TData>` compiles the typed happy path with zero casts in a consumer-shaped example and
   remains assignable from every existing untyped Face in the repo (no consumer break).
7. Zero `.svelte` files contain `export let`, `$:` reactive statements, `<slot>`, `$$slots`,
   `$$restProps`, or `on:` event directives (repo-greppable); SSR output equivalence fixtures pass for
   all migrated components; peer range is `>=5.55.7` only.
8. A Vue streaming Face streams through the same `FaceRenderResult` AsyncIterable contract as React, with
   head-before-body and strict-CSP tests equivalent to `react-stream.test.ts`.
9. `infra/apptheory-ssg-isr-site` synthesizes via `AppTheorySsrSite` `SSG_ISR` mode with **no inline
   CloudFront function code** in the FaceTheory repo; the SSR reference stack renders through a real
   `createFaceApp` app; snapshots updated.
10. All 21 examples import `@theory-cloud/facetheory` (no `../../src/` imports), are typechecked in CI,
    and every documented capability claim (React/Vue strict CSP, framework ISR, framework SSG, SPA
    navigation) has a runnable example behind it.
11. The api-reference export map lists every `ts/package.json` subpath, generated or verified in CI.
12. `npm run dev` (or `facetheory dev`) serves a Vite-middleware dev loop with HMR for at least the React
    example; a code edit reflects without a manual rebuild.
13. A consumer can `import { buildFaceRequest, renderFace, assertHydrationEquivalent } from
    '@theory-cloud/facetheory/testing'` and unit-test a Face without touching Lambda event shapes.
14. `index.ts` is a curated explicit export list; `Headers` is renamed `FaceHeaders` (alias retained until
    the major, removed in it); the guardrails linter is out of the runtime surface; the safe-JSON escape
    chain exists exactly once.
15. README/status, "render modes" wording, changelog RC dedup, deprecation policy, and version-shaped
    upgrade notes are published; CI gains `prettier --check` and c8 coverage reporting.

## Nearest existing surface

- S3 object-metadata round-trip for CSP (`ts/src/isr.ts:848-851,891-898`) — the exact pattern for the
  status/contentType interim fix.
- `UIIntegration<TTree, TState>` and `ControlPlaneDataSection<Data>` — the in-repo generic idiom for
  `FaceModule<TData>`.
- `FaceObservabilityHooks` (`ts/src/ops.ts`) — the hook surface `onError` extends.
- `AppTheorySsrSite` `SSG_ISR` mode (apptheory-cdk v1.13.2, already pinned) — the deployment target.
- `ts/test/helpers/strict-csp.ts` and `portal-reference-hydrate.js` — the internal harnesses the
  `./testing` subpath productizes.
- The two responsive-primitives Svelte components already on `onclick=` syntax — the migration's
  reference idiom.

## Out of scope

- npm publishing, non-AWS deployment targets, a fifth render mode, a fourth adapter, ISR state outside
  TableTheory, CDK constructs shipped from FaceTheory (all reaffirmed non-goals).
- Implementing the TableTheory schema change or the AppTheory `distributionPaths` invalidation fix —
  those are **coordination asks surfaced to their stewards**; FaceTheory enumerates only its own side
  (interim S3-metadata fix, adapter consumption, pin bumps when upstream lands).
- Svelte streaming SSR (no upstream primitive exists; documented as a stated position, not built).
- A full client-router/prefetch rewrite of SPA mode (assessment noted it; not requested; MPA-over-fetch
  posture stands).
- Autheory/Pay Theory application-side updates (notified via the user at the breaking release).

## Open questions

1. **Release packaging:** default plan is additive/fix work first (patch/minor train), then one deliberate
   **v4.0.0** bundling every breaking item (Svelte 5-only peers, barrel curation, `FaceHeaders` rename
   finalization, `head.html` removal, guardrails relocation). Confirm before the major lands.
2. **TableTheory timing:** does the `FaceTheoryIsrMeta` schema grow `status`/`contentType` (and a purge
   op) this cycle? Interim S3-metadata fix ships regardless; adapter consumption of the schema follows
   the TableTheory release.
3. **Dev-server depth:** minimum viable is Vite middleware-mode + FaceApp mounting with HMR for client
   assets; full SSR-module HMR (server-side hot reload of Face modules) may be a follow-on scope.
4. **JSON-LD under strict CSP:** nonce-carried inline script vs hash-based allowlisting — needs a
   security-review decision during implementation of the head helpers.
