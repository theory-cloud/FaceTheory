# Enumerated Changes: Product Strengthening (Assessment Remediation + Full Svelte 5 Migration)

**Source scoped need:** `docs/planning/SCOPED_NEED_PRODUCT_STRENGTHENING.md` (2026-07-02)
**Release packaging:** items 1–45 are the fix/additive train (patch/minor releases as they land);
items 46–53 are the **v4.0.0 breaking bundle** and land together as one deliberate major.
**Cross-steward prerequisites (not enumerated as commits):** TableTheory `FaceTheoryIsrMeta`
`status`/`contentType` fields + purge operation; AppTheory `AppTheorySsrSite` `distributionPaths`
invalidation. FaceTheory-side interim/consumption commits are enumerated below and do not block on them.

---

## Phase A — Correctness (fix train)

### 1. Discover unit tests by glob and run the orphaned AppTheory adapter suite

- **Paths**: `ts/test/run-unit.ts`
- **Layer**: tests
- **Render mode impact**: none
- **Determinism-sensitive**: no — test infrastructure only
- **Acceptance**: every `ts/test/unit/*.test.ts` on disk executes (glob discovery, no hand-maintained
  import list); `apptheory-adapter.test.ts` runs and passes. If the never-run suite exposes real adapter
  failures, those become an immediate prerequisite `fix(apptheory)` commit before this one lands.
- **Validation**: `cd ts && npm run check`; verify test count in output equals file count on disk
- **Conventional Commit subject**: `fix(test): discover unit tests by glob so no suite is orphaned`

### 2. Preserve ISR status and content type across cache hits via S3 object metadata

- **Paths**: `ts/src/isr.ts`, `ts/src/aws-s3/index.ts`, `ts/src/tabletheory/index.ts` (doc comment noting
  the schema gap), `ts/test/unit/isr.test.ts`, `ts/test/unit/aws-s3.test.ts`
- **Layer**: core + glue
- **Render mode impact**: isr
- **Determinism-sensitive**: no — response metadata round-trip, no HTML emission change
- **Acceptance**: an ISR Face returning 404 or non-HTML content type serves identical status/content-type
  on HIT as on MISS through the S3-metadata round-trip (same pattern as CSP at `isr.ts:848-851`); a new
  hit-path regression test locks it. When TableTheory ships schema fields, a follow-up commit moves the
  source of truth to the meta record (tracked, not enumerated).
- **Validation**: `cd ts && npm run check`; targeted `node --import tsx test/unit/isr.test.ts`
- **Conventional Commit subject**: `fix(isr): preserve status and content type on cache hits`

### 3. Serve stale on ISR metadata-store failure instead of 500

- **Paths**: `ts/src/isr.ts`, `ts/src/ops.ts` (new `isr_state` value), `ts/test/unit/isr.test.ts`,
  `docs/modes/isr.md`, `docs/OPERATIONS.md`
- **Layer**: core
- **Render mode impact**: isr
- **Determinism-sensitive**: no
- **Acceptance**: with a stale entry whose pointer is known, an injected metadata-store exception (read or
  lease path) serves the stale HTML with a degraded-mode `x-facetheory-isr` state instead of a 500;
  store failures with no serveable entry still 500 through the (new, see item 9) error hook path.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `fix(isr): serve stale when the metadata store fails`

### 4. Honor writable backpressure in Lambda URL streaming

- **Paths**: `ts/src/lambda-url.ts`, `ts/test/unit/lambda-url.test.ts`
- **Layer**: core
- **Render mode impact**: ssr (streaming), isr (streamed misses)
- **Determinism-sensitive**: no — byte order unchanged; only pacing changes
- **Acceptance**: `writeFaceResponseToLambdaWriter` awaits drain when `write()` returns false (test with a
  slow mock writable proves bounded buffering); chunk order and content byte-identical to before.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `fix(lambda-url): honor writable backpressure while streaming`

### 5. Validate Face contracts at construction

- **Paths**: `ts/src/app.ts`, `ts/src/types.ts`, `ts/test/unit/app.test.ts`, `docs/api-reference.md`
- **Layer**: core
- **Render mode impact**: all
- **Determinism-sensitive**: no
- **Acceptance**: `createFaceApp` throws for a `mode` outside `ssr|ssg|isr` (a typo'd mode silently
  disabled caching before — already-broken configs, so shipped as `fix`); it emits a structured warning
  through the observability log for `isr` without `revalidateSeconds` and `ssg` param routes without
  `generateStaticParams` (escalated to throws in item 53); empty routes and non-function `render` throw.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `fix(app): validate face mode and contract at construction`

### 6. Add a trailing-slash policy to routing

- **Paths**: `ts/src/app.ts`, `ts/src/router.ts`, `ts/src/types.ts`, `ts/test/unit/router.test.ts`,
  `ts/test/unit/app.test.ts`, `docs/core-patterns.md`
- **Layer**: core
- **Render mode impact**: all
- **Determinism-sensitive**: no — routing, not render emission
- **Acceptance**: `createFaceApp({ trailingSlash: 'strict' | 'redirect' | 'normalize' })` exists; default
  `'strict'` preserves current behavior exactly; `'redirect'` 308s `/foo/`→`/foo`; `'normalize'` matches
  both silently; docs recommend `'redirect'` and note the SSG CLI's existing `--trailing-slash` alignment.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `feat(router): configurable trailing-slash policy`

### 7. Add a cookie allowlist to the ISR request-variant key

- **Paths**: `ts/src/isr.ts`, `ts/test/unit/isr.test.ts`, `docs/features/isr-tenant-safety.md`,
  `docs/modes/isr.md`
- **Layer**: core
- **Render mode impact**: isr
- **Determinism-sensitive**: no
- **Acceptance**: `varyCookies: string[]` scopes which cookies fold into the variant digest; default
  (absent) keeps today's all-cookies fail-safe; tests prove two requests differing only in a non-listed
  cookie share a cache entry while a listed cookie partitions.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `feat(isr): cookie allowlist for request-variant cache keys`

