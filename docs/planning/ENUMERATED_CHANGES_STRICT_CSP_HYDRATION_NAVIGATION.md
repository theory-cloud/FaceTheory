# Enumerated Changes: Strict CSP Hydration and Navigation

Source scope: `docs/planning/SCOPED_NEED_STRICT_CSP_HYDRATION_NAVIGATION.md`.

Decision locked for this enumeration: deliver strict no-inline CSP as an additive FaceTheory core capability, not a new render mode. The first implementation uses an explicit policy object, evolves hydration into an inline/external discriminated union while preserving the legacy inline shape, starts SSR with consumer-provided same-origin `dataUrl`, derives ISR sidecars from cached HTML pointers when possible, certifies FaceTheory-owned surfaces first, fails closed for uncertifiable streaming, rejects raw Svelte SSR `head` in strict mode, and keeps final CSP header attachment explicit.

### 1. Add strict-CSP policy and hydration type contracts

- **Paths**: `ts/src/types.ts`, `ts/src/index.ts`, `ts/test/unit/head.test.ts` or new focused type/contract tests
- **Layer**: core / public API
- **Render mode impact**: all
- **Determinism-sensitive**: yes — this defines the public hydration boundary and CSP invariant consumed by all render modes and adapters.
- **Acceptance**: FaceTheory exposes adapter-neutral `FaceCspPolicy`/strict-CSP option types and a backward-compatible `FaceHydration` shape that can represent legacy inline hydration and external hydration by URL without changing current output.
- **Validation**: `cd ts && npm run check`; targeted TypeScript tests or compile-only fixtures for legacy and external hydration shapes.
- **Conventional Commit subject**: `feat(csp): add strict policy and hydration contracts`

### 2. Render external hydration references and validate strict head output

- **Paths**: `ts/src/head.ts`, `ts/src/html.ts`, `ts/test/unit/head.test.ts`
- **Layer**: core
- **Render mode impact**: all
- **Determinism-sensitive**: yes — changes deterministic head ordering, hydration data emission, script/style handling, and fail-closed validation.
- **Acceptance**: `renderFaceHead()` preserves the legacy inline hydration path by default, emits external hydration metadata without an inline JSON body when requested, and rejects inline scripts, inline styles, raw head HTML, unsafe inline head attributes, or unsafe/cross-origin bootstrap/data URLs when strict policy disallows them.
- **Validation**: `cd ts && npm run check`; focused head tests for legacy inline compatibility, external hydration tags, strict rejection cases, stable ordering, escaping, and nonce coexistence outside strict mode.
- **Conventional Commit subject**: `feat(head): validate strict csp hydration output`

### 3. Add Vite external hydration helper

- **Paths**: `ts/src/vite.ts`, `ts/test/unit/vite.test.ts`, `ts/src/index.ts`
- **Layer**: core / public API
- **Render mode impact**: ssr / ssg / isr / spa
- **Determinism-sensitive**: yes — Vite helper output couples the server-rendered bootstrap module and client hydration data reference.
- **Acceptance**: A helper such as `externalHydrationForEntry(...)` or equivalent produces a deterministic external hydration object from a Vite manifest entry, data, base path, and same-origin `dataUrl`, without requiring consumers to hand-roll bootstrap/data coupling.
- **Validation**: `cd ts && npm run check`; targeted Vite tests for base path handling, manifest lookup, data URL preservation, and legacy `viteHydrationForEntry()` compatibility.
- **Conventional Commit subject**: `feat(vite): add external hydration helper`

### 4. Load external hydration data in SPA navigation helpers

- **Paths**: `ts/src/spa.ts`, `ts/test/unit/spa.test.ts`
- **Layer**: core browser helpers
- **Render mode impact**: spa / ssr / ssg / isr
- **Determinism-sensitive**: yes — changes client-side hydration data discovery and navigation bootstrap data passed to applications.
- **Acceptance**: SPA helpers can parse a FaceTheory document with no inline `__FACETHEORY_DATA__` body, discover same-origin external hydration metadata, fetch the JSON through an explicit async path, and pass loaded data to `hydrateFaceNavigation(context)` while retaining legacy inline behavior.
- **Validation**: `cd ts && npm run check`; targeted SPA tests for inline legacy snapshots, external hydration success, missing/invalid data fail-closed behavior, same-origin enforcement, and cross-origin rejection before DOM mutation.
- **Conventional Commit subject**: `feat(spa): load external hydration data`

