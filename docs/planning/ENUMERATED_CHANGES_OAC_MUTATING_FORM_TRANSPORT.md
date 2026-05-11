# Enumerated Changes: OAC Mutating Form Transport

Source scope: `docs/planning/SCOPED_NEED_OAC_MUTATING_FORM_TRANSPORT.md`.

Decision locked for this enumeration: keep AppTheorySsrSite `AWS_IAM` + Lambda Function URL OAC as the durable deployment posture. FaceTheory will add an adapter-neutral, opt-in browser helper for same-origin URL-encoded mutating forms. The first pass does not support browser-generated multipart bodies, does not call direct Function URLs, and does not weaken CloudFront/OAC.

### 1. Add OAC URL-encoded payload hashing primitives

- **Paths**: `ts/src/oac-form.ts`, `ts/src/index.ts`, `ts/test/unit/oac-form.test.ts`, `ts/test/run-unit.ts`
- **Layer**: core / public API / tests
- **Render mode impact**: ssr / spa / ssg forms that submit to SSR action routes; no render-mode semantics change.
- **Determinism-sensitive**: no — this adds submit-time payload construction and hashing utilities, not server/client render output, head emission, or hydration behavior.
- **Acceptance**: FaceTheory can build deterministic `application/x-www-form-urlencoded` request bytes from successful form controls, include the submitter value in DOM order semantics, reject non-string `FormData` entries such as files, compute the lowercase hex SHA256 digest over exactly those bytes, and expose the necessary types/helpers without adding dependencies.
- **Validation**: `cd ts && npx tsx test/unit/oac-form.test.ts`; `cd ts && npm run typecheck`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(oac): add URL-encoded form payload hashing`

Implementation notes:

- Prefer Web Crypto (`crypto.subtle.digest`) in the browser and a test-injectable digest path rather than a new runtime dependency.
- Hash the exact `Uint8Array` body passed to `fetch`.
- Keep multipart/file handling fail-closed: file entries must not stringify to `[object File]` or be silently omitted.
- Avoid importing React/Vue/Svelte from the core helper.

### 2. Add opt-in same-origin OAC form submit controller

- **Paths**: `ts/src/oac-form.ts`, `ts/src/index.ts`, `ts/test/unit/oac-form.test.ts`, `docs/api-reference.md`, `docs/core-patterns.md`
- **Layer**: core / public API / tests / docs
- **Render mode impact**: ssr / spa / ssg forms that submit to SSR action routes; no ISR cache behavior change.
- **Determinism-sensitive**: no — the controller runs only in response to a user submit event and does not mutate server-rendered markup during hydration. It must document any post-submit document replacement policy.
- **Acceptance**: `startAwsOacFormTransport` (or the chosen final name) intercepts only explicitly marked same-origin forms, resolves form/submitter action and method, sends URL-encoded bodies through `fetch` with `credentials: "same-origin"`, `content-type`, and `x-amz-content-sha256`, rejects cross-origin actions before sending, and returns a stoppable controller.
- **Validation**: `cd ts && npx tsx test/unit/oac-form.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(oac): add same-origin mutating form transport`

Implementation notes:

- Require an explicit opt-in marker such as `data-facetheory-oac-form`; do not globally intercept every form.
- Support native POST first and allow only explicitly configured non-native mutating methods (`PUT`, `PATCH`, `DELETE`) if the helper owns the actual fetch method and body bytes.
- Preserve constraint validation unless the form declares `novalidate` or the submitter declares `formnovalidate`.
- Ignore or fail clearly for GET/dialog/non-mutating forms so native browser behavior remains available.
- Provide an `onError` hook and a deterministic default error path that does not hide failures.

### 3. Implement documented redirect and HTML response navigation policy

- **Paths**: `ts/src/oac-form.ts`, `ts/test/unit/oac-form.test.ts`, `docs/api-reference.md`, `docs/core-patterns.md`, `docs/troubleshooting.md`
- **Layer**: core / tests / docs
- **Render mode impact**: ssr / spa
- **Determinism-sensitive**: no — the policy applies after a user mutation completes; it must avoid partial DOM patching that would create a second rendering contract.
- **Acceptance**: Successful mutating submissions handle same-origin redirects by navigating the browser to the final URL, handle non-redirect HTML validation/error responses by replacing the document through a documented full-document path, reject cross-origin redirect targets, and expose a customization hook for hosts that need to coordinate with `startFaceNavigation`.
- **Validation**: `cd ts && npx tsx test/unit/oac-form.test.ts`; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(oac): preserve form navigation outcomes`

Implementation notes:

- Prefer full-document behavior over arbitrary partial DOM patching; FaceTheory must not create an untested second client-router contract.
- Keep same-origin checks for both the original action URL and any final response URL.
- Document that server-rendered validation pages are still normal FaceTheory HTML responses and should remain deterministic.

### 4. Add an SSR reference form snippet or example