### 8. Make the ISR tenant-boundary guard header list configurable

- **Paths**: `ts/src/isr.ts`, `ts/test/unit/isr.test.ts`, `docs/features/isr-tenant-safety.md`
- **Layer**: core
- **Render mode impact**: isr
- **Determinism-sensitive**: no
- **Acceptance**: deployments can register additional tenant-boundary header names that trigger the
  fail-closed guard; the two defaults remain; docs state that custom tenant headers must be registered.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `feat(isr): configurable tenant boundary header list`

---

## Phase B — Core ergonomics and observability (additive train)

### 9. Add an `onError` observability hook and stop swallowing errors

- **Paths**: `ts/src/ops.ts`, `ts/src/app.ts`, `ts/src/control-plane.ts`, `ts/test/unit/ops.test.ts`,
  `ts/test/unit/app.test.ts`, `ts/test/unit/control-plane-host-contracts-example.test.ts`,
  `docs/OPERATIONS.md`
- **Layer**: core
- **Render mode impact**: all
- **Determinism-sensitive**: no
- **Acceptance**: `FaceObservabilityHooks.onError(err, ctx)` receives the original exception from every
  currently-silent `catch` (render `app.ts:384-402`, resource `:270-274`, sidecar `:471-477`,
  control-plane section load/render); the `facetheory.request` metric gains an `error_class` tag; tested
  for buffered, streaming-preflight, resource, and control-plane paths.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `feat(ops): onError hook and error-class metric tag`

### 10. Make `FaceModule` generic over its load data

- **Paths**: `ts/src/types.ts`, `ts/src/app.ts`, new `defineFace` export, `ts/test/unit/app.test.ts`
  (typed compile-time fixture), `docs/api-reference.md`, `docs/reference/face-module.md`
- **Layer**: core
- **Render mode impact**: all
- **Determinism-sensitive**: no
- **Acceptance**: `FaceModule<TData = unknown>` threads `load`'s return into `render(ctx, data: TData)`;
  every existing untyped Face in repo/examples still compiles unchanged; `defineFace<TData>()` gives
  inference without annotation; docs show the typed pattern as primary.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `feat(types): generic FaceModule data flow and defineFace helper`

### 11. Introduce `FaceHeaders` and deprecate the `Headers` alias

- **Paths**: `ts/src/types.ts`, internal usages, `docs/api-reference.md`
- **Layer**: core
- **Render mode impact**: none
- **Determinism-sensitive**: no
- **Acceptance**: `FaceHeaders` is the documented name everywhere; `Headers` remains exported as a
  deprecated alias (JSDoc `@deprecated`, changelog note) until item 51 removes it in v4.0.0.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `feat(types): FaceHeaders alias; deprecate Headers export`

### 12. Consolidate duplicated escaping and attribute-rendering helpers

- **Paths**: `ts/src/html.ts`, `ts/src/head.ts`, `ts/src/resource.ts`, `ts/src/ssr-hydration.ts`,
  `ts/src/control-plane.ts`, `ts/src/navigation-pending.ts`, `ts/src/oac-form.ts`, unit tests
- **Layer**: core
- **Render mode impact**: all
- **Determinism-sensitive**: **yes** — touches the escaping used in head/style/hydration emission; output
  must be byte-identical (pure consolidation, proven by existing golden tests plus new equivalence cases)
- **Acceptance**: the XSS-safe JSON escape chain exists exactly once (currently 3×); `renderAttributes`
  once (2×); `escapeHTML` once (2×); shared DOM guards between `navigation-pending`/`oac-form`; the
  control-plane bootstrap string literal consumes the typed `navigation-pending` logic instead of
  reimplementing it; no test output changes.
- **Validation**: `cd ts && npm run check`; `npm run example:streaming:serve` (hydration smoke)
- **Conventional Commit subject**: `refactor(core): single implementation for escaping and attribute rendering`

### 13. Add the shared adapter render pipeline primitive to core

- **Paths**: new `ts/src/adapter-pipeline.ts` (or extend `ts/src/types.ts`), `ts/src/index.ts` export,
  unit test
- **Layer**: core
- **Render mode impact**: all
- **Determinism-sensitive**: **yes** — defines the shared render/integration/CSP ordering all adapters
  will emit through
- **Acceptance**: core exports `modeUsesRuntimeHydrationSidecars` (today triplicated verbatim), an
  `assembleFaceRenderResult` helper, and an integration-pipeline runner (prepare → wrap → render via
  injected `renderTree` → contribute → finalize → strict-CSP enforce) with unit tests covering ordering;
  no adapter consumes it yet (items 14–16).
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `feat(core): shared adapter render pipeline primitive`

### 14. Adopt the shared render pipeline in the React adapter

- **Paths**: `ts/src/adapters/react.ts`, `ts/test/unit/react.test.ts`, `ts/test/unit/react-stream.test.ts`
- **Layer**: react adapter
- **Render mode impact**: all
- **Determinism-sensitive**: **yes** — SSR render path refactor; output must be byte-identical
- **Acceptance**: buffered and streaming React paths run through the core pipeline; all existing React,
  Emotion, AntD, streaming, and strict-CSP tests pass unchanged.
- **Validation**: `cd ts && npm run check`; `npm run example:streaming:serve`;
  `npm run example:vite:react:build && npm run example:vite:react:serve` (per package.json script names)
- **Conventional Commit subject**: `refactor(react): adopt shared render pipeline`

### 15. Adopt the shared render pipeline in the Vue adapter

- **Paths**: `ts/src/vue/index.ts`, `ts/test/unit/vue.test.ts`
- **Layer**: vue adapter
- **Render mode impact**: all
- **Determinism-sensitive**: **yes** — same justification as item 14; also removes Vue's subtly divergent
  contribute-loop ordering (divergence, if observable, is called out in the commit body)
- **Acceptance**: Vue renders through the core pipeline; existing Vue tests pass; contribute ordering now
  matches React's.