### 5. Enforce strict CSP before FaceApp flushes bytes

- **Paths**: `ts/src/app.ts`, `ts/src/bytes.ts` if needed, `ts/test/unit/app.test.ts`, `ts/test/unit/streaming.test.ts`
- **Layer**: core runtime
- **Render mode impact**: ssr / spa shell / streaming SSR
- **Determinism-sensitive**: yes — validation happens at the server/client boundary before HTML is emitted, including streamed responses.
- **Acceptance**: A Face that returns strict-CSP policy violations fails closed with a deterministic error before response bytes are flushed; streaming configurations that cannot be certified before first byte are rejected or coerced to a documented safe all-ready/buffered path.
- **Validation**: `cd ts && npm run check`; targeted app and streaming tests for strict success, strict violation, preflush failure, and legacy non-strict behavior.
- **Conventional Commit subject**: `feat(app): enforce strict csp before streaming`

### 6. Add strict CSP header builder and optional document validator

- **Paths**: `ts/src/security.ts`, `ts/src/html.ts` if shared parsing/escaping helpers are needed, `ts/test/unit/html.test.ts`, `ts/test/unit/head.test.ts`, `docs/OPERATIONS.md` if minimal API guidance rides with the helper
- **Layer**: core / security
- **Render mode impact**: all
- **Determinism-sensitive**: yes — the validator certifies rendered HTML surfaces that affect hydration and browser execution policy.
- **Acceptance**: FaceTheory exposes a no-inline CSP header builder for canonical tests/docs while keeping header attachment explicit, and provides an optional full-document/body validator or test utility for inline `style=` and event-handler attributes without making it a prerequisite for strict policy adoption.
- **Validation**: `cd ts && npm run check`; security helper tests for header directives, no `unsafe-inline`/`unsafe-eval`, same-origin defaults, and body validator positive/negative fixtures.
- **Conventional Commit subject**: `feat(security): add strict csp helpers`

### 7. Emit strict external hydration sidecars during SSG

- **Paths**: `ts/src/ssg.ts`, `ts/src/ssg-cli.ts`, `ts/test/unit/ssg.test.ts`, `ts/examples/ssg-basic/` if the example is adjusted
- **Layer**: core / SSG
- **Render mode impact**: ssg
- **Determinism-sensitive**: yes — SSG must serialize the exact server render data into deterministic sidecar files and HTML references.
- **Acceptance**: SSG can build strict no-inline HTML plus deterministic hydration JSON sidecars, records sidecar paths in the manifest, avoids leaving inline hydration scripts in strict output, and preserves the current `--emit-hydration-data` compatibility behavior for non-strict builds.
- **Validation**: `cd ts && npm run check`; `cd ts && npm run example:ssg:build`; SSG snapshot tests for deterministic sidecar paths/content and no inline strict output.
- **Conventional Commit subject**: `feat(ssg): emit strict hydration sidecars`

### 8. Cache ISR hydration sidecars with pointer-derived keys

- **Paths**: `ts/src/isr.ts`, `ts/test/unit/isr.test.ts`, `ts/src/aws-s3/index.ts` only if object-store client shape needs metadata coverage
- **Layer**: core / ISR / AWS-S3 integration
- **Render mode impact**: isr
- **Determinism-sensitive**: yes — ISR cache identity and hydration sidecars must preserve the exact data paired with cached HTML.
- **Acceptance**: ISR regeneration writes and serves strict external hydration sidecars using keys derived from the cached HTML pointer when possible, without TableTheory schema changes, and fails closed if the HTML/data pair cannot be kept consistent.
- **Validation**: `cd ts && npm run check`; targeted ISR tests for miss/hit/stale/wait-hit sidecar pairing, stale fallback consistency, failed sidecar write behavior, and no raw data in metadata records.
- **Conventional Commit subject**: `feat(isr): cache strict hydration sidecars`

### 9. Add CSP-safe OAC navigation policies

