# FaceTheory Product Improvement Assessment

**Date:** 2026-07-02
**Version assessed:** v3.8.0 (branch `factory/facetheory-release-gate-fixes-2026-06-19`, clean tree)
**Status:** Planning document — analysis only, no code changes proposed here are implemented.

This assessment describes how FaceTheory could become a stronger and more usable product. It was produced
by a full read of the runtime (`ts/src/`, ~35,000 lines), the adapter surfaces, the delivery pipelines, the
reference infra stacks, the docs tree, the examples, the test suite, and the CI workflows — plus a
comparison against the current AppTheory CDK surface (`../AppTheory/cdk/lib/ssr-site.ts`), since deployment
is AppTheory-based.

Every recommendation stays inside the FaceTheory contract: four render modes, three peer adapters,
AWS-first deployment, ISR state in TableTheory, GitHub-Releases-only distribution. Section 10 lists the
things this document deliberately does **not** propose.

---

## Executive summary

FaceTheory's core is in good shape: the determinism primitives work, the ISR single-flight lease design is
sound, boundary discipline between core and adapters is clean (zero framework imports in core, zero
cross-adapter imports), TypeScript strictness is exemplary, and the release pipeline is unusually
disciplined. The early roadmaps (`ROADMAP.md` M0–M8, `FOLLOWUP_ROADMAP.md` R0–R7,
`HARDENING_HYGIENE_INFRA_ROADMAP.md` H0–H4) are essentially complete.

The gaps now are of a different kind. They cluster into five themes:

1. **A small set of verified correctness/resilience bugs** — most notably the TableTheory ISR meta-store
   adapter silently reverting cached `status`/`contentType` to `200 text/html` on every cache hit, and a
   test file that exists on disk but is wired into no runner.
2. **Consumer ergonomics** — the `load → render` data flow is untyped, render errors are swallowed with no
   diagnostics, and there is no scaffold, no dev server, and no consumer testing surface.
3. **Adapter parity debt** — streaming SSR, Suspense handling, and style extraction are effectively
   React-only; all 66 Svelte components use legacy Svelte 4 syntax.
4. **Operational blind spots** — no ISR purge, no hydration-failure signal, no first-class ISR hit-rate
   metric, sequential SSG builds.
5. **Positioning and doc drift** — the README calls the framework "pre-1.0" at v3.8.0, the "four render
   modes" claim doesn't match the `FaceMode` type, and the API reference is missing eight published
   subpath exports.

The deployment story is better than it first appears — but only because AppTheory's `AppTheorySsrSite`
construct already covers most of it, and FaceTheory's own reference stack and docs don't use or surface
that fact (§5.1).

---

## 1. What is already strong (baseline, kept brief)

- **Boundary discipline.** No framework imports anywhere in core; no adapter imports another adapter;
  `index.ts` exports no adapter code. Verified by tree-wide grep.
- **ISR core design.** Single-flight regeneration lease with owner+token (`ts/src/isr.ts:88-129`),
  `stale-if-error` cache-control, fail-closed tenant-boundary guard, HTML in S3 with only pointers in
  DynamoDB (no 400KB exposure), regeneration failure serving stale by default. The unit tests for stale
  bursts, lease expiry, and metadata/HTML separation are genuinely good.
- **TypeScript posture.** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; zero `any`,
  zero `@ts-ignore` in core. Source maps and declaration maps ship.
- **Release discipline.** Release Please, immutable tarballs, version-alignment gates, deterministic-build
  verification, docs version pins with zero drift (AppTheory v1.13.2 ×11, TableTheory v1.10.1 ×8).
- **Migration guide.** Seven concrete migrations with validation commands and rollback notes — above
  average for a framework at this stage.

---

## 2. Correctness and resilience (fix first)

These are bugs or near-bugs, not preferences. The first two were verified first-hand during this
assessment, not just reported by analysis.

### 2.1 TableTheory ISR adapter loses `status`/`contentType` on cache hits — **verified**