- **Validation**: `cd ts && npm run check`; `npm run example:vite:vue:build && npm run example:vite:vue:serve`
- **Conventional Commit subject**: `refactor(vue): adopt shared render pipeline`

### 16. Adopt the shared render pipeline in the Svelte adapter

- **Paths**: `ts/src/svelte/index.ts`, `ts/test/unit/svelte.test.ts`
- **Layer**: svelte adapter
- **Render mode impact**: all
- **Determinism-sensitive**: **yes** — same justification as item 14
- **Acceptance**: Svelte renders through the core pipeline; existing Svelte tests pass unchanged.
- **Validation**: `cd ts && npm run check`;
  `npm run example:vite:svelte:build && npm run example:vite:svelte:serve`
- **Conventional Commit subject**: `refactor(svelte): adopt shared render pipeline`

---

## Phase C — Adapter parity (additive train)

### 17. Add Vue streaming SSR

- **Paths**: `ts/src/vue/index.ts` (`renderVueStream`, `createVueStreamFace`), new
  `ts/test/unit/vue-stream.test.ts`, new example `ts/examples/vue-ssr-streaming/`, `ts/package.json`
  example scripts, `docs/adapters/vue.md`
- **Layer**: vue adapter + example + docs
- **Render mode impact**: ssr, isr
- **Determinism-sensitive**: **yes** — new streaming emission path; head-before-body and nonce invariants
  must hold as in React
- **Acceptance**: a Vue Face streams through the same `AsyncIterable<Uint8Array>` contract as React using
  `@vue/server-renderer` streaming; tests mirror `react-stream.test.ts` (head-before-body, strict-CSP
  buffering, mid-stream error marker); the example serves.
- **Validation**: `cd ts && npm run check`; new `npm run example:vue:streaming:serve`
- **Conventional Commit subject**: `feat(vue): streaming SSR with createVueStreamFace`

### 18. Document the Vue style-extraction position and lock it with a test

- **Paths**: `docs/adapters/vue.md`, `ts/test/unit/vue.test.ts`
- **Layer**: vue adapter (docs + test)
- **Render mode impact**: ssr, ssg, isr
- **Determinism-sensitive**: no — documents existing behavior, adds a characterization test
- **Acceptance**: docs state the supported Vue position (build-time CSS via Vite; `wrapApp` hook for
  CSS-in-JS libraries, with a worked example) so the current silence stops reading as an oversight; a
  test characterizes `wrapApp`-provided style contribution.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `docs(vue): supported style-extraction position with wrapApp example`

### 19. Add a shared `stitch-hosted-auth` core contract

- **Paths**: new `ts/src/stitch-hosted-auth/index.ts` (types + shared logic), `ts/src/index.ts` or subpath
  export, refactor `ts/src/react/stitch-hosted-auth/`, `ts/src/vue/stitch-hosted-auth/`,
  `ts/src/svelte/stitch-hosted-auth/` to consume it, `ts/test/unit/stitch-hosted-auth.test.ts`
- **Layer**: stitch + all three adapters
- **Render mode impact**: none (component contract)
- **Determinism-sensitive**: no — type/contract consolidation, rendered output unchanged (existing stitch
  tests prove it)
- **Acceptance**: hosted-auth types/logic exist once in core (matching the `stitch-shell`/`stitch-admin`
  pattern); all three adapters consume the shared contract; Autheory steward notified via the user before
  release (consumer of these bindings).
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `feat(stitch): shared hosted-auth core contract`

---

## Phase D — Head, security, testing, observability (additive train)

### 20. Add head authoring helpers including a strict-CSP JSON-LD path

- **Paths**: `ts/src/head.ts`, `ts/src/security.ts` (nonce-carried JSON-LD allowance), `ts/src/index.ts`,
  `ts/test/unit/head.test.ts`, `docs/features/head.md`, `docs/api-reference.md`
- **Layer**: core
- **Render mode impact**: all
- **Determinism-sensitive**: **yes** — head emission; helpers must compose into the existing deterministic
  ordering, and JSON-LD under strict CSP is security-review material (scoped-need open question 4:
  default is nonce-carried inline `application/ld+json`)
- **Acceptance**: typed `metaTag`/`openGraph`/`twitterCard`/`canonical`/`jsonLd` helpers plus a title
  template option emit through the existing primitive; JSON-LD works under `inlineScripts: false` via the
  request nonce; keyless-tag dedup exemption is documented (structural dedup is item 52); docs show the
  helper-first pattern.
- **Validation**: `cd ts && npm run check`; `npm run example:vite:svelte:strict-csp:build && npm run example:vite:svelte:strict-csp:serve`
- **Conventional Commit subject**: `feat(head): authoring helpers with strict-CSP JSON-LD support`

### 21. Make `buildStrictCspHeader` extensible

- **Paths**: `ts/src/security.ts`, `ts/test/unit/security.test.ts` (or the strict-csp harness test),
  `docs/features/strict-csp.md`
- **Layer**: core
- **Render mode impact**: all
- **Determinism-sensitive**: no — header composition, not render emission
- **Acceptance**: consumers can extend directives (`connect-src`, `img-src`, `report-to`, …) through the
  primitive; `unsafe-inline`/`unsafe-eval` are rejected with actionable errors; default output
  byte-identical to today when no extensions are passed.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `feat(security): extensible strict CSP directive composition`

### 22. Ship the consumer testing subpath

- **Paths**: new `ts/src/testing/index.ts` (productizing `ts/test/helpers/strict-csp.ts` +
  `portal-reference-hydrate.js` patterns), `ts/package.json` exports (`./testing`), new
  `ts/test/unit/testing.test.ts`, `docs/testing-guide.md` (new "test your Faces" section),
  `docs/troubleshooting.md` (new hydration-mismatch entry)