- **Paths**: `ts/examples/oac-mutating-form-transport/` or a documented reference snippet in `docs/getting-started.md`, `ts/package.json` if a runnable example script is added, `ts/test/unit/oac-form-example.test.ts` if a runnable example is added, `ts/test/run-unit.ts` if a test is added
- **Layer**: example / docs / tests
- **Render mode impact**: ssr
- **Determinism-sensitive**: no — the example demonstrates a stable SSR form and submit-time transport helper; it should not compute render-time randomness or mutate head/style output.
- **Acceptance**: Consumers can copy a minimal SSR control-plane form that marks the form for OAC transport, installs the helper from a client bootstrap module, posts to a same-origin Lambda/SSR action path, and receives either a redirect or a server-rendered validation page without theory-mcp-server-specific business logic.
- **Validation**: if runnable, `cd ts && npm run example:oac-form:serve` smoke locally or an equivalent targeted example test; `cd ts && npm run check`
- **Conventional Commit subject**: `feat(examples): add OAC mutating form reference`

Implementation notes:

- A docs reference snippet is acceptable if a full runnable example would duplicate existing SSR example machinery.
- If a runnable example is added, keep it local-only and deterministic; do not require AWS credentials or a live CloudFront distribution.
- The example should clearly show that app authentication, CSRF protection, idempotency, and business validation are separate application responsibilities.

### 5. Document the AppTheorySsrSite OAC mutating-form contract

- **Paths**: `docs/AWS_DEPLOYMENT_SHAPE.md`, `docs/cdk/aws-deployment.md`, `docs/getting-started.md`, `docs/api-reference.md`, `docs/core-patterns.md`, `docs/troubleshooting.md`, `infra/apptheory-ssr-site/README.md`, `infra/apptheory-ssg-isr-site/README.md`, `README.md`
- **Layer**: docs / infrastructure reference documentation
- **Render mode impact**: ssr / ssg / isr / spa where pages contain forms or action routes; no runtime semantics change.
- **Determinism-sensitive**: no — documentation only.
- **Acceptance**: Documentation explains why native POST/PUT form submissions fail behind Lambda Function URL OAC without `x-amz-content-sha256`, how to opt into the FaceTheory helper, how to route mutating same-origin paths through AppTheorySsrSite `ssrPathPatterns`, why the hash is AWS signing plumbing rather than app authentication, why multipart is excluded in the first pass, and why `ssrUrlAuthType: NONE` is only an explicitly authorized temporary rollback with a removal plan.
- **Validation**: `cd ts && npm run check`; documentation review against the scoped need and AWS OAC contract; do not hand-edit `x-release-please-version` markers.
- **Conventional Commit subject**: `docs(aws): document OAC mutating form transport`

### 6. Add release-facing troubleshooting and consumer handoff notes

- **Paths**: `docs/troubleshooting.md`, `docs/migration-guide.md`, `docs/testing-guide.md`, optionally `docs/planning/ROADMAP_OAC_MUTATING_FORM_TRANSPORT.md` if roadmap sequencing calls for a release milestone
- **Layer**: docs / release guidance
- **Render mode impact**: ssr / spa / ssg forms that submit to SSR action routes.
- **Determinism-sensitive**: no — documentation only.
- **Acceptance**: Consumers seeing CloudFront/Lambda `InvalidSignatureException` on mutating form submissions can identify the missing payload hash symptom, verify whether the request reached Lambda, adopt the helper, keep OAC enabled, and coordinate review with theory-mcp-server before release.
- **Validation**: `cd ts && npm run check`; documentation review for clear temporary-rollback language and GitHub Releases installation wording.
- **Conventional Commit subject**: `docs(oac): add mutating form troubleshooting guidance`

## Surface walk notes

- **Core abstractions**: new browser helper belongs in core (`ts/src/oac-form.ts`) beside SPA/browser helpers, with root export from `ts/src/index.ts`.
- **React / Vue / Svelte adapters**: no adapter-specific implementation is expected. Adapter examples may consume the same helper from client bootstraps, but the core must not import adapter code.
- **Adapter index**: no change expected.
- **AppTheory glue**: no code change expected. The route/deployment contract remains AppTheorySsrSite + CloudFront + Lambda Function URL OAC; docs must cover `ssrPathPatterns` for mutating routes.
- **AWS-S3 integration**: no change expected.
- **Stitch primitives**: no change expected. Stitch admin forms can opt into the helper through normal HTML attributes or consumer bootstraps without changing layout primitives.
- **Examples**: at least a reference snippet is required; a runnable local example is useful but must not require AWS credentials.
- **Tests**: add focused unit tests for payload bytes, hash header, same-origin rejection, credentials, unsupported multipart, submitter inclusion, and navigation policy.
- **Dependencies**: no `ts/package.json` dependency changes expected unless implementation discovers a browser-crypto compatibility gap; prefer no new dependency.
- **Release infrastructure**: do not touch release-please manifests or version markers during feature implementation.

## Self-check

- [x] Core primitives are ordered before controller behavior and examples that depend on them.
- [x] Type declarations/exports ride with the implementation commits that expose them.
- [x] No adapter-specific implementation is needed for this adapter-agnostic browser helper.
- [x] Determinism-sensitive flags are set; the work does not alter SSR output, head/style emission, or the initial hydration boundary.
- [x] Examples/docs are included for the consumer-visible AWS/OAC contract.
- [x] No release manifests, version markers, TableTheory models, ISR cache stores, direct Function URL calls, or AppTheory OAC weakening are enumerated.
- [x] The full list satisfies the scoped need without adding a fifth render mode, fourth adapter, or non-AWS deployment abstraction.
