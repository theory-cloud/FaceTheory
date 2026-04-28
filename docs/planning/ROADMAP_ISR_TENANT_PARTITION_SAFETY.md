# Roadmap: ISR Tenant Partition Safety

## Goal

Deliver a fail-closed ISR tenant-partition guard so FaceTheory cannot silently share tenant-varying cached HTML through the implicit `default` tenant. The roadmap keeps the change inside the existing ISR mode and core runtime, documents the pre-1.0 breaking default, and updates examples so consumers can distinguish tenant-invariant ISR from explicitly partitioned tenant-varying ISR.

## Render modes and adapters affected

| Surface | Impact |
| --- | --- |
| SSR | No behavior change; remains the safe fallback for request-authorized or tenant-varying HTML that should not be cached. |
| SSG | No behavior change. |
| ISR | Primary behavior change: known tenant boundary signals fail closed unless the app configures an explicit `tenantKey` or custom `cacheKey`. |
| SPA | No behavior change. |
| React | No adapter-specific change expected. |
| Vue | No adapter-specific change expected. |
| Svelte | No adapter-specific change expected. |

## Determinism impact

Preserves determinism. The core change affects cache-key safety and deterministic error behavior before ISR cache lookup/write. It does not alter framework rendering, head/style emission, hydration scripts, or adapter output.

## Phases

### Phase 1: Core fail-closed ISR guard

**Milestone candidates:**

- **isr-tenant-fail-closed-core** — Add the core guard, regression tests, and in-place API docs so unpartitioned tenant-like ISR requests fail before cache interaction.
  - Items: 1
  - Dependencies: none
  - Determinism-sensitive: no
  - Risks:
    - Breaking behavior may surface in consumers that currently send tenant-like headers on tenant-invariant ISR routes.
    - A guard based only on header presence can produce false positives if infrastructure forwards tenant-like headers even when a route does not vary by tenant.
    - A custom `cacheKey` may not actually include tenant variance, but FaceTheory cannot prove that; the custom function is treated as an explicit consumer-owned partition contract.
    - Error text must avoid raw tenant/header values to prevent secret leakage.

### Phase 2: Examples and reference-stack intent

**Milestone candidates:**

- **isr-tenant-example-intent** — Mark the ISR example and reference-stack guidance with tenant-invariant versus explicitly partitioned tenant-varying intent.
  - Items: 2
  - Dependencies: Phase 1 should land first so examples describe the actual fail-closed behavior.
  - Determinism-sensitive: no
  - Risks:
    - Example wording that is too narrow may lead consumers to treat `tenantKeyFromTrustedHeader()` as safe for viewer-supplied headers. Mitigation: keep trust-boundary language explicit.
    - Reference docs must stay aligned with AppTheory’s tenant-header stripping defaults.

### Phase 3: Migration and release guidance

**Milestone candidates:**

- **isr-tenant-migration-guidance** — Add upgrade, troubleshooting, and README guidance for the breaking fail-closed default before release promotion.
  - Items: 3
  - Dependencies: Phase 1 behavior and Phase 2 example wording should be settled first.
  - Determinism-sensitive: no
  - Risks:
    - Consumers may misread deterministic 500s as an outage instead of a cache-safety refusal. Mitigation: troubleshooting guide should name symptoms and remediation steps clearly.
    - README must not hand-edit release-please version markers.

## Release rollout plan

1. Land implementation commits on a feature branch based on `staging`; merge by PR into `staging`.
2. Before the staging PR is opened or updated, verify staging version alignment for both stable and RC manifests with `scripts/verify-version-alignment.sh`.
3. Merge `staging` to `premain` to produce a prerelease candidate.
4. RC soak should explicitly validate:
   - tenant-invariant ISR routes without tenant-like headers still return `x-facetheory-isr` states normally;
   - tenant-like headers without explicit partitioning return the deterministic fail-closed response and do not write ISR metadata/object entries;
   - `tenantKeyFromTrustedHeader('x-tenant-id')` partitions tenant A and tenant B correctly behind a trusted boundary;
   - reference AppTheory SSG+ISR stack behavior remains consistent with tenant-header stripping defaults.
5. Promote `premain` to `main` only after RC validation.
6. Publish the stable GitHub Release tarball and reference bundle through the normal immutable release path.
7. Back-merge `main` into `staging` after the stable release.

Suggested RC soak duration: short but explicit, at least one downstream validation cycle for any known tenantized internal UI that exercises ISR. If no current downstream tenantized ISR consumer exists, local/unit/reference-stack validation is sufficient.

## Version-bump implication

Minor bump under pre-1.0 semver, driven by a breaking `fix(isr)!:` commit with a `BREAKING CHANGE:` footer. Although the package is currently versioned above `1.0`, the repository instructions still treat FaceTheory as pre-1.0; release-please will determine the exact resulting version from Conventional Commits.

## Cross-phase risks

- **False positives from header presence:** fail-closed default may block tenant-invariant ISR routes when infrastructure forwards `x-tenant-id` globally. This is intentional for confidentiality, but migration guidance must explain how to remove the header, configure `tenantKey`, configure a custom `cacheKey`, or move the route to SSR.
- **False sense of safety with custom `cacheKey`:** FaceTheory cannot inspect a custom cache-key function to prove it includes tenant variance. Treating custom `cacheKey` as explicit consumer ownership should be documented.
- **Security error observability:** logs and errors must identify the missing partition class without including raw tenant values, auth headers, or cookies.
- **Release-note clarity:** the behavior is intentionally breaking and security-motivated; release notes must call out symptoms and remediation.
- **Example drift:** built examples under `ts/examples/*/dist` may include generated copies of ISR runtime code. Implementation should avoid editing generated dist manually unless the example build policy requires refreshed outputs.

## Cross-repo coordination

- **AppTheory:** no code change required. Coordination note only: FaceTheory documentation must remain consistent with AppTheory’s default behavior of stripping viewer-supplied tenant headers and requiring a trusted boundary before `tenantKeyFromTrustedHeader()` is safe.
- **TableTheory:** no schema or behavior change expected. The guard runs before metadata-store access and should not require TableTheory coordination.
- **Autheory / Pay Theory:** notify through the user if either has tenant-varying ISR routes or forwards tenant-like headers globally. They should validate against the RC before stable promotion.

## Open questions

- Should FaceTheory expose a public `additionalTenantBoundaryHeaders` option in the first implementation, or keep the first release to the built-in `x-tenant-id` and `x-facetheory-tenant` list?
- Should the implementation export a named error class for observability/tests, or keep the error internal and assert behavior through `FaceApp` responses?
- Are there current downstream ISR consumers that forward tenant-like headers globally even for tenant-invariant routes?