- **Paths**: `ts/src/oac-form.ts`, `ts/src/spa.ts`, `ts/test/unit/oac-form.test.ts`, `ts/test/unit/spa.test.ts`
- **Layer**: core browser helpers / AWS-first OAC transport
- **Render mode impact**: ssr / spa / ssg forms / isr forms
- **Determinism-sensitive**: no — this runs after user submission/navigation, not during initial server/client hydration, but it must preserve fail-closed CSP semantics.
- **Acceptance**: OAC form transport supports explicit named navigation policies for same-origin full browser navigation and FaceTheory SPA snapshot navigation; strict mode defaults to full navigation and SPA navigation is an external-hydration-aware, same-origin, fail-closed opt-in.
- **Validation**: `cd ts && npm run check`; OAC tests for CSP-protected HTML full navigation, SPA handoff, cross-origin rejection, preserved existing `onNavigate`, and no `document.write()` for CSP-protected responses.
- **Conventional Commit subject**: `feat(oac): add strict csp navigation policies`

### 10. Wire React strict-CSP adapter behavior

- **Paths**: `ts/src/adapters/react.ts`, `ts/src/react/emotion.ts`, `ts/src/react/antd.ts`, `ts/test/unit/react.test.ts`, `ts/test/unit/streaming.test.ts`, `ts/test/unit/emotion.test.ts`, `ts/test/unit/antd.test.ts`
- **Layer**: react adapter
- **Render mode impact**: ssr / spa shell
- **Determinism-sensitive**: yes — React streaming, Suspense, Emotion, and AntD style extraction directly affect head/style output and hydration matching.
- **Acceptance**: React strict-CSP renders fail closed when Emotion/AntD inline style extraction or streaming script behavior would violate the policy, and allow strict routes that rely on external CSS/assets and safe all-ready/buffered rendering.
- **Validation**: `cd ts && npm run check`; React/streaming/Emotion/AntD targeted tests; `cd ts && npm run example:streaming:serve` smoke path if the implementation changes streaming strategy.
- **Conventional Commit subject**: `feat(react): enforce strict csp rendering`

### 11. Wire Vue strict-CSP parity behavior

- **Paths**: `ts/src/vue/index.ts`, `ts/test/unit/vue.test.ts`, `ts/test/unit/vite-ssr-vue-example.test.ts`
- **Layer**: vue adapter
- **Render mode impact**: ssr / spa shell
- **Determinism-sensitive**: yes — adapter-contributed head/style output must respect the same strict policy as core.
- **Acceptance**: Vue adapter output participates in strict-CSP validation, preserves legacy behavior when no strict policy is present, and tests prove external hydration works through the Vue adapter path without inline data.
- **Validation**: `cd ts && npm run check`; `cd ts && npm run example:vite:vue:build`; targeted Vue tests for strict success/failure.
- **Conventional Commit subject**: `feat(vue): support strict csp hydration`

### 12. Wire Svelte strict-CSP parity behavior

- **Paths**: `ts/src/svelte/index.ts`, `ts/test/unit/svelte.test.ts`, `ts/test/unit/vite-ssr-svelte-example.test.ts`, `ts/test/unit/vite-ssr-svelte-library-example.test.ts`
- **Layer**: svelte adapter
- **Render mode impact**: ssr / spa shell
- **Determinism-sensitive**: yes — Svelte SSR `head` and CSS fallback currently feed raw head/style output.
- **Acceptance**: In strict mode, Svelte rejects raw SSR `head` output and CSS fallback that would emit inline styles, requires structured `headTags` and external CSS/assets, and preserves legacy non-strict Svelte behavior.
- **Validation**: `cd ts && npm run check`; `cd ts && npm run example:vite:svelte:build`; `cd ts && npm run example:vite:svelte:library:build`; targeted Svelte strict rejection/success tests.
- **Conventional Commit subject**: `feat(svelte): reject raw strict csp head output`

### 13. Add a strict-CSP Svelte/Vite installed-client example