- **Layer**: core + docs
- **Render mode impact**: all
- **Determinism-sensitive**: no — test-time tooling; it *verifies* determinism rather than altering it
- **Acceptance**: `import { buildFaceRequest, renderFace, assertHydrationEquivalent } from
  '@theory-cloud/facetheory/testing'` works; a consumer can unit-test a Face without hand-building Lambda
  events; the troubleshooting guide finally has a hydration-mismatch entry (the signature failure mode).
- **Validation**: `cd ts && npm run check`; `bash scripts/verify-ts-pack.sh` (new subpath ships)
- **Conventional Commit subject**: `feat(testing): consumer testing subpath with hydration assertions`

### 23. Add an opt-in client hydration-failure beacon

- **Paths**: `ts/src/client/index.ts`, `ts/test/unit/client-hydration.test.ts`, `docs/OPERATIONS.md`
- **Layer**: core (client)
- **Render mode impact**: all
- **Determinism-sensitive**: no — client-side reporting only; does not alter server emission or hydration
  behavior
- **Acceptance**: an optional `reportHydrationFailure({ endpoint })` helper posts a same-origin beacon on
  framework hydrate errors when the consumer wires it; nothing changes when unwired; documented alongside
  the ops hooks so the signature failure mode becomes measurable.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `feat(client): opt-in hydration-failure beacon`

### 24. Add ISR efficiency and stream-error metrics

- **Paths**: `ts/src/isr.ts`, `ts/src/html.ts`, `ts/src/app.ts`, `ts/src/ops.ts`,
  `ts/test/unit/{isr,ops,streaming}.test.ts`, `docs/OPERATIONS.md`
- **Layer**: core
- **Render mode impact**: isr, ssr (streaming)
- **Determinism-sensitive**: **yes** — adds hook invocations inside the streaming document path
  (`html.ts:94-104`); emitted bytes must remain identical (existing streaming golden tests prove it)
- **Acceptance**: dedicated metrics for regeneration duration (distinct from `render_ms`),
  lease-contention count, and hit/miss/stale counters; the mid-stream error marker also emits a
  structured log + `facetheory.stream_error` metric instead of only `console.error`; a cold-start marker
  tag lands on the first request metric.
- **Validation**: `cd ts && npm run check`; `npm run example:streaming:serve`
- **Conventional Commit subject**: `feat(ops): ISR efficiency and stream-error metrics`

### 25. Add `invalidate(cacheKey)` to the ISR meta-store interface

- **Paths**: `ts/src/isr.ts` (interface + `InMemoryIsrMetaStore`), `ts/src/tabletheory/index.ts`
  (graceful `IsrInvalidateUnsupportedError` until TableTheory ships the operation), `ts/test/unit/isr.test.ts`,
  `docs/modes/isr.md`, `docs/OPERATIONS.md` (S3 lifecycle guidance for orphaned HTML objects)
- **Layer**: core + glue
- **Render mode impact**: isr
- **Determinism-sensitive**: no
- **Acceptance**: `invalidate` force-stales or deletes a meta record so the next request regenerates;
  in-memory store implements it; the TableTheory adapter throws a clearly-worded unsupported error naming
  the pending TableTheory coordination; operators get documented S3 lifecycle guidance for orphans.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `feat(isr): on-demand invalidate on the meta-store interface`

---

## Phase E — SSG, dev loop, scaffolding (additive train)

### 26. Parallelize SSG builds with per-route error isolation

- **Paths**: `ts/src/ssg.ts`, `ts/src/ssg-cli.ts` (`--concurrency`), `ts/test/unit/ssg.test.ts`,
  `docs/modes/ssg.md`
- **Layer**: core
- **Render mode impact**: ssg
- **Determinism-sensitive**: no — output content per page unchanged; ordering of writes is not part of
  the contract (deterministic content per path is, and stays tested)
- **Acceptance**: bounded-concurrency rendering (default preserves current serial behavior via
  `concurrency: 1`; CLI flag raises it); a failing route no longer aborts the build — it is collected
  into a failed-routes report and a non-zero exit while successful pages still emit.
- **Validation**: `cd ts && npm run check`; `npm run example:ssg:build && npm run example:ssg:serve`
- **Conventional Commit subject**: `feat(ssg): bounded concurrency and per-route error isolation`

### 27. Add incremental SSG builds

- **Paths**: `ts/src/ssg.ts`, `ts/src/ssg-cli.ts` (`--incremental`), `ts/test/unit/ssg.test.ts`,
  `docs/modes/ssg.md`
- **Layer**: core
- **Render mode impact**: ssg
- **Determinism-sensitive**: no
- **Acceptance**: with `--incremental`, unchanged routes (content-hash over rendered output vs a build
  manifest) are skipped without `rm -rf`; a full clean build remains the default; determinism-across-runs
  test extended to prove skip correctness.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `feat(ssg): content-hash incremental builds`

### 28. Add a Vite middleware dev server

- **Paths**: new `ts/src/dev.ts` (or `ts/src/vite.ts` extension), `ts/package.json` (`dev` script + bin
  wiring), `ts/examples/vite-ssr-react/` dev entry, `docs/getting-started.md` (dev-loop section)
- **Layer**: core + example + docs
- **Render mode impact**: ssr (dev loop)
- **Determinism-sensitive**: no — dev-only asset-resolution branch; production manifest path untouched
  (a test asserts the production path is unaffected)
- **Acceptance**: `npm run dev` in the React example serves through `vite.createServer({ middlewareMode })`
  with the FaceApp mounted; an edit to a component reflects without manual rebuild (HMR for client
  assets, module-graph reload for the server render); success criterion 12 met.
- **Validation**: `cd ts && npm run check`; manual dev-loop smoke documented in the commit
- **Conventional Commit subject**: `feat(vite): middleware-mode dev server with HMR`

### 29. Add the `facetheory create` scaffold command

- **Paths**: new `ts/src/create-cli.ts` + templates under `ts/src/create-templates/` (React default,
  `--adapter vue|svelte`), `ts/package.json` bin entry, `docs/getting-started.md` (scaffold-first
  quickstart), new template smoke test
