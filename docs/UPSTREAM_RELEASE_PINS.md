# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v7.1.0`
- AppTheory (CDK): `v7.1.0`
- TableTheory (TypeScript): `v6.3.0`

## 7.1.0 Compatibility Impact

AppTheory `v7.1.0` is a minor release on the v7 line. Its generated changelog carries one commit marked breaking,
`1165d66f feat(mcpfacade)!: serve refresh reuse instead of revoking the family`, but AppTheory's `UPGRADING.md`
("v7.x line", 7.1.0) and `docs/release-notes-corrections.md` record the intended classification as a minor: the commit
is not in `v7.0.0` or any earlier tag, and no released consumer depended on the old revocation-on-reuse behaviour. The
behavior change is confined to the MCP auth facade: a rotated-away refresh handle presented after its grace window is
served by rotating the family's live head instead of revoking the family. No configuration key is removed.

FaceTheory has no `mcpfacade` reference. A case-insensitive search of `ts/`, `infra/`, `scripts/`, `docs/` and
`gov-infra/` finds only the sentence in this file that asserts its absence, and the repository has no `go.mod` and no
first-party `*.go` source. The X5 change is therefore unreachable from FaceTheory, and no consumer action is required.

FaceTheory's AppTheory imports are exactly:

- `createApp` and `createLambdaFunctionURLStreamingHandler` (the reference handlers and `create` templates);
- the `Context`, `Handler`, `Request` and `Response` types in the `/apptheory` adapter;
- the test helpers `buildLambdaFunctionURLRequest` and `createTestEnv`;
- `AppTheorySsrSite`, `AppTheoryDynamoTable` and `AppTheorySsrSiteMode` in the two infra stacks and the create template.

### Type-declaration diff, `v7.0.0` -> `v7.1.0`

Both published assets were downloaded from their GitHub Releases and verified against the release `SHA256SUMS.txt`
before the diff. The runtime package keeps the same `dist` declaration-file set. Exactly three `.d.ts` files changed;
every other declaration, including `dist/index.d.ts`, `dist/app.d.ts`, `dist/context.d.ts` and `dist/errors.d.ts`, is
byte-identical. Every change is additive:

- `dist/mcpfacade.d.ts`
  - `FacadeConfig` gains optional `refusalHook?: RefusalHook`.
  - New const `ROUTE_REFRESH_OUTCOME_ROTATED_FROM_HEAD` (`"rotated_from_head"`).
  - New consts `ROUTE_REFRESH_REASON_STALE_PREDECESSOR` (`"stale_predecessor"`),
    `ROUTE_REFRESH_REASON_FAMILY_HEAD_ABSENT` (`"family_head_absent"`) and
    `ROUTE_REFRESH_REASON_LEGACY_LINEAGE_ADOPTED` (`"legacy_lineage_adopted"`).
  - Comment-only update to `ROUTE_REFRESH_REASON_ALREADY_SERVED`.
- `dist/oauth/index.d.ts`
  - `RequireBearerTokenOptions` gains optional `refusalHook?: RefusalHook`.
  - New types `RefusalClass`, `RefusalEvent` and `RefusalHook`.
  - New consts `REFUSAL_REASON_UNCLASSIFIED`, `REFUSAL_REASON_MISSING_CREDENTIAL`,
    `REFUSAL_REASON_INVALID_CREDENTIAL`, `REFUSAL_REASON_EXPIRED_CREDENTIAL`, `REFUSAL_REASON_AUDIENCE_MISMATCH` and
    `REFUSAL_REASON_INSUFFICIENT_SCOPE`.
- `dist/oauth/store.d.ts`
  - `RouteRefreshBrokerRecord` gains optional `graceAccessTokenExpiresAt?: Date`.
  - `RouteRefreshFamilyRotation` gains optional `graceAccessTokenExpiresAt?: Date`.

FaceTheory imports none of the changed names. `createApp`, `createLambdaFunctionURLStreamingHandler`, the four
adapter types and the two test helpers are unchanged in `v7.1.0`.

The CDK package's type surface is unchanged: every `.d.ts` file is byte-identical between `v7.0.0` and `v7.1.0`. All
51 `lib/*.js` files differ only in the jsii `JSII_RTTI_SYMBOL` version string, and `.jsii` differs only in `version` and
`fingerprint`. `@theory-cloud/apptheory-cdk` `v7.1.0` declares the same exact `aws-cdk-lib@2.275.0` peer (with
`constructs ^10.8.1`) that the manifests already pin, and the three CDK symbols FaceTheory constructs are unchanged.

