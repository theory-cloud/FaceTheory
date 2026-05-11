# Roadmap: OAC Mutating Form Transport

## Goal

Deliver FaceTheory's canonical browser-side path for same-origin mutating forms behind AppTheorySsrSite Lambda Function URL OAC. The roadmap keeps `AWS_IAM` + CloudFront OAC as the durable AWS-first deployment posture while adding an adapter-neutral helper that hashes the exact URL-encoded request bytes it sends, includes `x-amz-content-sha256`, preserves same-origin navigation outcomes, and documents how SSR control-plane forms should use it without weakening AppTheory or carrying app-local transport workarounds.

## Render modes and adapters affected

| Surface | Impact |
| --- | --- |
| SSR | Primary target: SSR-rendered forms can submit to same-origin SSR action routes behind OAC. |
| SPA | Supported when a deterministic shell installs the helper and later UI interactions submit marked forms. |
| SSG | Static pages may render marked forms, but mutating action routes must still route to Lambda/SSR. |
| ISR | Pages may contain forms, but ISR cache identity/leases/storage do not change; mutating actions stay dynamic. |
| React | No adapter-specific implementation; React apps consume the core helper from client bootstraps. |
| Vue | No adapter-specific implementation; Vue apps consume the same core helper. |
| Svelte | No adapter-specific implementation; Svelte apps consume the same core helper. |

## Determinism impact

Preserves the initial SSR/CSR determinism contract. The helper runs only after user submit events, does not alter server-rendered markup during hydration, and does not touch `head.ts`, style extraction, the SSR render pipeline, or ISR cache identity. The new determinism-sensitive edge is documentation and tests around post-submit document replacement: FaceTheory must use a documented full-document/navigation policy rather than ad hoc partial DOM patching that would become a second rendering contract.

## Phases

### Phase 1: Core OAC transport primitive

**Milestone candidates:**

- **oac-form-core-transport** — Add the adapter-neutral payload hashing and marked-form submit controller that sends same-origin URL-encoded mutating requests with `x-amz-content-sha256`.
  - Items: 1, 2, 3
  - Dependencies: Approved scoped need and enumerated changes; no adapter, AppTheory, TableTheory, or dependency changes required first.
  - Determinism-sensitive: no
  - Risks:
    - Browser API variance around `SubmitEvent.submitter`, `FormData(form, submitter)`, and `crypto.subtle`; mitigate with feature checks, test-injectable helpers, and documented browser support/fallback behavior.
    - Accidentally hashing a different byte sequence than the one sent; mitigate by constructing one `Uint8Array` body and passing that exact object to both hashing and `fetch`.
    - Multipart/file inputs silently degrading to `[object File]`; mitigate by failing closed on non-string form entries.
    - Redirect/error handling drifting from native browser form semantics; mitigate with explicit same-origin redirect and full-document response policy tests.

### Phase 2: Reference usage and AWS contract documentation

**Milestone candidates:**

- **oac-form-reference-contract** — Provide copyable SSR form usage and document the AppTheorySsrSite OAC routing contract for mutating paths.
  - Items: 4, 5
  - Dependencies: Phase 1 helper API name, opt-in marker, and navigation policy must be stable enough for docs/examples.
  - Determinism-sensitive: no
  - Risks:
    - A runnable example may duplicate existing SSR example machinery; mitigate by allowing a focused docs snippet if it satisfies consumer copy/paste needs.
    - Consumers may misread the payload hash as application authentication; mitigate by repeatedly stating that auth, CSRF, idempotency, and business validation remain app concerns.
    - Consumers may route SSG/ISR form action paths to S3/origin groups instead of Lambda; mitigate by documenting AppTheorySsrSite `ssrPathPatterns` for action routes.

### Phase 3: Troubleshooting, release guidance, and downstream review

**Milestone candidates:**

- **oac-form-release-guidance** — Add troubleshooting and release-facing notes so consumers can diagnose `InvalidSignatureException`, keep OAC enabled, and validate the RC before stable release.
  - Items: 6
  - Dependencies: Phase 1 and Phase 2 complete; final docs should name the actual helper and marker attribute.
  - Determinism-sensitive: no
  - Risks:
    - Teams may use `ssrUrlAuthType: NONE` as a durable workaround; mitigate by documenting it only as an explicitly authorized temporary rollback with a removal plan.
    - theory-mcp-server needs to consume the new helper promptly; mitigate by requiring RC review before stable promotion.