- **Layer**: core (CLI) + docs
- **Render mode impact**: none
- **Determinism-sensitive**: no
- **Acceptance**: `npx facetheory create my-app --adapter react` emits a working starter (pinned tarball
  install lines, peers, the npm `overrides` block, a client entry with a real hydrate call, an
  `AppTheorySsrSite`-based CDK app); generated project's typecheck passes in the smoke test. The
  per-framework client entry templates close the "hydration is 100% hand-written" gap.
- **Validation**: `cd ts && npm run check`; scaffold smoke test
- **Conventional Commit subject**: `feat(cli): facetheory create starter scaffold`

### 30. Add the `facetheory doctor` install checker

- **Paths**: new `ts/src/doctor-cli.ts`, `ts/package.json` bin entry, `docs/troubleshooting.md`
- **Layer**: core (CLI) + docs
- **Render mode impact**: none
- **Determinism-sensitive**: no
- **Acceptance**: `npx facetheory doctor` verifies the supported Node floor (read from the package
  `engines` field, never hard-coded), peer presence/versions (including the Svelte exclusion band with
  its rationale), and the AppTheory/TableTheory override alignment; each failure prints the fix.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `feat(cli): facetheory doctor environment checks`

---

## Phase F — Deployment convergence and examples (additive train)

### 31. Migrate the SSG/ISR reference stack to `AppTheorySsrSite` SSG_ISR mode

- **Paths**: `infra/apptheory-ssg-isr-site/src/stack.ts`, `infra/apptheory-ssg-isr-site/test/`
  (snapshots), `docs/AWS_DEPLOYMENT_SHAPE.md`
- **Layer**: infra reference
- **Render mode impact**: ssg, isr (deployment topology)
- **Determinism-sensitive**: no
- **Acceptance**: the stack synthesizes via `AppTheorySsrSite` with `mode: SSG_ISR`; the hand-rolled
  distribution, origin group, and both inline CloudFront function strings are deleted; snapshot updated;
  behavior parity (origin-group fallback, rewrite semantics, request-id header) asserted against the
  template. The upstream `distributionPaths` gap is noted in docs as the AppTheory coordination item.
- **Validation**: `cd infra/apptheory-ssg-isr-site && npm ci && npm test`
- **Conventional Commit subject**: `fix(infra): converge SSG/ISR reference stack on AppTheorySsrSite`

### 32. Put a real FaceTheory app behind the SSR reference stack

- **Paths**: `infra/apptheory-ssr-site/src/` (handler renders via `createFaceApp` + the AppTheory
  adapter instead of an inline HTML string), snapshots, `docs/cdk/aws-deployment.md`
- **Layer**: infra reference
- **Render mode impact**: ssr
- **Determinism-sensitive**: no
- **Acceptance**: the flagship deployment example exercises `createFaceApp` +
  `createAppTheoryFaceHandler` end-to-end; snapshot updated.
- **Validation**: `cd infra/apptheory-ssr-site && npm ci && npm test`
- **Conventional Commit subject**: `fix(infra): render the SSR reference stack through a real FaceApp`

### 33. Rewrite the deploy docs around the paved AppTheorySsrSite path

- **Paths**: `docs/cdk/README.md`, `docs/cdk/aws-deployment.md`, `docs/getting-started.md` (deploy
  section), `README.md` (deploy pointer)
- **Layer**: docs
- **Render mode impact**: all
- **Determinism-sensitive**: no
- **Acceptance**: a single end-to-end "hello world to live CloudFront URL" walkthrough exists: scaffold →
  build → `AppTheorySsrSite` props (domain, WAF, ISR wiring) → deploy → curl; no fragment assembly
  required; the 21-line `docs/cdk/README.md` stub is replaced.
- **Validation**: docs link-integrity check (`pages.yml` job) locally via the documented Jekyll preview
- **Conventional Commit subject**: `docs(cdk): paved AppTheorySsrSite deployment walkthrough`

### 34. Point examples at the published package surface and typecheck them all

- **Paths**: all `ts/examples/**` imports (`../../src/*.js` → `@theory-cloud/facetheory[/…]`),
  `ts/tsconfig.json` (paths mapping + include examples), `ts/package.json` if needed
- **Layer**: examples
- **Render mode impact**: all
- **Determinism-sensitive**: no
- **Acceptance**: zero `../../src/` imports remain under `ts/examples/` (greppable); all 21 examples
  typecheck in `npm run typecheck`; a broken `exports` map now fails CI via example compilation.
- **Validation**: `cd ts && npm run check`; grep gate in the commit
- **Conventional Commit subject**: `fix(examples): import the published package surface and typecheck all examples`

### 35. Run the ISR and AppTheory streaming examples in CI

- **Paths**: `ts/test/unit/` new smoke tests importing `ts/examples/isr-blocking/` and
  `ts/examples/apptheory-lambda-url-streaming/` handlers, example cleanups they surface
- **Layer**: examples + tests
- **Render mode impact**: isr, ssr
- **Determinism-sensitive**: no
- **Acceptance**: the two most load-bearing deployment examples execute under the unit runner (invoke via
  `handleLambdaUrlEvent` / AppTheory TestEnv); the "example sketch" disclaimer comes off `isr-blocking`.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `test(examples): CI smoke coverage for ISR and AppTheory streaming examples`

### 36. Add a framework ISR example (React)

- **Paths**: new `ts/examples/react-isr/`, `ts/package.json` scripts, smoke test, README
- **Layer**: example
- **Render mode impact**: isr
- **Determinism-sensitive**: no
- **Acceptance**: an ISR Face rendering a real React tree (not raw strings) with `revalidateSeconds`,
  the in-memory stores locally and env-var wiring notes for S3/TableTheory; runs in CI.
- **Validation**: `cd ts && npm run check`; new example script serves
- **Conventional Commit subject**: `feat(examples): React ISR example`

### 37. Add React and Vue strict-CSP examples