The Go `apptheory-local` runner is not part of the TypeScript declarations and moved on the same tag: it added TLS,
mail, shared-IAM and port-pin surfaces, models a narrow local IAM plane, and now enforces `AWS_IAM` on Function URLs.
Its public-surface order also changed: the Function URL takes the `--port-base` port and CloudFront the next one. Nothing
in a deployed stack changes. FaceTheory's harness sends viewer requests to the CloudFront listener the runner reports
and the gateway signs the origin request locally.

### TableTheory and CDK pins are unchanged

AppTheory `v7.1.0` still declares `@theory-cloud/tabletheory-ts` `v6.3.0` at the same pinned tarball URL and with the
same integrity (`…/releases/download/v6.3.0/theory-cloud-tabletheory-ts-6.3.0.tgz#sha512-ji8q/RXu6V8UKfRozQnqotPEm6O5nY3Ikg6TJcK1dzVemU+flclZUFGOUvlOU4a8ztGbOKmQ/DA3wJeu6pMDdA==`).
FaceTheory keeps its TableTheory pin and the `@theory-cloud/apptheory` -> `@theory-cloud/tabletheory-ts` override at
`v6.3.0`, so the direct dependency and AppTheory's transitive requirement resolve to one deduped `6.3.0` copy.
Adopting TableTheory `6.4.0` is not part of this move. `aws-cdk-lib` stays `2.275.0`.

### Retained `v7.0.0` baseline (history)

The `v7.0.0` major moved the Go module path to `github.com/theory-cloud/apptheory/v7` and shipped thirteen breaking
commits in the 2026-10-30 security wave. That analysis is retained because it explains why the v7 line is safe for this
repository; the current pin is `v7.1.0`. Each v7 break remains unreachable from FaceTheory:

- **Go `/v7` module path** — no Go code or module in this repo.
- **CDK MCP front door `LOCKED`/`DISABLED` enforcement** — no `AppTheoryMcpServer`, `McpServer` or `mcpfacade` reference
  exists in `ts/` or `infra/`.
- **CDK explicit-route authorizer validation** — FaceTheory builds no `HttpApi` and registers no explicit routes;
  `AppTheorySsrSite` creates a Function URL, S3 origins and a CloudFront distribution.
- **MCP session/stream bounds, MicroVM ownership and registry clocks, transactional OAuth refresh** — none of those
  modules is imported; the reference handlers wire `createApp` and the streaming handler only.
- **Lambda@Edge challenge-restoration handler is asynchronous** — FaceTheory constructs no challenge-restoration
  function.
- **Object store S3 `Get` typed not-found** — FaceTheory's S3 HTML store is its own `S3HtmlStore` over
  `@aws-sdk/client-s3`, not AppTheory's object store.
- **`*Strict` registrars un-deprecated** — additive posture change on a surface FaceTheory does not use.

### Consumer note

No FaceTheory API, type, default or documented behaviour changes. A consumer installing `@theory-cloud/facetheory` is
unaffected: `@theory-cloud/apptheory` is a FaceTheory devDependency, and the adapter subpath continues to require the
consumer's own AppTheory install. Newly generated starters pick up the `v7.1.0` tarball from `ts/package.json`. The pin
move is a `fix(deps)` compatibility update, not a breaking change for FaceTheory consumers.

Retained history lives in `CHANGELOG.md`; this file records only the current pin set.

Treat future upstream pin moves as dependency compatibility fixes, not release-process bookkeeping. FaceTheory consumers
install immutable GitHub Release tarballs, so a changed upstream baseline needs a normal RC for review before stable
promotion.

## Release Watchpoint

A `staging` -> `premain` PR is always RC intent. If upstream pin maintenance reaches `staging` without a
release-please-eligible `feat:`, `fix:`, or `perf:` commit, `scripts/verify-release-readiness.sh origin/premain
origin/staging prerelease` must fail rather than silently letting Release Please skip the RC. Do not recover with
manual tags, manual GitHub Releases, or `Release-As` footers; land a small, truthful compatibility change on `staging`
and keep the single release lane intact.

The one exception is a follow-up promotion into a release that is already pending. When the promotion range itself
carries no `feat:`, `fix:`, or `perf:` commit — typically a test, CI, or gate repair that the open RC pull request
needs — the verifier asks whether the release being prepared has user-facing content, not whether this range does. It
resolves the newest stable release tag reachable from `origin/premain` (`vX.Y.Z`; prerelease tags such as `vX.Y.Z-rc`
are excluded) and inspects `<tag>..origin/premain`. If that range holds at least one release-please-eligible commit,
the promotion passes with `prerelease-readiness: OK (follow-up to the pending release since <tag>: <n> user-facing
commits already on origin/premain)` and lists the commits it counted; the RC pull request already open is what ships.
Anything else keeps the strict failure and its message unchanged: no reachable stable tag, no user-facing commit
between the tag and `origin/premain`, or an empty range. The rule is `prerelease`-only: the `release`
(`origin/main..HEAD`) and `staging` (`origin/staging..HEAD`) contexts still require the range itself to carry the
release commit, and the release-sync fast path is unaffected.