## Release rollout plan

1. Land implementation work on a feature branch into `staging` after running `scripts/verify-version-alignment.sh` and the relevant `cd ts && npm run check` / targeted example checks.
2. Before opening or updating the staging PR, verify root `VERSION`, `ts/package.json`, `ts/package-lock.json`, `.release-please-manifest.json`, and `.release-please-manifest.premain.json` alignment per `AGENTS.md`.
3. Merge `staging` to `premain` to produce a release candidate such as `vX.Y.Z-rc.N` with the normal GitHub Release tarballs/reference bundle.
4. Ask theory-mcp-server to validate the RC by replacing its local workaround/blocked form path with the FaceTheory helper in the lab control-plane form flow, specifically `POST /agents/new` through CloudFront OAC.
5. RC acceptance criteria before stable:
   - helper unit tests pass in FaceTheory;
   - docs explain OAC payload hash behavior and multipart exclusion;
   - theory-mcp-server confirms same-origin lab form POST reaches Lambda through CloudFront without disabling OAC;
   - no AppTheory OAC rollback is needed.
6. Promote `premain` to `main` for the stable GitHub Release, then back-merge `main` into `staging`.

Suggested RC soak: short, targeted soak after theory-mcp-server lab validation because the feature is additive and opt-in, but it touches security-sensitive deployment behavior.

## Version-bump implication

Minor bump. The planned runtime change is an additive public helper and documentation/examples (`feat(oac)`), not a breaking change. No peer dependencies, release manifests, version markers, or distribution paths are expected to change during feature implementation; release-please should own version updates.

## Cross-phase risks

- **Security semantics risk:** consumers could treat `x-amz-content-sha256` as app integrity/authentication. Mitigation: docs and examples state it is AWS signing plumbing only.
- **Navigation semantics risk:** fetch-based form transport can diverge from native browser navigation. Mitigation: test and document one full-document/redirect policy, and keep custom render hooks explicit.
- **Browser compatibility risk:** form submitter APIs and Web Crypto must be handled deliberately. Mitigation: unit tests with injected dependencies and clear unsupported-browser behavior.
- **Multipart risk:** upload forms need a separately scoped body-construction strategy. Mitigation: first pass fails clearly for browser-generated multipart and documents a future separate scope for uploads.
- **Deployment routing risk:** in SSG/ISR topologies, action routes must bypass S3 static behavior. Mitigation: AppTheorySsrSite `ssrPathPatterns` documentation and troubleshooting.
- **Rollback risk:** a bad RC should be rolled back by leaving consumers on the previous FaceTheory release tarball or disabling the opt-in form marker/client bootstrap. Do not weaken OAC as the framework rollback path.

## Cross-repo coordination

- **AppTheory:** no code change expected. Documentation should remain consistent with AppTheorySsrSite's fail-closed `AWS_IAM` + OAC contract and `ssrPathPatterns` routing guidance.
- **TableTheory:** none. ISR metadata, leases, and cache state are unaffected.
- **theory-mcp-server:** required downstream validation before stable release. The lab control plane is the triggering consumer and should review the FaceTheory RC before release.
- **Autheory / Pay Theory:** no required code coordination identified. Notify through the user if they have SSR control-plane forms behind AppTheorySsrSite OAC that should validate the RC.

## Open questions

- Final helper name: default recommendation is `startAwsOacFormTransport` to keep AWS/OAC explicit.
- Final opt-in marker: default recommendation is `data-facetheory-oac-form` so forms are never intercepted globally.
- Runnable example vs docs snippet: default recommendation is a copyable docs snippet unless implementation finds a compact local example that adds meaningful test coverage.
- Non-native methods: default recommendation is POST support first, with explicit helper-owned support for `PUT`/`PATCH`/`DELETE` only when configured by data attribute/options.
- Multipart uploads: default recommendation is separate future scope if a consumer needs file uploads behind OAC.