- **Paths**: new `ts/examples/vite-strict-csp-react/`, `ts/examples/vite-strict-csp-vue/`, scripts,
  smoke tests, READMEs
- **Layer**: example
- **Render mode impact**: ssr
- **Determinism-sensitive**: no — exercises existing enforcement; the examples *are* the determinism
  evidence for the documented React/Vue strict-CSP claims
- **Acceptance**: the api-reference's React and Vue strict-CSP claims each have a runnable example behind
  them (today only Svelte does); both run in CI.
- **Validation**: `cd ts && npm run check`; both example build+serve scripts
- **Conventional Commit subject**: `feat(examples): React and Vue strict-CSP examples`

### 38. Add an end-to-end SPA navigation example

- **Paths**: new `ts/examples/spa-navigation/`, scripts, smoke test, README
- **Layer**: example
- **Render mode impact**: spa
- **Determinism-sensitive**: no
- **Acceptance**: demonstrates `startFaceNavigation` + `hydrateFaceNavigation` + navigation-pending +
  sidecar data loading across two Faces; runs in CI.
- **Validation**: `cd ts && npm run check`; example serve script
- **Conventional Commit subject**: `feat(examples): end-to-end SPA navigation example`

### 39. Add a framework SSG example (Vue)

- **Paths**: new `ts/examples/vue-ssg/`, scripts, smoke test, README
- **Layer**: example
- **Render mode impact**: ssg
- **Determinism-sensitive**: no
- **Acceptance**: SSG with `generateStaticParams` rendering a real Vue tree with Vite assets (today's
  only SSG example is raw strings); runs in CI; also thickens the thinnest adapter's example surface.
- **Validation**: `cd ts && npm run check`; example build+serve
- **Conventional Commit subject**: `feat(examples): Vue SSG example`

### 40. Add READMEs to every example

- **Paths**: `ts/examples/*/README.md` (the 12 missing)
- **Layer**: docs
- **Render mode impact**: none
- **Determinism-sensitive**: no
- **Acceptance**: all examples state what they demonstrate, how to run them, and which docs page they
  back; greppable completeness (every example dir has a README).
- **Validation**: docs link check
- **Conventional Commit subject**: `docs(examples): README for every example`

---

## Phase G — Docs, positioning, CI (additive train)

### 41. Reconcile the API reference with the real export surface, verified in CI

- **Paths**: `docs/api-reference.md` (8 missing subpaths), `docs/getting-started.md:171-184` (broken
  `renderOptions:` fragment), new `scripts/verify-docs-export-map.sh`, `.github/workflows/ci.yml`
- **Layer**: docs + CI
- **Render mode impact**: none
- **Determinism-sensitive**: no
- **Acceptance**: every `ts/package.json` exports subpath appears in the api-reference export map; the
  getting-started snippet compiles; a CI script fails when the map drifts again.
- **Validation**: `bash scripts/verify-docs-export-map.sh`; docs link check
- **Conventional Commit subject**: `docs(api): reconcile export map with package exports and gate in CI`

### 42. Reconcile versioning posture and render-mode wording

- **Paths**: `README.md` (Status paragraph; "At a glance" wording), `docs/reference/render-modes.md`
  cross-references, `docs/api-reference.md` mode wording, new `docs/deprecation-policy.md`,
  `docs/migration-guide.md` (version-shaped "upgrading X→Y" section)
- **Layer**: docs
- **Render mode impact**: none
- **Determinism-sensitive**: no
- **Acceptance**: the README stops saying "pre-1.0" at v3.8.0 and states post-1.0 semver discipline;
  mode wording is "three server render modes + a SPA client runtime" everywhere the headline appears;
  a published deprecation policy states how long deprecated exports survive; the migration guide gains a
  version-index section (no `x-release-please-version` markers hand-edited).
- **Validation**: docs link check; `bash scripts/verify-version-alignment.sh` (untouched markers)
- **Conventional Commit subject**: `docs: reconcile versioning posture and render-mode wording`

### 43. Add format and coverage gates to CI

- **Paths**: `.github/workflows/ci.yml`, `ts/package.json` (c8 devDependency + `coverage` script),
  `Makefile`
- **Layer**: CI
- **Render mode impact**: none
- **Determinism-sensitive**: no
- **Acceptance**: `prettier --check` runs in the `ts` job; c8 produces a coverage report uploaded as an
  artifact (report-only first; a threshold gate is a follow-on once the baseline is known).
- **Validation**: CI green on the PR; `cd ts && npm run format:check && npm run coverage`
- **Conventional Commit subject**: `ci(ts): format check and coverage reporting`

### 44. Declare `sideEffects: false` and document the packaging posture

- **Paths**: `ts/package.json`, `ts/README.md`, `docs/getting-started.md` (ESM-only + `ERR_REQUIRE_ESM`
  note, the supported Node floor at install time, Svelte peer-band rationale)
- **Layer**: core (packaging) + docs
- **Render mode impact**: none
- **Determinism-sensitive**: no
- **Acceptance**: after a side-effect audit of module top-levels, `"sideEffects": false` ships so bundlers
  can prune the barrel; the ESM-only stance, Node floor, and Svelte exclusion band are documented where a
  consumer installs, not just in troubleshooting.
- **Validation**: `cd ts && npm run check`; `bash scripts/verify-ts-pack.sh`; example bundles still serve
- **Conventional Commit subject**: `fix(package): enable tree-shaking and document packaging posture`

### 45. Stop duplicating `-rc` entries in the stable changelog

- **Paths**: `release-please-config.json` / `release-please-config.premain.json` /
  `scripts/render-release-notes.sh` (whichever governs; release-infra change, **not** manifests)
- **Layer**: release infrastructure
- **Render mode impact**: none
- **Determinism-sensitive**: no
- **Acceptance**: the stable `CHANGELOG.md` no longer carries an identical `-rc` twin for every release;
  the premain RC pipeline still gets its own notes; validated against the existing release-workflow
  self-tests (`scripts/test-release-workflow-changelog-preservation.sh`). Release-steward care applies:
  this touches release automation inputs, never manifests or tags, and must go through the normal
  staging→premain→main train.