## Release Asset SHA-256

Each hash below is the SHA-256 of the downloaded GitHub Release asset, cross-checked against the release's published
AppTheory `SHA256SUMS.txt` (runtime + CDK) and TableTheory `tabletheory-SHA256SUMS.txt` (all matched; a mismatch is a
release-asset integrity stop condition).

- AppTheory runtime tarball: `6af2bb45d96cb04a0fe2e8a991924601959d18aeb9bcc94fd0a92744bb0fdd2a`
- AppTheory CDK tarball: `ef1d7857d45cdc481e434ebe0fba88722de6395907ff8fdc725f124b797b9c43`
- TableTheory TypeScript tarball: `9507f6a6258e661546238300880659a1725f235bf1a0020edbd98145af31ea96`

The matching SHA-512 lockfile integrities are
`sha512-tXnOr32ZiyzbWDvPJxeY8J1eUlqK5vK+YXD8jl0QGMXKzCdTkGE3TKLWERsNu1QyzoYDEW1tY0NKWymje9H4SQ==`,
`sha512-nc016ANnu0bYLO1ED4AQRJzYzfA5Vm4ktHO2gf+M/X8BvVgEGv/NIrSSaTYMt7+gQuoK8Ej+v8NozRUJ0Hc8RQ==`
and `sha512-ji8q/RXu6V8UKfRozQnqotPEm6O5nY3Ikg6TJcK1dzVemU+flclZUFGOUvlOU4a8ztGbOKmQ/DA3wJeu6pMDdA==`.

## Known Audit Exceptions

The gov-infra supply-chain allowlist (`gov-infra/planning/facetheory-supply-chain-allowlist.txt`) is the only place an
`npm audit` finding may be allowed, and `scripts/verify-npm-audit.sh` requires a clean audit in `ts`,
`infra/apptheory-ssr-site`, and `infra/apptheory-ssg-isr-site` otherwise. A scoped exception entry names an exact
advisory set, package, installed version, node path, project list, and UTC expiry; the gate fails on anything outside
those gates and ignores the entry once it expires. A parent package that npm reports only because an allowed dependency
is vulnerable (an entry whose `via` lists dependency names rather than advisories) inherits the allowance only when
every dependency it names is itself allowed and it carries no advisory of its own.

### Active exceptions

