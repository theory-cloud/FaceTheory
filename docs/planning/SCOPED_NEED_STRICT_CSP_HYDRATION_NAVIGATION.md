# Scoped Need: Strict CSP Hydration and Navigation

## Background

Issue #181 reports a framework-feedback signal from `equaltoai/simulacrum` at commit `95b94f6dbbf45e4803f5233e18a1826319f0e579`. Simulacrum is a Svelte 5 + FaceTheory installed-client frontend deployed under Lesser at `/l/*` with a deliberately strict browser policy: no inline scripts, no inline styles, no `unsafe-eval`, and no third-party script origins. FaceTheory v3.1.2 already provides hydration, SPA navigation, deterministic head rendering, style collection, and OAC form helpers, but the current canonical paths assume nonce-compatible inline payloads are acceptable. Simulacrum is therefore recomputing client props from the browser URL and avoiding FaceTheory hydration data instead of weakening its CSP.

## Driver

Simulacrum is the immediate driver, with reuse expected by security-sensitive installed-client and component-heavy FaceTheory applications, including future Theory Cloud UIs that need a browser-validation-contract gate. This is a high-priority framework capability because strict CSP is not an app-local preference once FaceTheory owns the hydration envelope, head/style emission, SPA navigation, and OAC navigation helper surfaces.

## Problem

FaceTheory's current CSP support is nonce-oriented, not no-inline. In v3.1.2:

- `renderFaceHead()` emits an inline JSON hydration script whenever `FaceRenderResult.hydration` is present:
  - `<script id="__FACETHEORY_DATA__" type="application/json">...</script>`
  - the body is produced with `safeJson(out.hydration.data)`.
- `readFaceHydrationData()` and SPA navigation snapshots expect that inline script.
- `readHydrationBootstrapModule()` only finds the bootstrap module by walking after the inline hydration data script.
- `styleTags` render as inline `<style>` tags.
- React Emotion / AntD style extraction and Svelte SSR CSS fallback feed `styleTags`.
- Svelte SSR `rendered.head` currently becomes raw head HTML.
- `headTags: [{ type: "raw", html }]` remains a necessary escape hatch but is easy to misuse under strict CSP.
- SSG `emitHydrationData` can copy the inline hydration JSON to sidecar files, but it does not remove the inline data script or make the sidecar the canonical hydration path.
- OAC form transport correctly fails closed for fetched HTML protected by CSP because `document.write()` cannot install response CSP headers, but strict-CSP consumers still need a reusable CSP-safe navigation strategy.

The result is a framework consumption gap: a consumer that wants the invariant "this rendered Face is no-inline-CSP safe" cannot express that invariant through FaceTheory. They must either relax CSP, recompute hydration data outside FaceTheory, or build app-local navigation glue.

## Render modes affected

All FaceTheory delivery modes are in scope:

- **SSR:** per-request HTML must be able to reference hydration data without inline scripts. Strict validation must happen before bytes are flushed, especially for streaming responses where errors cannot be rewound after the first chunk.
- **SSG:** build output must support sidecar hydration JSON as the canonical hydration data source while producing HTML with no inline hydration/style payloads.
- **Blocking ISR:** regenerated cached HTML must support deterministic external hydration references. Per-request nonces are not a durable answer for cached ISR HTML, so no-inline delivery is especially valuable here.
- **SPA:** the deterministic shell and SPA navigation helpers must be able to discover, fetch, and apply external hydration data without depending on `__FACETHEORY_DATA__`.

This fits within the existing render-mode shape. It is not a fifth render mode.

## Adapters affected

All three first-class adapters are affected, with the core owning the shared contract:

- **Core:** hydration envelope, head rendering, strict-CSP validation, SPA navigation, SSG sidecar behavior, security/CSP helpers, and OAC navigation integration.
- **React:** strict mode must account for Emotion/AntD inline style extraction and React 18 streaming behavior. React streaming can emit inline instruction scripts for some Suspense streaming paths, so strict no-inline mode must either choose an all-ready/buffered-compatible strategy or fail closed when a React streaming configuration would emit inline scripts.
- **Vue:** core hydration and head/style validation must apply without Vue-specific semantics leaking into core.
- **Svelte:** strict mode must address Svelte SSR CSS fallback and Svelte `rendered.head`. For the first trusted strict-CSP implementation, raw Svelte head output is rejected and consumers must return structured `headTags`; a conservative parser can be considered later as a migration diagnostic.

## Shape impact

Additive core capability inside the existing four-mode, three-adapter shape. The likely product shape is a strict CSP policy on the render result/app plus external hydration primitives:

- a no-inline hydration representation that can reference external JSON instead of embedding script body text;
- Vite helpers for external hydration references;
- SPA helpers that can asynchronously load inline or external hydration data;
- strict render validation that rejects FaceTheory-owned inline scripts, inline styles, raw head, unsafe head attributes, unsafe module origins, and adapter-produced inline style/head output according to the selected policy;
- SSG/ISR support for deterministic sidecar hydration objects;
- OAC/navigation behavior that never installs CSP-protected fetched HTML via `document.write()`.