- **Paths**: `ts/examples/vite-strict-csp-svelte/` or `ts/examples/vite-ssr-svelte/`, `ts/package.json`, `ts/test/unit/vite-strict-csp-svelte-example.test.ts`
- **Layer**: example / test
- **Render mode impact**: ssr / spa
- **Determinism-sensitive**: yes — example verifies no-inline hydration/style output and client hydration data equivalence.
- **Acceptance**: A canonical Simulacrum-shaped Svelte/Vite example renders with external CSS/assets, same-origin module bootstrap, external hydration JSON, no inline scripts/styles, and a browser/test gate that catches strict-CSP regressions.
- **Validation**: `cd ts && npm run check`; new `npm run example:vite:svelte:strict-csp:build` script; targeted example test verifying no inline CSP violations.
- **Conventional Commit subject**: `feat(examples): add strict csp svelte vite app`

### 14. Add strict-CSP browser validation harness

- **Paths**: `ts/test/helpers/`, `ts/test/unit/*strict-csp*.test.ts`, optionally `ts/examples/vite-strict-csp-svelte/`
- **Layer**: tests / example validation
- **Render mode impact**: all through validation coverage
- **Determinism-sensitive**: yes — the harness guards against hydration and CSP policy drift across server/client output.
- **Acceptance**: Tests can assert a rendered document contains no inline scripts/styles, no raw head, no event-handler/style attributes in validated scopes, and can hydrate/navigate with external data under the strict example.
- **Validation**: `cd ts && npm run check`; targeted strict-CSP harness tests; relevant Vite strict example build.
- **Conventional Commit subject**: `test(csp): add strict browser validation harness`

### 15. Document strict-CSP APIs and migration guidance

- **Paths**: `docs/api-reference.md`, `docs/core-patterns.md`, `docs/getting-started.md`, `docs/testing-guide.md`, `docs/troubleshooting.md`, `docs/migration-guide.md`, `README.md` if quickstart needs a pointer
- **Layer**: docs
- **Render mode impact**: all
- **Determinism-sensitive**: no — documentation only, but it documents determinism-sensitive APIs.
- **Acceptance**: Public docs explain nonce-compatible CSP versus strict no-inline CSP, external hydration usage, SPA navigation behavior, Svelte strict head requirements, React streaming limits, body validator responsibility, and migration from legacy inline hydration.
- **Validation**: `cd ts && npm run check`; docs review against scoped need; do not hand-edit `x-release-please-version` markers.
- **Conventional Commit subject**: `docs(csp): document strict hydration mode`

### 16. Document AWS deployment and release validation for strict CSP

- **Paths**: `docs/AWS_DEPLOYMENT_SHAPE.md`, `docs/OPERATIONS.md`, `docs/cdk/aws-deployment.md`, `docs/cdk/operations.md`, `docs/UPSTREAM_RELEASE_PINS.md` only if dependency freshness is relevant, `docs/planning/ROADMAP_STRICT_CSP_HYDRATION_NAVIGATION.md`
- **Layer**: docs / AWS deployment guidance
- **Render mode impact**: ssr / ssg / isr / spa
- **Determinism-sensitive**: no — documentation only, but it defines deployment validation for deterministic strict-CSP output.
- **Acceptance**: AWS docs cover S3/CloudFront routing for SSG hydration sidecars, ISR sidecar object expectations, explicit CSP header attachment, OAC navigation policy choice, RC validation by Simulacrum, and stable release promotion criteria.
- **Validation**: `cd ts && npm run check`; deployment docs review against AWS-first posture and release-flow rules.
- **Conventional Commit subject**: `docs(aws): document strict csp deployment`

## Cross-cutting notes

- No release manifests, version markers, generated changelogs, tags, or release assets are part of this feature enumeration.
- No npm publication, non-AWS deployment abstraction, fifth render mode, fourth adapter, or TableTheory schema change is enumerated.
- If item 8 proves that pointer-derived ISR sidecars cannot preserve consistency, stop and coordinate with the TableTheory steward before expanding ISR metadata.
- Simulacrum remains the primary RC validator and will continue its app-local workaround until this project ships.

## Self-check

- [x] Core primitives are ordered before adapter implementations that depend on them.
- [x] Every determinism-sensitive item is flagged.
- [x] React, Vue, and Svelte strict-CSP parity are all enumerated.
- [x] Examples are enumerated for the new capability.
- [x] Docs are enumerated for user-visible behavior and deployment shape.
- [x] No item requires release manifest edits or hand-created releases.
- [x] The full list satisfies the scoped need's success criteria without adding a render mode, adapter, or non-AWS platform.