- **bundled `minimatch` 10.2.6 in `aws-cdk-lib@2.275.0`** — `GHSA-g3hv-75wg-m249` (DoS via globparts amplification),
  fixed in `minimatch@11.0.1`. The affected copy at `node_modules/aws-cdk-lib/node_modules/minimatch` ships inside the
  AWS-published `aws-cdk-lib` tarball and cannot be upgraded from this repository; `2.275.0` is the newest published
  `aws-cdk-lib` (re-checked 2026-11-10 against the npm registry) and it still declares `minimatch ^10.2.6`, so no
  available CDK release fixes this. The scoped entry names exactly that package, version, node path, all three audited
  projects, and the single advisory, and expires 2026-12-01. Authorised by the operator ruling of 2026-10-03 ("if a
  vulnerable dependency is bundled in AWS we make an exception until its updated there"), extended 2026-10-04 to
  AWS-published build-toolchain chains. Removal condition: the pinned `aws-cdk-lib` bundles `minimatch >= 11.0.1`.

### Non-bundled remediation

Non-bundled copies are not eligible for an exception and are resolved by upgrade instead. The same advisory batch
(2026-10-30) also published `GHSA-3g3m-2fjr-6pw4` against `glob` (patched `14.0.2`), so `ts/package.json` overrides
`minimatch` to `11.0.1` and `glob` to `14.0.3`; `ts/package-lock.json` resolves every non-bundled `minimatch` to
`11.0.1` and `glob` to `14.0.3`, leaving only the AWS-bundled node above.

### Recently cleared

- **bundled `brace-expansion` 5.0.9** — retired by the AppTheory v6 CDK pin move and kept retired here. The exception's
  documented removal condition ("must be rechecked when `aws-cdk-lib` bundles a fixed `brace-expansion` (>= 5.0.12)") is
  met: `aws-cdk-lib@2.273.0`, the exact peer of `@theory-cloud/apptheory-cdk` `v6.4.0`, bundles `brace-expansion@5.0.12`
  at `node_modules/aws-cdk-lib/node_modules/brace-expansion` in all three projects, and the current
  `aws-cdk-lib@2.275.0` pin bundles the same `5.0.12`; the three advisories (`GHSA-q2hr-2g5m-vwhr`,
  `GHSA-qhr7-859c-m2p7`, `GHSA-6j4f-fj2g-mc7p`) are fixed at 5.0.10 / 5.0.11 / 5.0.12. The scoped allowlist entry was
  removed rather than re-granted; it expired 2026-11-02, and removal happened first because the condition it named was
  actually satisfied.
- **top-level `brace-expansion`** — non-bundled dependency paths resolve to fixed `brace-expansion@5.0.12`.

## Infra Lockfile Note

The infra example lockfiles intentionally retain AWS CDK bundled-dependency metadata for
`aws-cdk-lib/node_modules/@aws-cdk/cloud-assembly-api`. Keep those nested `inBundle` entries when regenerating the
locks so `npm ci` can validate the AWS CDK package tree under npm 11.

A `npm install --package-lock-only` run also re-resolves the peer-only `@aws-sdk/client-dynamodb`,
`@aws-sdk/client-kms`, and `@aws-sdk/client-sts` nodes (plus their `@aws-sdk/*` and `@smithy/*` transitives) even
though their peer range did not move. Restore those nodes from the prior lock whenever the new pin does not require
them, so each lockfile diff stays scoped to the `@theory-cloud` pin nodes, then confirm the result with a real
`npm ci`.

AppTheory `v7.1.0` keeps the `^3.1156.0` `@aws-sdk/*` floor the v6.4.0 line already declared, so this pin move needs
no AWS SDK graph movement. Each lock was regenerated with `npm install --ignore-scripts --package-lock-only`, then
restored to the prior lock except for the AppTheory nodes (the ts lock's npm 11 `libc` field reordering was discarded
under the restore rule above), and every lock was validated with a real `npm ci`.

Neither infra snapshot moves. The reference handlers import only `createApp` and
`createLambdaFunctionURLStreamingHandler`, so the changed `mcpfacade` and `oauth` modules are unreachable and esbuild
emits a byte-identical handler asset; both stacks' `Code.S3Key` values are unchanged. The two CDK synth snapshot tests
pass without a snapshot edit.

## Install (npm)

```bash
  # AppTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v7.1.0/theory-cloud-apptheory-7.1.0.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v6.3.0/theory-cloud-tabletheory-ts-6.3.0.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v7.1.0/theory-cloud-apptheory-cdk-7.1.0.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v7.1.0/theory-cloud-apptheory-7.1.0.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v6.3.0/theory-cloud-tabletheory-ts-6.3.0.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v6.3.0/theory-cloud-tabletheory-ts-6.3.0.tgz"
    }
  }
}
```

Note: AppTheory `v7.1.0` declares `@theory-cloud/tabletheory-ts` `v6.3.0` transitively, as a pinned GitHub Release tarball URL carrying its own integrity (`…/releases/download/v6.3.0/theory-cloud-tabletheory-ts-6.3.0.tgz#sha512-ji8q/RXu6V8UKfRozQnqotPEm6O5nY3Ikg6TJcK1dzVemU+flclZUFGOUvlOU4a8ztGbOKmQ/DA3wJeu6pMDdA==`). The local SHA-512 of the downloaded TableTheory `v6.3.0` tarball, the integrity AppTheory `v7.1.0` declares, and the integrity recorded in all three lockfiles agree. The `overrides` block above is therefore **not load-bearing for the resolved version**: the direct dev dependency and AppTheory's transitive requirement name the same `v6.3.0` tarball URL, so both resolve to a single deduped `v6.3.0` node (`npm ls @theory-cloud/tabletheory-ts` reports `apptheory@7.1.0 -> tabletheory-ts@6.3.0 deduped`, plus the top-level `6.3.0`). The override is retained deliberately as a narrow guard: it keeps FaceTheory's validated TableTheory tarball authoritative under `@theory-cloud/apptheory` even if a future upstream release regresses its transitive declaration. The `ts/` and infra lockfiles also keep that upstream-declared `v6.3.0` string verbatim inside the `@theory-cloud/apptheory` package node — that is AppTheory's own published manifest, not a FaceTheory pin, and it is not editable.

`facetheory create` and `facetheory doctor` carry no version constants: the create CLI derives the AppTheory, CDK, and
TableTheory tarball URLs from `ts/package.json` at runtime, and the doctor CLI checks the generated project's override
alignment against the tarball it finds there. Both therefore emit and validate exactly the pins above.