- **Validation**: `bash scripts/test-release-workflow-changelog-preservation.sh`; RC dry-run on premain
- **Conventional Commit subject**: `chore(release): dedupe rc entries from the stable changelog`

---

## Phase H — Svelte 5 migration pre-work (additive train, must precede Phase I)

### 46. Capture SSR output equivalence fixtures for every Svelte component

- **Paths**: new `ts/test/unit/svelte-ssr-fixtures.test.ts` + fixture files, `ts/test/helpers/`
- **Layer**: svelte adapter (tests)
- **Render mode impact**: ssr, ssg, isr
- **Determinism-sensitive**: **yes** — this *is* the determinism harness for the migration: golden SSR
  output for all 66 components under the current legacy syntax
- **Acceptance**: every `.svelte` component in `svelte/stitch-shell`, `svelte/stitch-admin`,
  `svelte/stitch-hosted-auth`, and `svelte/responsive-primitives` has a rendered-output fixture
  (representative props, head/style contributions included); suite green against the legacy components.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `test(svelte): SSR output equivalence fixtures for all components`

---

## Phase I — v4.0.0 breaking bundle (single major release train)

Items 47–53 merge to `staging` together, ride one premain RC line, and ship as v4.0.0. Consumer
notification (Pay Theory checkout, Autheory, keybank-app-example) goes out via the user when the RC is
cut, per the pre-release coordination rule.

### 47. Require Svelte 5 and modernize the adapter internals

- **Paths**: `ts/package.json` (peer `svelte >=5.55.7` only), `ts/src/svelte/index.ts` (remove or
  re-justify the `svelte/server` fallback at `:97-112`), `ts/src/svelte-components.d.ts`,
  `ts/test/unit/svelte.test.ts`, `README.md` peer table, `docs/adapters/svelte.md`,
  `docs/migration-guide.md` (new migration entry)
- **Layer**: svelte adapter
- **Render mode impact**: ssr, ssg, isr
- **Determinism-sensitive**: **yes** — adapter render path; equivalence fixtures (item 46) must stay green
- **Acceptance**: Svelte 4 support is dropped explicitly (`BREAKING CHANGE:` body naming the old range);
  the exclusion band either disappears (if it guarded the legacy path) or stays with a documented
  rationale; components still compile in Svelte 5 legacy-compat mode pending items 48–50.
- **Validation**: `cd ts && npm run check`; `npm run example:vite:svelte:build && npm run example:vite:svelte:serve`
- **Conventional Commit subject**: `feat(svelte)!: require svelte >=5.55.7 and modernize adapter internals`

### 48. Migrate `stitch-shell` and `stitch-admin` Svelte components to runes

- **Paths**: `ts/src/svelte/stitch-shell/*.svelte`, `ts/src/svelte/stitch-admin/*.svelte`, their tests
- **Layer**: svelte adapter
- **Render mode impact**: ssr, ssg, isr
- **Determinism-sensitive**: **yes** — recompilation may alter SSR output; fixtures from item 46 are the
  gate; any intentional diff is updated in fixtures and named in the commit body
- **Acceptance**: `export let`→`$props()`, `$:`→`$derived`/`$effect`, `<slot>`→snippets/`{@render}`,
  `on:`→event attributes across both families; zero legacy syntax remains in these directories
  (greppable); fixtures green.
- **Validation**: `cd ts && npm run check`; targeted stitch tests
- **Conventional Commit subject**: `refactor(svelte): migrate stitch-shell and stitch-admin to runes`

### 49. Migrate `stitch-hosted-auth` and wizard Svelte components to runes

- **Paths**: `ts/src/svelte/stitch-hosted-auth/*.svelte` + wizard components under stitch-admin if
  separated, their tests
- **Layer**: svelte adapter
- **Render mode impact**: ssr, ssg, isr
- **Determinism-sensitive**: **yes** — same gate as item 48; Autheory consumes these bindings, so any
  fixture diff is called out in the consumer notification
- **Acceptance**: zero legacy syntax in these directories; fixtures green.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `refactor(svelte): migrate hosted-auth and wizard components to runes`

### 50. Migrate remaining Svelte components and forbid legacy syntax structurally

- **Paths**: `ts/src/svelte/responsive-primitives/*.svelte` + any stragglers, `ts/eslint.config.js` or a
  new `scripts/verify-svelte-runes.sh` grep gate wired into `npm run lint`/CI
- **Layer**: svelte adapter + CI
- **Render mode impact**: ssr, ssg, isr
- **Determinism-sensitive**: **yes** — same fixture gate
- **Acceptance**: success criterion 7 holds repo-wide — zero `export let`, `$:`, `<slot>`, `$$slots`,
  `$$restProps`, or `on:` directives under `ts/src/**/*.svelte`, enforced by a CI gate so legacy syntax
  cannot return; event syntax is uniformly `onclick=`-style.
- **Validation**: `cd ts && npm run check`; `bash scripts/verify-svelte-runes.sh`
- **Conventional Commit subject**: `refactor(svelte): complete runes migration with a structural gate`

### 51. Curate the public export surface

- **Paths**: `ts/src/index.ts` (wildcard barrel → explicit list; drop `Router`, path/header/query/cookie
  utilities, `normalizeHeadTags`/`renderHeadTag`), `ts/package.json` exports (add `navigation-pending`
  to the documented pattern, expose `adapter-csp` via a subpath for adapter authors, remove
  `control-plane-guardrails` from runtime — relocated to `scripts/`), `docs/api-reference.md`,
  `docs/migration-guide.md`