`recordFromTableTheoryMeta` hard-codes `status: 200` and `contentType: 'text/html; charset=utf-8'`
(`ts/src/tabletheory/index.ts:26-39`), `get()` overwrites with configured defaults (`:77-81`), and
`commitGeneration` forwards only `htmlPointer/generatedAtMs/revalidateSeconds/etag` — dropping the
`status` and `contentType` that `CommitIsrGenerationInput` carries (`:134-142`).

Consequence: the first (miss) response is correct because it is built from the freshly rendered result,
but **every subsequent cache hit served through the TableTheory-backed store reverts to `200 text/html`**.
An ISR Face that legitimately returns a 404, a redirect status, or a non-HTML content type is silently
rewritten on hits. CSP survives only because it is independently round-tripped through S3 object metadata
(`ts/src/isr.ts:848-851,891-898`); status and content type have no such fallback. No test covers this.

Fix path: persist `status`/`contentType` in the ISR meta record. If `FaceTheoryIsrMeta` in
`@theory-cloud/tabletheory-ts` has no fields for them, this is a **TableTheory coordination event**
(schema addition) — or, interim, round-trip them through S3 object metadata exactly as CSP already does.
Either way, add the missing hit-path test first.

### 2.2 `apptheory-adapter.test.ts` runs nowhere — **verified**

`ts/test/run-unit.ts` hand-maintains 52 `await import(...)` statements; the unit directory contains 53
test files. The orphan is `ts/test/unit/apptheory-adapter.test.ts` — the AppTheory adapter contract tests
that `HARDENING_HYGIENE_INFRA_ROADMAP.md` H1 cites as an acceptance artifact. It appears in no runner, no
npm script, no Makefile target, no CI job. The adapter contract (header/cookie/status equivalence,
streaming invariants) is currently unguarded.

Fix: import it in the runner today; replace the hand-maintained import list with glob discovery (or
`node --test`) this quarter so append-or-it-never-runs cannot recur.

### 2.3 ISR metadata-store failures become 500s even when stale HTML exists

No `metaStore` call in `handleFace` is wrapped (`ts/src/isr.ts:477-478,492-498,534-540`). A DynamoDB
throttle or transient error propagates to the generic 500 handler (`ts/src/app.ts:384-388`) even when a
perfectly serveable stale entry sits in S3. The `failurePolicy: 'serve-stale'` machinery only covers
*render* failures. Wrapping metadata reads/lease calls so a store failure degrades to stale-serve (when a
pointer is already known) would remove a whole class of incident.

### 2.4 Streaming ignores writable backpressure

`writeFaceResponseToLambdaWriter` does `for await (...) writer.write(chunk)` without awaiting drain or
checking `write()`'s return (`ts/src/lambda-url.ts:166-169,222-224`). A fast generator against a slow
client buffers unboundedly inside a memory-capped Lambda. Honor the drain signal.

### 2.5 A `mode` typo silently disables caching

`face.mode` is never validated at construction; only `=== 'isr'` is special-cased at request time
(`ts/src/app.ts:343`). `mode: 'ssgg'` compiles under a cast, throws nothing, and silently renders fresh on
every request — a cost/caching bug with no error. Validate the mode enum (and `isr ⇒ revalidateSeconds`,
`ssg ⇒ generateStaticParams` linkage) in the `FaceApp` constructor, which already fail-fasts on route
conflicts (`ts/src/app.ts:148-223`).

### 2.6 Trailing slashes 404 with no policy

`/foo/` does not match route `/foo` — `splitPath` produces a trailing empty segment that `matchPath`
rejects (`ts/src/router.ts:14,240,252`); no normalization, no redirect, no configuration. This will bite
real consumers via inbound links. Pick a policy (normalize, or 308-redirect) and make it explicit.

### 2.7 ISR cache-key cookie folding is a fragmentation footgun

The default request-variant digest folds **all cookies** into the cache key (`ts/src/isr.ts:596-643`).
Any site setting a per-visitor cookie (analytics, consent) degrades ISR to per-user SSR with S3+DynamoDB
write amplification. Add a cookie allowlist option (`varyCookies: [...]`) so the safe default stays but
operators can scope the variant to the cookies that actually affect HTML.