This does not add a new render mode, a new adapter, a non-AWS deployment target, or a generic platform abstraction.

## Determinism impact

Preserves determinism and strengthens the boundary contract if implemented as a first-class render policy. The strict-CSP path must preserve the server/client data equivalence that the inline hydration script currently provides:

- External hydration JSON must contain exactly the data the server render used, safely serialized with the same XSS protections as `safeJson`.
- The client helper must load that data before hydration/navigation code observes props.
- SSG and ISR sidecar paths must be deterministic for a given route/cache key and must not depend on browser-local recomputation.
- React, Vue, and Svelte adapters must see the same framework-agnostic policy and fail closed on violations rather than silently dropping required data or styles.
- Streaming SSR must not discover strict-CSP violations after the response has started. If a strict validation mode cannot certify a streamed body path, it must choose a safe all-ready/buffered strategy or refuse the configuration.

There is one important limit: FaceTheory can fully validate FaceTheory-owned surfaces (`headTags`, `styleTags`, hydration metadata, adapter style integrations, SSG/ISR sidecars, SPA navigation snapshots). Certifying arbitrary consumer HTML bodies as no-inline safe may require a document/body validator. A complete implementation should provide that validator for buffered HTML and generated/cached documents, and should either provide a streaming scanner for streamed bodies or clearly fail closed for "certified strict" streaming configurations that cannot be validated before flush.

## AWS-first posture

Preserves the AWS-first posture. External hydration data should be modeled around the existing AWS delivery shape:

- SSG sidecar JSON served from S3 + CloudFront.
- ISR sidecar JSON stored alongside cached HTML through the existing HTML object store path where possible, with TableTheory remaining the ISR metadata/lease authority.
- SSR strict external hydration either references an app-provided same-origin data URL or uses an explicit AWS-shaped FaceTheory hydration data store/route. It must not invent a Vercel/Cloudflare/Netlify abstraction.
- OAC navigation remains CloudFront/AppTheory/Lambda Function URL OAC aware and must not bypass the same-origin CloudFront path.

No TableTheory schema change is assumed for the first complete design. If implementation needs a new ISR metadata field for hydration sidecar pointers, that becomes a TableTheory coordination point before implementation proceeds.

## Success criteria

- A Face can opt into a strict no-inline CSP render policy that fails closed when FaceTheory would emit inline hydration scripts, inline styles, raw head HTML, unsafe inline event/style attributes in head tags, or unsafe/cross-origin bootstrap scripts under the selected origin policy.
- The policy is adapter-neutral and visible to React, Vue, and Svelte adapter paths without putting framework-specific logic in core.
- FaceTheory exposes an external hydration primitive that references a same-origin hydration JSON URL instead of emitting `__FACETHEORY_DATA__` body text.
- `viteHydrationForEntry()` or a sibling helper can produce external hydration metadata from a Vite manifest without requiring consumers to hand-roll the bootstrap/data relationship.
- Browser helpers can load hydration data from either the legacy inline script or the new external reference; strict mode uses only the external path.
- SPA navigation can parse a FaceTheory document that has no inline hydration script, discover the bootstrap module and hydration data URL, fetch the JSON, and pass the loaded data to `hydrateFaceNavigation(context)`.
- SSG can emit no-inline HTML plus deterministic hydration JSON sidecar files, and the generated manifest records enough information for deployment and verification.
- ISR can cache/regenerate no-inline HTML and any corresponding hydration sidecar without per-request CSP nonces baked into cached output.
- SSR can support strict external hydration through a documented same-origin data URL strategy and fails closed when a Face returns hydration data without a valid inline-free delivery path.
- React strict mode prevents React/Emotion/AntD inline style/script output from violating the policy. Where React streaming would need inline Suspense instruction scripts, FaceTheory uses a safe strategy or rejects that configuration before bytes flush.
- Svelte strict mode prevents Svelte SSR CSS fallback and raw head output from silently violating the policy. The first implementation rejects raw Svelte SSR `head` output and requires structured `headTags`; a conservative parser for safe raw head subsets is deferred.
- OAC form transport has a CSP-safe navigation handoff: CSP-protected HTML is not installed with `document.write()`, and consumers can delegate successful responses to FaceTheory SPA navigation or a same-origin full navigation without weakening OAC.
- `security.ts` grows from nonce generation only into strict-CSP-aware helpers or policy validation docs, including a no-inline header shape that excludes `unsafe-inline`, `unsafe-eval`, and third-party script origins by default.
- Tests cover core head validation, external hydration serialization/discovery, SPA navigation with external data, SSG sidecar output, ISR sidecar caching, OAC CSP-safe navigation handoff, and representative React/Vue/Svelte strict-mode renders.
- Documentation explains nonce-compatible CSP vs strict no-inline CSP, why cached SSG/ISR should prefer no-inline over per-request nonces, how to migrate from inline hydration, and what remains the consumer's responsibility inside component body markup.
- At least one strict-CSP example demonstrates a Svelte/Vite installed-client shape similar to Simulacrum: external CSS/assets from Vite, external hydration data, same-origin module bootstrap, no inline scripts/styles, and passing browser validation under the documented CSP.