- **Layer**: core (public API)
- **Render mode impact**: none
- **Determinism-sensitive**: no
- **Acceptance**: the barrel is a curated explicit list; module reachability follows one rule (core
  contract in the barrel, optional surfaces as subpaths); the source-code linter is out of the runtime
  package; every removed name is listed in the `BREAKING CHANGE:` body with its replacement (or "was
  internal").
- **Validation**: `cd ts && npm run check`; `bash scripts/verify-ts-pack.sh`; docs export-map gate (item 41)
- **Conventional Commit subject**: `feat(core)!: curated public export surface`

### 52. Remove the deprecated `Headers` alias and the legacy `head.html` channel; dedupe keyless head tags

- **Paths**: `ts/src/types.ts`, `ts/src/head.ts`, `ts/test/unit/head.test.ts`, `docs/api-reference.md`,
  `docs/migration-guide.md`
- **Layer**: core
- **Render mode impact**: all
- **Determinism-sensitive**: **yes** — head emission changes: `head.html` input channel removed
  (deprecated since item 11's train), keyless meta/link/script tags now dedupe structurally instead of
  passing through silently
- **Acceptance**: `FaceHeaders` is the only exported name; `headTags` + `head.title` are the two head
  channels; structural dedup covers previously-exempt keyless tags with the behavior change documented;
  migration guide names each replacement.
- **Validation**: `cd ts && npm run check`; `npm run example:streaming:serve`
- **Conventional Commit subject**: `feat(head)!: remove legacy head channels and dedupe keyless tags`

### 53. Escalate Face contract warnings to construction errors

- **Paths**: `ts/src/app.ts`, `ts/test/unit/app.test.ts`, `docs/migration-guide.md`
- **Layer**: core
- **Render mode impact**: all
- **Determinism-sensitive**: no
- **Acceptance**: the item-5 warnings become throws — `isr` without `revalidateSeconds` and `ssg` param
  routes without `generateStaticParams` fail `createFaceApp` with actionable messages; success criterion
  4 fully met.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `feat(app)!: enforce face contract validation at construction`

---

## Self-check

- Core primitives precede adapters: item 13 before 14–16; item 9/10 before anything consuming them. ✓
- Determinism-sensitive items flagged: 12, 13, 14, 15, 16, 17, 20, 24, 46, 47, 48, 49, 50, 52 — each
  with the hydration-test path named in Validation (React streaming example is the default aggressive
  check; Svelte migration uses the item-46 fixtures). ✓
- All three adapters enumerated for the shared pipeline (14/15/16) and hosted-auth core (19). Vue
  streaming (17) is deliberately single-adapter parity *closure*, with Svelte's buffered-only position
  documented in scope. ✓
- Examples ride with capability: 17 (Vue streaming example), 28 (dev), 29 (scaffold templates), 36–39. ✓
- Docs ride with behavior: every consumer-visible item lists its docs path. ✓
- No forward dependencies: 11 before 52; 46 before 47–50; 5 before 53; 13 before 14–16; 41's gate
  script exists before 51 relies on it. ✓
- Release manifests and `x-release-please-version` markers appear in no item; item 45 touches release
  *config* only, with the release-steward caveat stated. ✓
- Union of items covers scoped-need success criteria 1–15 (criterion mapping: 1→2, 2→1, 3→3, 4→5+53,
  5→9, 6→10, 7→46–50, 8→17, 9→31–32, 10→34–39, 11→41, 12→28, 13→22, 14→12+51+52, 15→42–45). ✓

## Addendum (2026-07-02, after sibling-program overlap check)

### 54. Add JSDoc to the public API surface

- **Paths**: `ts/src/types.ts` (`FaceModule`, `FaceContext`, `FaceRenderResult`), `ts/src/app.ts`
  (`createFaceApp`, `FaceApp`), `ts/src/head.ts`, `ts/src/isr.ts`, `ts/src/security.ts` public exports
- **Layer**: core (docs-in-code)
- **Render mode impact**: none
- **Determinism-sensitive**: no
- **Acceptance**: every export that survives item 51's curation carries a doc comment stating semantics
  (mode behavior, when `load` runs, `proxy` meaning, nonce contract); carried from assessment §10, which
  the original enumeration dropped. Parallel to AppTheory program item 101 and TableTheory item 96.
- **Validation**: `cd ts && npm run check`
- **Conventional Commit subject**: `docs(core): JSDoc for the public API surface`
- **Ordering**: unordered-additive — lands any time in the additive train; best just before item 51 so
  the curated surface ships documented.

### 55. Lower the Node floor to 20 LTS with CI-matrix proof

- **Paths**: `ts/package.json` + lockfile (`engines.node` → `>=20`), `.github/workflows/ci.yml` (Node
  matrix: 20 and 24), `README.md` / `docs/getting-started.md` compatibility note, infra package engines
  where declared
- **Layer**: core (packaging) + CI + docs
- **Render mode impact**: none
- **Determinism-sensitive**: no
- **Acceptance**: FaceTheory advertises `engines.node >=20` and the full unit suite plus example builds
  run green on a Node 20 **and** Node 24 CI matrix — the floor is enforced empirically, not asserted
  (mirrors AppTheory item 94's shape; aligns with AppTheory item 94 and TableTheory items 16–17 per the
  2026-07-02 alignment directive; a source scan already shows no Node >20 API usage). The ESM-only
  stance is unchanged and recorded as an explicit, reasoned divergence from TableTheory's CJS support:
  AppTheory's TS package is ESM-only, and FaceTheory's consumers are bundler/Lambda-ESM native —
  TableTheory's CJS breadth is a foundation-layer concern the upper layers deliberately do not mirror.
- **Validation**: CI matrix green on 20 and 24; `cd ts && npm run check` under Node 20 locally
- **Conventional Commit subject**: `feat(platform): support Node 20+`
- **Ordering**: externally gated — lands with or after the pin bumps to the AppTheory and TableTheory
  releases that ship their own Node 20 floors (FaceTheory cannot advertise a floor below what its
  pinned dependencies enforce).

## Handoff

Next skill: `plan-roadmap` — sequence these 55 items into phased milestones (the phase groupings above
are a starting seed; the roadmap owns dependencies, risk ordering, and the v4.0.0 release-train timing).