### 2.8 Custom tenant headers bypass the fail-closed guard

The tenant-boundary guard only checks the two hard-coded header names in
`DEFAULT_TENANT_BOUNDARY_HEADERS` (`ts/src/isr.ts:36-39,946-963`). A deployment using `x-org-id` gets no
protection and no warning. Make the guarded header list configurable and document that custom tenant
headers must be registered.

---

## 3. Consumer ergonomics (make it more usable)

### 3.1 Make `FaceModule` generic — the highest-leverage type-safety fix

`FaceModule` is not generic: `load` returns `Promise<unknown>` and `render` receives `data: unknown`
(`ts/src/types.ts:190-200`). Every consumer casts their own page data inside every `render` — in a
framework whose whole job is data → render. The codebase already uses the pattern elsewhere
(`UIIntegration<TTree, TState>`, `ControlPlaneDataSection<Data>`), so this is an application of an
existing idiom to the primary primitive:

```ts
interface FaceModule<TData = unknown> {
  load?: (ctx: FaceContext) => Promise<TData>;
  render: (ctx: FaceContext, data: TData) => Promise<FaceRenderResult> | FaceRenderResult;
}
```

Backward-compatible (defaulted parameter). Pairs naturally with a `defineFace<TData>()` helper for
inference.

### 3.2 Stop swallowing render errors — add an error hook

When `load`/`render` throws, `app.ts` returns a generic 500 and the exception is never logged, never
passed to any hook, never surfaced (`ts/src/app.ts:270-274,384-402,471-477`; same pattern in
`ts/src/control-plane.ts:546-556`). `FaceObservabilityHooks` has only `now`/`log`/`metric`
(`ts/src/ops.ts:26-42`) — there is no `error` hook. A consumer who misconfigures anything sees an opaque
"Internal Server Error" and **nothing in their logs**. This is the single worst operational property of
the current runtime. Add `onError(err, ctx)` to the hooks, route every swallowed `catch` through it, and
include an error-class tag on the request metric.

### 3.3 Pave the path from zero to deployed — mostly by *using AppTheory properly* (see §5.1)

There is no scaffold (`create-facetheory-app`, template repo, or `init` command — grep confirms none), and
the install is a four-part dance: env-var + tarball URL, hand-picked peer table, up to three more pinned
companion tarballs, and an npm `overrides` block (`ts/package.json:264-268`) documented only implicitly in
Migration 5. Recommended, in order of leverage:

1. A **template repository** (or `npm create` scaffold) per adapter that pins the current tarball set,
   peers, overrides, a working client entry, and a deployable AppTheory CDK app.
2. A **single end-to-end "deploy hello-world" walkthrough** built on `AppTheorySsrSite` (§5.1) — today
   `docs/cdk/README.md` is a 21-line stub and reaching a live URL requires assembling the topology from
   fragments.
3. An **install doctor** (`npx facetheory doctor`) that checks Node ≥20, peer versions (including the
   Svelte exclusion band), and override alignment — cheap to build, kills the most common support load.

### 3.4 A dev loop: currently full-rebuild-and-restart

There is no dev server, no HMR, no watch mode anywhere (`grep middlewareMode|createViteServer|hmr` over
`ts/src` is empty; `ts/src/vite.ts` reads production manifests only). The inner loop for any change is
`vite build` (client) → `vite build --ssr` → restart a hand-written node server
(`ts/examples/vite-ssr-react/node-server.ts:8-12,61-69`). A `facetheory dev` command wrapping
`vite.createServer({ middlewareMode })` with the FaceApp mounted behind it — dev-mode asset resolution
instead of manifest reads — is probably the single biggest day-to-day usability win available.

### 3.5 A consumer testing surface

