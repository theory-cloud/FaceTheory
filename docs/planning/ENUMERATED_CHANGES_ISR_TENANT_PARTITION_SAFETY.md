# Enumerated Changes: ISR Tenant Partition Safety

Input scope: `docs/planning/SCOPED_NEED_ISR_TENANT_PARTITION_SAFETY.md`

Decision locked for this enumeration: **fail closed by default**. If a request carries a known tenant boundary signal and the ISR runtime has no explicit tenant/cache partition configured, FaceTheory must refuse to serve/cache the ISR response rather than silently using the shared `default` tenant.

### 1. Fail closed on unpartitioned ISR tenant boundary signals

- **Paths**: `ts/src/isr.ts`, `ts/test/unit/isr.test.ts`, `docs/api-reference.md`, `docs/getting-started.md`, `docs/OPERATIONS.md`, `docs/AWS_DEPLOYMENT_SHAPE.md`
- **Layer**: core / tests / docs
- **Render mode impact**: isr
- **Determinism-sensitive**: no — this changes deterministic ISR cache identity and failure behavior, not server/client DOM or hydration equivalence.
- **Acceptance**: ISR requests containing known tenant boundary headers, initially `x-tenant-id` and `x-facetheory-tenant`, fail closed before cache lookup/write when neither `tenantKey` nor a custom `cacheKey` is explicitly configured; tenant-invariant ISR without those headers still works; explicit `tenantKey` and explicit `cacheKey` paths continue to work; thrown/configuration errors do not include raw tenant/header secret values.
- **Validation**: `make rubric`; targeted ISR validation such as `cd ts && npx tsx --test test/unit/isr.test.ts`; verify docs mention the breaking fail-closed default and the explicit `tenantKey` / `cacheKey` escape path.
- **Conventional Commit subject**: `fix(isr)!: fail closed on unpartitioned tenant headers`

Commit body must include a `BREAKING CHANGE:` footer because tenant-like headers that previously collapsed into the implicit `default` ISR tenant now fail closed unless the app configures an explicit tenant/cache partition.

Implementation notes for this change:

- Track whether `tenantKey` and/or `cacheKey` were explicitly supplied before defaults are applied.
- Add an internal default tenant-boundary header list for `x-tenant-id` and `x-facetheory-tenant`.
- Consider a public additive option such as `additionalTenantBoundaryHeaders?: string[]` if custom tenant headers need fail-closed detection without weakening the default list. If added, it must only extend the default detection set, not disable it.
- Raise a typed or clearly named ISR partition error before metadata store access, lease acquisition, or HTML object writes.
- Keep the failure deterministic through the existing `FaceApp` 500 path unless implementation discovers a better existing response primitive.
- Add regression tests for:
  - the reproduced leak: tenant A warms, tenant B follows, and tenant B does **not** receive tenant A HTML when no partition is configured;
  - no metadata/cache entry is written on the fail-closed path;
  - `tenantKeyFromTrustedHeader('x-tenant-id')` still partitions tenant A and tenant B correctly;
  - custom `cacheKey` remains accepted as an explicit partition contract;
  - raw tenant/header values are absent from cache keys and error text.

### 2. Make ISR examples explicitly tenant-invariant or explicitly partitioned

- **Paths**: `ts/examples/isr-blocking/handler.ts`, `docs/core-patterns.md`, `infra/apptheory-ssg-isr-site/README.md`
- **Layer**: examples / docs / infrastructure reference documentation
- **Render mode impact**: isr
- **Determinism-sensitive**: no — this clarifies example contracts and reference-stack usage; it does not affect hydration or rendered DOM structure.
- **Acceptance**: The blocking ISR example states that it is tenant-invariant; any tenant-varying example or snippet uses `tenantKeyFromTrustedHeader()` or an explicit custom `cacheKey`; the AppTheory SSG+ISR reference documentation makes clear that viewer-supplied tenant headers are stripped by default and that trusted tenant-derived ISR needs explicit FaceTheory partitioning.
- **Validation**: `make rubric`; inspect the example and reference README to confirm no sample encourages tenant-specific ISR under the implicit `default` tenant.
- **Conventional Commit subject**: `docs(isr): mark ISR examples with tenant partition intent`

### 3. Add release-facing migration guidance for the breaking ISR default

- **Paths**: `docs/migration-guide.md`, `docs/troubleshooting.md`, `README.md`
- **Layer**: docs
- **Render mode impact**: isr
- **Determinism-sensitive**: no — documentation-only guidance for an ISR cache-safety change.
- **Acceptance**: Consumers upgrading from v1.2.1 can identify why an ISR route now returns deterministic 500s when tenant headers are present, choose between SSR and explicit ISR partitioning, and verify the fix with `x-facetheory-isr` headers without being told to trust viewer-supplied tenant headers.
- **Validation**: `make rubric`; documentation review for consistency with GitHub Release installation wording and without hand-editing `x-release-please-version` markers.
- **Conventional Commit subject**: `docs(isr): add tenant fail-closed migration guidance`

## Surface walk notes

- **React / Vue / Svelte adapters**: no adapter-specific changes expected; the shared ISR runtime sits below all adapters.
- **Adapter index**: no change expected.
- **AppTheory glue**: no FaceTheory code change expected unless implementation discovers that Lambda/AppTheory request normalization drops headers needed by the guard. Reference-stack docs are covered above.
- **AWS-S3 integration**: no change expected; the guard should run before HTML object writes.
- **Stitch primitives**: no change expected.
- **Top-level exports**: only change if a public option or error type is intentionally exported from `isr.ts` / package root.
- **Dependencies**: no `ts/package.json` dependency changes expected.
- **Release manifests and version markers**: do not touch during implementation; release-please owns them.

## Self-check

- [x] Core ISR behavior is first.
- [x] No adapter implementation is needed for this shared core behavior.
- [x] Examples and docs are enumerated where the consumer-visible default changes.
- [x] Determinism-sensitive flags are set.
- [x] No item requires a future item to compile or pass checks.
- [x] Release manifests and version markers are not enumerated as feature commits.