## Nearest existing surface

- `ts/src/head.ts`
  - `renderFaceHead()`
  - `normalizeHeadTags()`
  - `renderHeadTag()`
  - current nonce application and hydration script emission
- `ts/src/types.ts`
  - `FaceRenderResult.hydration`
  - `FaceHydration`
  - `FaceHeadTag`
  - `FaceStyleTag`
- `ts/src/spa.ts`
  - `readFaceHydrationData()`
  - `snapshotFaceDocument()`
  - `parseFaceNavigationSnapshot()`
  - `fetchFaceNavigationSnapshot()`
  - `applyFaceNavigationSnapshot()`
  - `loadFaceNavigationModule()`
  - `startFaceNavigation()`
- `ts/src/vite.ts`
  - `viteAssetsForEntry()`
  - `viteHydrationForEntry()`
- `ts/src/ssg.ts`
  - `emitHydrationData`
  - `extractHydrationDataJson()`
  - SSG manifest/page output
- `ts/src/isr.ts`
  - `HtmlStore`
  - `S3HtmlStore`
  - cached HTML pointer generation
  - TableTheory-backed metadata/lease integration
- `ts/src/oac-form.ts`
  - CSP-protected document replacement fail-closed behavior
  - `onNavigate` handoff
- Adapter/integration paths:
  - `ts/src/adapters/react.ts`
  - `ts/src/react/emotion.ts`
  - `ts/src/react/antd.ts`
  - `ts/src/vue/index.ts`
  - `ts/src/svelte/index.ts`
- Existing examples that currently demonstrate the non-strict path:
  - `ts/examples/vite-ssr-react`
  - `ts/examples/vite-ssr-vue`
  - `ts/examples/vite-ssr-svelte`
  - `ts/examples/vite-ssr-svelte-library`

## Out of scope

- Adding a fifth render mode.
- Adding a fourth adapter.
- Porting FaceTheory to Vercel, Cloudflare Workers, Netlify, or another non-AWS deployment target.
- Publishing to npm or changing the GitHub Release distribution model.
- Removing the existing nonce-compatible inline hydration path for consumers that do not opt into strict mode.
- Hiding hydration mismatches or weakening deterministic hydration requirements.
- Moving ISR cache metadata or regeneration leases out of TableTheory.
- Hand-rolling a generic cross-cloud object/cache abstraction for hydration data.
- Guaranteeing that arbitrary consumer component bodies contain no inline styles/events unless the consumer enables the explicit body/document validator.
- Supporting third-party script origins by default in strict mode.
- Treating strict CSP as an app-only convention with no framework validation.

## Resolved scope decisions

Simulacrum confirmed the following decisions for the first complete strict-CSP implementation:

- Use an explicit policy object rather than only `strictCsp: true`, for example:

  ```ts
  csp: {
    inlineScripts: false,
    inlineStyles: false,
    rawHead: false,
  }
  ```

  A named preset can be added later, but the primary API should read like an auditable invariant.
- Evolve `FaceHydration` into an inline/external discriminated union while preserving the legacy inline shape for compatibility.
- Add a helper such as `externalHydrationForEntry(...)` so Vite asset/bootstrap coupling is not hand-rolled by consumers.
- For personalized SSR, start with a consumer-provided same-origin `dataUrl`. A first-class AWS-shaped FaceTheory hydration data store/route is not a prerequisite for the first strict-CSP milestone.
- For ISR, derive a hydration sidecar key from the cached HTML pointer if possible. Avoid a TableTheory metadata/schema change unless implementation proves pointer-derived sidecars are insufficient.
- Certify FaceTheory-owned surfaces first: structured `headTags`, `styleTags`, hydration emission, adapter style/head output, and raw-head escape hatches.
- Full rendered-body validation for inline `style=` and event-handler attributes is valuable, but it can be optional/test utility coverage rather than blocking the first strict-CSP API.
- Fail closed on streaming configurations that cannot be certified before first byte, even when strict routes must use an all-ready or buffered strategy.
- Reject raw Svelte SSR `head` output in strict mode for the first implementation. Require structured `headTags`; consider conservative parsing later.
- Provide a strict no-inline CSP header builder, but keep final header attachment explicit so app/CDN infrastructure remains responsible for deployed response headers.
- Support both same-origin full browser navigation and FaceTheory SPA snapshot navigation with explicit named policies. For strict mode, default to same-origin full browser navigation; make SPA snapshot navigation an explicit same-origin, external-hydration-aware, fail-closed opt-in.

## Open questions

- What exact names should the public policy object, hydration discriminant, helper, and navigation policies use?
- Should the optional full-document/body validator land in the first project as a test utility, a public validator, or a later follow-up?
- Which strict-CSP example should be canonical for release validation: a new Simulacrum-shaped Svelte/Vite installed-client example, or an extension of the existing Svelte Vite example?
- Does any downstream consumer besides Simulacrum need FaceTheory-owned SSR hydration data storage in the first release, or can that remain deferred until a concrete AWS-side storage need appears?