`handleLambdaUrlEvent(app, event)` is the one genuine testing affordance. There is no `./testing` subpath,
no `FaceRequest` builder, no exported hydration-drift assertion — the real drift harnesses live in
`ts/test/helpers/` as internal-only code. Given that hydration mismatch is the problem the framework
exists to prevent, ship `@theory-cloud/facetheory/testing` with: a request/event builder, a
`renderFace(face, request)` harness, and a server-HTML-vs-client-DOM comparison utility. Add a "test your
Faces" section to the docs (the current `docs/testing-guide.md` is entirely repo-centric) and a
hydration-mismatch entry to `docs/troubleshooting.md` (currently absent — the signature failure mode is
the one thing the troubleshooting guide doesn't cover).

### 3.6 Head authoring helpers

The head primitive supports raw `FaceHeadTag` objects only — no `meta()`/`canonical()`/Open
Graph/Twitter-card/JSON-LD helpers, no title template (`ts/src/head.ts`). For a framework whose pitch is
deterministic head emission, the head DX is bare. Also: JSON-LD requires an inline
`<script type="application/ld+json">`, which strict CSP rejects (`ts/src/security.ts:126`,
`ts/src/head.ts:184`) — so the common SEO case is unsupported in the framework's own strict mode. Add
typed authoring helpers and a nonce-carrying (or hash-based) JSON-LD path under strict CSP.

### 3.7 Make `buildStrictCspHeader` extensible

The directive list is hardcoded (`ts/src/security.ts:30-41`). A consumer needing `connect-src` for their
API host, `img-src` for a CDN, or `report-to` must abandon the primitive entirely. Accept a
directive-extension option (while refusing `unsafe-inline`/`unsafe-eval` — the primitive should stay
opinionated about what it will never emit).

---

## 4. Adapter parity (the "peers" promise)

The core/adapter boundary is clean, but capability parity — the actual promise — has real debt.

| Capability | React | Vue | Svelte |
|---|---|---|---|
| Buffered SSR | ✅ | ✅ | ✅ |
| Streaming SSR | ✅ | ❌ | ❌ |
| Suspense / async boundaries | ✅ | ◑ | ❌ |
| Style extraction | ✅ (Emotion/AntD) | ❌ | ◑ (fallback `cssText`) |
| Structured head emission | ✅ | ✅ | ✅ |
| Strict-CSP enforcement | ✅ | ✅ | ✅ |
| Responsive primitives | ✅ | ✅ | ✅ |

### 4.1 Streaming is React-only

`renderReactStream` / `createReactStreamFace` have a full pipeline — shell/all-ready readiness, abort
timer, style strategies (`ts/src/adapters/react.ts:145-428`). Vue and Svelte have none, despite
`@vue/server-renderer` shipping `renderToNodeStream`/`pipeToWebWritable`. Priority: add Vue streaming
(the library support exists); for Svelte, document the buffered-only position explicitly rather than
leaving `FaceRenderResult.html: string | AsyncIterable<Uint8Array>` (`ts/src/types.ts:139`) promising a
capability two of three adapters cannot produce.

### 4.2 Vue has no style-extraction story at all

React ships Emotion + AntD integrations; Svelte at least captures `rendered.css` with a documented
fallback. Vue relies entirely on the consumer's `wrapApp` hook with no shipped integration
(`ts/src/vue/index.ts:23,68`). Either ship a Vue critical-CSS integration or document "build-time CSS
only" as the supported Vue position — the current silence reads as an oversight.

### 4.3 The Svelte surface is a forward-compat cliff

All 66 `.svelte` components use legacy Svelte 4 syntax — `export let` (64 files), `$:` (42), `<slot>`
(39), `$$slots`/`$$restProps` — zero runes, and event syntax is mixed (`on:click` in 16 stitch components
vs `onclick=` in the 2 responsive primitives). These run in Svelte 5 compatibility mode and will break on
the Svelte 6 trajectory. Also, the peer range `>=4 <5.46.0 || >=5.55.7` (`ts/package.json:175`) excludes a
band with no documented rationale; the adapter carries a runtime workaround for a Svelte 5 SSR break
(`ts/src/svelte/index.ts:97-112,162-167`). Migrate to runes deliberately (or pin `<6` explicitly), unify
the event syntax, and document the exclusion band.

### 4.4 Extract the triplicated render scaffold

Each adapter reimplements the same machinery: `modeUsesRuntimeHydrationSidecars` (verbatim ×3 —
`react.ts:336`, `vue/index.ts:113`, `svelte/index.ts:158`), the `FaceRenderResult` assembly block (×4),
the integration pipeline (`prepareUIIntegrations` → wrap → contribute → finalize → CSP enforce, ×3, with
Vue's contribute-loop already subtly divergent), and the `createXFace` factories. A shared core runner
parameterized by the framework-specific `renderTree(tree) → html` step removes ~60 triplicated lines and,
more importantly, removes the mechanism by which adapters drift apart. Same story at the component layer:
`stitch-hosted-auth` has **no shared core module** (unlike `stitch-shell`/`stitch-admin`/`stitch-tokens`),
so each adapter defines its own hosted-auth types — a parity-drift channel Autheory sits directly on top
of.

### 4.5 The client entry is 100% hand-written

FaceTheory provides hydration-data loading (`client/`) and manifest wiring (`vite.ts`), but no
`hydrateRoot`/`createSSRApp().mount`/`hydrate` call exists anywhere in `src`, and no template generates
the entry file. Combined with §3.3's scaffold, shipping a documented per-adapter entry template (even as
copyable example code that imports the real package) closes the loop from "render on server" to "hydrate
on client" without each consumer rediscovering it.

---

## 5. Operations and deployment

### 5.1 Deployment: converge on `AppTheorySsrSite` instead of hand-rolled stacks

Deployment is AppTheory-based, and AppTheory's construct is further along than FaceTheory's own repo
reflects. `AppTheorySsrSite` (`../AppTheory/cdk/lib/ssr-site.ts`) already supports: an
`AppTheorySsrSiteMode.SSG_ISR` mode that internally generates the viewer-request rewrite and
viewer-response CloudFront functions (`:214-336,896-914`), ISR metadata table and HTML-store bucket wiring
(`:372-444`), runtime env wiring (`wireRuntimeEnv`), static/direct-S3/SSR path patterns, custom domains +
hosted zone + ACM (`:519-534`), WAF (`webAclId`), logging, and tenant-header viewer controls
(`allowViewerTenantHeaders:482`).

Yet FaceTheory's SSG/ISR reference stack (`infra/apptheory-ssg-isr-site/src/stack.ts`) hand-rolls ~350
lines of distribution, origin group, and **inline untyped CloudFront function strings** (`:126-185`) —
duplicating what the construct generates — while pinning apptheory-cdk v1.13.2, which already has the
`SSG_ISR` mode. Meanwhile the SSR reference stack does use the construct but demonstrates it with an
inline HTML string handler rather than a FaceTheory app (`infra/apptheory-ssr-site/src/stack.ts:41-70`).

Recommended:

1. **Migrate `infra/apptheory-ssg-isr-site` to `AppTheorySsrSite` with `mode: SSG_ISR`** and delete the
   hand-rolled CloudFront functions. The reference stack should demonstrate the paved path, not an
   alternative to it.
2. **Put a real FaceTheory app behind the SSR reference stack** so the flagship deployment example
   actually exercises `createFaceApp` + the AppTheory adapter.
3. **Rewrite `docs/cdk/` around the construct**: FaceTheory app + `AppTheorySsrSite` = deployed, with
   domains/WAF/ISR as props — this replaces most of the "deploy cliff" (§3.3) without FaceTheory shipping
   any CDK of its own.
4. **Surface the remaining genuine gap upstream**: the construct's internal `BucketDeployment`
   (`ssr-site.ts:665`) passes no `distributionPaths`, so deploying new SSG HTML to stable keys does not
   invalidate CloudFront — the same footgun the FaceTheory stack has. That is an **AppTheory coordination
   item**, not something to work around locally.

This keeps FaceTheory out of the CDK-construct business (correct per the dependency direction) while
making the deployment story dramatically simpler than what the repo currently documents.

### 5.2 ISR needs an on-demand invalidation path

`IsrMetaStore` has only `get/tryAcquireLease/commitGeneration/releaseLease` (`ts/src/isr.ts:122-129`); the
TableTheory adapter exposes no purge either. The documented workaround — rotating a version dimension into
a custom `cacheKey` — orphans S3 objects (no GC) and never touches CloudFront copies. An operator cannot
say "regenerate `/pricing` now." Adding `invalidate(cacheKey)` (delete or force-stale the meta record) is
an ISR-interface change whose TableTheory-side model implications make it a **TableTheory coordination
event**. Pair it with a documented orphan-object lifecycle policy (S3 lifecycle rules on the HTML store
prefix).

### 5.3 Observability: close the three blind spots

Current surface: one request-completed log record and two metrics (`facetheory.request` counter,
`facetheory.render_ms` timing) (`ts/src/ops.ts:5-42`, `ts/src/app.ts:548-580`). Per-route render latency
is answerable; these are not:

- **ISR efficiency** — hit rate is derivable only by downstream math over `isr_state` tags; there is no
  regeneration-duration metric (distinct from `render_ms`), no lease-contention counter, no
  store-latency signal.
- **Mid-stream failures** — a render error after first byte produces a `console.error` and an inert
  `<template data-facetheory-stream-error>` marker (`ts/src/html.ts:94-104`) delivered inside an HTTP 200;
  it is not a metric or structured log event, so it will never appear on a dashboard.
- **Client hydration failures** — completely invisible. No beacon hook exists. Even an optional,
  consumer-wired `reportHydrationFailure(endpoint)` helper in `client/` would turn the framework's
  signature failure mode from "invisible" to "measurable."

All three fit the existing hooks model (`ops.ts`) without new infrastructure. Also worth adding while
in the file: an error-class tag (§3.2) and a cold-start marker.

### 5.4 SSG builds are sequential and all-or-nothing

`buildSsgSite` renders pages in a serial `for` loop (`ts/src/ssg.ts:119-176`); default `clean: true`
deletes the output dir every run (`:96-98`); a single 5xx aborts the whole build (`:121-129`); the CLI has
no `--concurrency`, `--incremental`, or `--filter` (`ts/src/ssg-cli.ts:54-120`). For the route-set sizes
the serving architecture is explicitly designed to scale to, the build layer should at minimum get bounded
concurrency and per-route error isolation with a failed-routes report; content-hash-based skip
(incremental) is the follow-on.

---

## 6. API surface hygiene

### 6.1 Curate the barrel

`ts/src/index.ts` is `export *` from 18 modules — roughly **251 exported names**, including plainly
internal plumbing: `normalizePath`, `trimOuterSlashes`, `canonicalizeHeaders`, `cloneQuery`,
`parseQueryString` (`ts/src/types.ts:202-288`), the `Router` class (`ts/src/router.ts:256`),
`normalizeHeadTags`/`renderHeadTag` (`ts/src/head.ts:318,345`). Every accidental export is future
breaking-change surface. Convert to a curated explicit export list; under the current post-1.0 semver
reality (§7.1), removing leaked internals is a major bump — one more reason to do it once, soon, and
deliberately.

Two specific items:

- **`Headers` name collision**: the exported `Headers` type alias (`ts/src/types.ts:1`) shadows the global
  `fetch` `Headers` — an easy mis-import in any consumer file that touches both. Rename to `FaceHeaders`
  (matching the `Face*` convention that everything else follows).
- **`control-plane-guardrails.ts` is a source-code linter shipped as runtime API** — it regex-scans file
  content strings for import statements (`ts/src/control-plane-guardrails.ts:111,174`). It belongs in
  build/CI tooling, not in every consumer's runtime bundle surface.

### 6.2 Rationalize module reachability

Three different rules coexist: `spa`/`oac-form`/`control-plane` are in **both** the barrel and dedicated
subpaths; `navigation-pending` is subpath-**only**; `adapter-csp` is in **neither** (unreachable, despite
being required reading for anyone writing a new adapter). Pick one rule (subpath for optional surfaces,
barrel for the core contract) and apply it uniformly.

### 6.3 Deduplicate internal helpers

The XSS-safe JSON escape chain is copy-pasted three times (`ts/src/html.ts:12-19`,
`ts/src/resource.ts:254-259`, `ts/src/ssr-hydration.ts:172-177`); `renderAttributes` twice
(`html.ts:29-48`, `head.ts:205-222`); `escapeHTML` twice (`html.ts:3`, `control-plane.ts:718-725`); DOM
guards and form-reading helpers duplicated between `navigation-pending.ts` and `oac-form.ts`. Security-
sensitive escaping logic in particular should exist exactly once. Relatedly, the control-plane bootstrap
ships as an untyped minified JS string literal (`ts/src/control-plane.ts:777-790`) that reimplements logic
which exists, typed and tested, in `navigation-pending.ts` — fold it back.

### 6.4 Reduce head-input ambiguity

`FaceRenderResult` offers four overlapping head channels: `head.title`, legacy `head.html`, `headTags`,
`styleTags` (`ts/src/types.ts:128-141`). Deprecate `head.html` (it is already escaped-and-wrapped into a
`raw` tag internally), document `headTags` as the one way, and note that dedup silently skips "keyless"
tags (`ts/src/head.ts:248-278`) — either dedup them structurally or document the exemption.

---

## 7. Documentation, examples, and positioning

### 7.1 Fix the versioning story the framework tells about itself

The README says "FaceTheory is pre-1.0 and under active development" (`README.md:52`) while installing
v3.8.0 — fourteen stable releases shipped in five weeks. Internal stewardship materials repeat the pre-1.0
posture. At 3.x, semver already promises post-1.0 discipline to consumers; the positioning should say what
the version number says: the API is versioned, breaking changes arrive as majors with migration notes.
Concretely: update the README status paragraph, add a **version-shaped upgrade section** to the migration
guide ("upgrading 3.7 → 3.8" — currently discovery of breaking changes requires scanning raw commit
subjects), publish the deprecation policy (how long a deprecated export survives), and stop duplicating
every release as an identical `-rc` entry in `CHANGELOG.md` (doubles its length for zero information).

### 7.2 Reconcile the "four render modes" claim

`FaceMode` is `'ssr' | 'ssg' | 'isr'` (`ts/src/types.ts:98`); SPA is a client-side navigation runtime, not
a declared mode. `docs/reference/render-modes.md` handles this honestly; the README headline and
`docs/api-reference.md:121` do not. Either wording ("three server render modes + a SPA client runtime") or
an actual `mode: 'spa'` shell pipeline — but the marketing and the type should agree.

### 7.3 Close the API-reference gap

Eight published subpaths are missing from the api-reference export map: `./spa`, `./oac-form`,
`./navigation-pending`, `./control-plane`, `./responsive-primitives`, and the three per-adapter
responsive-primitives paths (`ts/package.json:33-165` vs `docs/api-reference.md:42-67`). Also fix the
non-compiling `renderOptions:` fragment in `docs/getting-started.md:171-184`. Consider generating the
export table from `package.json` in CI so it cannot drift again.

### 7.4 Make the examples first-class product surface

- **Imports**: examples import `../../src/*.js` (×27 across files) rather than
  `@theory-cloud/facetheory` — a consumer copying one must rewrite every import, and no example can catch
  a broken `exports` map. Rewrite against the package name (path-mapped in tsconfig).
- **Verification**: only 7 of 21 examples run in CI; examples are excluded from typecheck
  (`ts/tsconfig.json:14`), and the two most load-bearing ones — `isr-blocking` (self-described "sketch")
  and `apptheory-lambda-url-streaming` — are neither typechecked nor executed anywhere. Given the repo
  rule that examples are consumer documentation, wire them all into typecheck plus at least a smoke run.
- **READMEs**: 12 of 21 examples have none.
- **Matrix gaps**: no framework ISR example (the only ISR example renders raw strings), no framework SSG
  example, no end-to-end SPA navigation example, strict-CSP exists only for Svelte while the docs promise
  React and Vue paths, and Vue is the thinnest adapter across the board. The matrix does not need all 12+
  cells — but each documented capability claim should have one runnable example behind it.

### 7.5 Consumer-facing packaging polish

- Add `"sideEffects": false` (with an audit) so bundlers can tree-shake the barrel; document the
  ESM-only stance and the `ERR_REQUIRE_ESM` failure a CJS consumer will hit.
- Document the Node ≥20 floor prominently at install time, not just in troubleshooting.
- Add `prettier --check` and coverage tooling (c8) to CI — neither runs today, and coverage is currently
  unmeasurable; ~13 of the 53 test files are Stitch UI tests, so raw counts overstate runtime coverage.

---

## 8. Cross-steward coordination register

Items in this assessment that cross repo boundaries — surfaced here, not acted on unilaterally:

| Item | Counterpart | Nature |
|---|---|---|
| ISR meta schema: persist `status`/`contentType` (§2.1) | TableTheory | Likely `FaceTheoryIsrMeta` field additions |
| ISR `invalidate(cacheKey)` purge API (§5.2) | TableTheory | Meta-store interface + model change |
| `BucketDeployment` without `distributionPaths` — no CloudFront invalidation on deploy (§5.1) | AppTheory | Construct enhancement upstream |
| Reference-stack migration to `AppTheorySsrSite` `SSG_ISR` mode (§5.1) | AppTheory (consume-only) | FaceTheory-side change, worth informing AppTheory steward |
| `stitch-hosted-auth` shared core + any Stitch/API surface changes (§4.4, §6) | Autheory | Consumes hosted-auth and shell primitives |
| Barrel curation / any export removals (§6.1) | Pay Theory checkout, Autheory | Breaking-change notification via the user |

---

## 9. Prioritized sequencing

**P0 — correctness (small, high-severity, mostly local):**
2.1 TableTheory hit-path status/contentType (+ test), 2.2 orphaned test into the runner + glob discovery,
2.3 store-failure → serve-stale, 2.5 mode validation at construction, 2.4 backpressure. Roughly a
release's worth of `fix:` commits; 2.1 may need the TableTheory coordination first or the S3-metadata
interim.

**P1 — the usability core (the "stronger product" spine):**
3.1 generic `FaceModule`, 3.2 error hook, 5.1 deployment convergence on `AppTheorySsrSite` + rewritten
deploy docs, 3.3 template repo/scaffold, 7.4 examples import the real package and run in CI.

**P2 — parity and operations:**
4.1 Vue streaming, 4.2 Vue style extraction (or documented position), 4.4 shared render scaffold +
hosted-auth core, 5.3 observability blind spots, 5.4 SSG concurrency, 2.6/2.7/2.8 router and ISR-key
options, 3.4 dev server.

**P3 — surface and positioning (bundle around one deliberate major):**
6.1–6.4 barrel curation, `FaceHeaders` rename, guardrails relocation, head-channel deprecation; 7.1–7.3
positioning/docs reconciliation; 4.3 Svelte runes migration; 3.5 testing subpath; 3.6/3.7 head + CSP
helpers (additive, can land earlier opportunistically).

**Quick wins inside a week:** 2.2 (one import line + follow-up), 2.5 (constructor check), 7.3 (doc table),
7.1 README status paragraph, changelog RC dedup config, `"sideEffects": false`, prettier/coverage in CI.

---

## 10. Explicit non-goals

Unchanged and reaffirmed — these would make the product weaker, not stronger:

- **No npm publish.** GitHub-Releases-only distribution is deliberate; improving *install ergonomics*
  (§3.3) is the answer to install friction, not a second registry.
- **No platform abstraction.** No Vercel/Cloudflare/Netlify targets, no platform-agnostic cache
  interfaces. AWS stays named.
- **No fifth render mode.** §7.2 asks for honest *naming* of what exists, not new modes.
- **ISR state stays in TableTheory.** §2.1/§5.2 grow the contract through TableTheory, never around it.
- **No CDK constructs shipped from FaceTheory.** Deployment constructs belong to AppTheory (§5.1);
  FaceTheory consumes and documents them.
- **No softening of determinism.** Everything here (error hooks, testing surface, hydration beacon)
  makes determinism *more* observable, never optional.
