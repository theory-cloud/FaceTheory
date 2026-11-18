# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v7.4.0`
- AppTheory (CDK): `v7.4.0`
- TableTheory (TypeScript): `v6.5.1`
- Go toolchain (`.go-version`): `1.27.4` — the floor the pinned AppTheory release declares in its `go.mod`

These are resolved at use time, not remembered: read `gh api repos/theory-cloud/<repo>/releases/latest`,
require `"immutable": true`, pin the exact tag, take the asset names from that tag, and verify each
asset against the release's own `SHA256SUMS.txt` (AppTheory) or `tabletheory-SHA256SUMS.txt`
(TableTheory) before recording the integrity.

## 7.4.0 Compatibility Impact

AppTheory `v7.4.0` is a minor release on the v7 line; both release assets are immutable and it is the release the
repository currently pins. The declaration surface FaceTheory imports did not change. Every other upstream fact that
reaches this repository is recorded below; nothing is a hidden behaviour change.

### Declaration-file diff, `v7.3.1` -> `v7.4.0`

Both published assets were downloaded from their GitHub Releases and verified against the release `SHA256SUMS.txt`
before the diff (see §Release Asset SHA-256).

The runtime package keeps the same `dist` declaration-file set: 77 `.d.ts` files in both releases. Exactly **one**
differs, and every other declaration — including `dist/index.d.ts`, `dist/app.d.ts`, `dist/context.d.ts`,
`dist/errors.d.ts` and the whole `/apptheory` adapter — is byte-identical:

- `dist/mcpfacade.d.ts`
  - `FrontDoorVerification.secretValue` becomes optional (`secretValue?: string`); existing call sites still compile.
  - New optional `FrontDoorVerification.secretParameterName?: string`.
  - New type `FrontDoorSecretReader = (parameterName: string) => Promise<string>`.
  - New consts `DEFAULT_FRONT_DOOR_SECRET_TTL_SECONDS` (`300`) and `MAX_FRONT_DOOR_SECRET_TTL_SECONDS` (`3600`).
  - `FacadeConfig` gains optional `frontDoorSecretReader?` and `frontDoorSecretTTLSeconds?`.

The published code delta is as narrow as the declaration delta. In the runtime tarball only
`dist/mcpfacade.{js,js.map,d.ts,d.ts.map}` and `package.json` differ; every other file in `dist` is byte-identical.
FaceTheory imports `createApp`, `createLambdaFunctionURLStreamingHandler`, the `/apptheory` adapter types and the two
test helpers, and has no `mcpfacade`, `FrontDoorVerification` or `FacadeConfig` reference, so the changed declarations
are unreachable from this repository.

The CDK package keeps 57 `.d.ts` files in both releases and exactly **one** differs: `lib/mcp-server.d.ts`, which gains
the optional `secretParameterName` and `secretParameterKmsKey` props, the `AppTheoryMcpFrontDoorHeader` interface and
the `frontDoorOriginHeader` property, and makes `secretValue` optional. Those are additive and again unreachable:
FaceTheory constructs `AppTheorySsrSite`, `AppTheoryDynamoTable` and `AppTheorySsrSiteMode`, whose declarations
(`lib/ssr-site.d.ts`, `lib/dynamo-table.d.ts`) are byte-identical. The remaining `lib/*.js` differences are the jsii
`JSII_RTTI_SYMBOL` version string, and `.jsii` differs only in `version`, `fingerprint`, `jsiiVersion`, `readme`,
`types` (the additive MCP front-door surface) and the `aws-cdk-lib` dependency entry.

### The AWS SDK floor moved

`@theory-cloud/apptheory` `v7.4.0` raises its `@aws-sdk/*` ranges from `^3.1164.0` to `^3.1169.0` and adds a new
dependency, `@aws-sdk/client-ssm` `^3.1164.0`. All three lockfiles resolve the `@aws-sdk/*` family to `3.1171.0`, the
newest release inside that floor, and gain the new `client-ssm` node; the `client-dynamodb`, `client-kms` and
`client-sts` nodes and their `@smithy/*` transitives move with the family. That movement is upstream-forced, not a
range refresh this repository chose.

### TableTheory: the declaration gap is closed, the pin still leads it

`@theory-cloud/apptheory` `v7.4.0` declares `@theory-cloud/tabletheory-ts` `v6.5.0` as a tarball URL
(`…/releases/download/v6.5.0/theory-cloud-tabletheory-ts-6.5.0.tgz#sha512-PJSRT42RXj/woaH6M9Tf3lQj86Q1ky96cBonWaNNRlsuVb7wBYjGePncxbe966LQPVlZSIzc9mCP0lmxsNWMsg==`),
and the same tag's Go module requires `github.com/theory-cloud/tabletheory/v6` `v6.5.0`. The TypeScript package and
the Go module of one AppTheory tag now name the same TableTheory release, which closes the `v7.3.1` gap recorded below.

FaceTheory still pins the newest immutable TableTheory release, `v6.5.1`, so the
`@theory-cloud/apptheory` -> `@theory-cloud/tabletheory-ts` override stays load-bearing for the resolved version: it
keeps this repository's validated tarball authoritative under `@theory-cloud/apptheory`, and all three lockfiles
resolve a single top-level `6.5.1` node. The upstream-declared `v6.5.0` string stays verbatim inside each
`@theory-cloud/apptheory` package node — that is AppTheory's published manifest, not a FaceTheory pin, and it is not
editable. The `ts`, `ts-pack` and `examples-local` records prove the combination.

`@theory-cloud/tabletheory-ts` `v6.5.1` is byte-identical to `v6.4.1` apart from the `version` field in its
`package.json`: all 80 `.d.ts` files and the rest of `dist` are unchanged, so the move carries no behaviour change.

### CDK peer and the local runner floor

`@theory-cloud/apptheory-cdk` `v7.4.0` raises its exact `aws-cdk-lib` peer from `2.275.0` to `2.277.0` (with
`constructs ^10.8.1`), so all three manifests and the `@theory-cloud/apptheory-cdk` override move to `2.277.0`. That
peer move carries `aws-cdk-lib`'s own bundled toolchain with it: `@aws-cdk/cloud-assembly-schema` `55.6.0`,
`@aws/cloudformation-validate` `1.14.0`, `semver` `7.8.6` and the bundled `brace-expansion` `5.0.13`. The bundled
`minimatch` stays `10.2.6`, so the scoped supply-chain exception below still applies unchanged.

The Go floor does not move: `github.com/theory-cloud/apptheory/v7` at `v7.4.0` declares `go 1.27.4`, exactly what
`.go-version` already pins, so the local runner install and `verify-go-version-pin.sh` are unaffected.

Both infra snapshots' `Code.S3Key` values changed and both were regenerated. The stacks bundle the pinned
`@theory-cloud/apptheory` release into the Lambda asset, and that package's `dist/index.js` re-exports the MCP and OAuth
modules, so a changed `dist/mcpfacade.js` and `package.json` version are inside the esbuild output even though the
reference handlers never call them: unreachable at runtime is not absent from the asset. No stack shape, resource or
property moved.

## 7.3.1 Compatibility Impact (history)

AppTheory `v7.3.1` is a minor release on the v7 line, and both release assets are immutable. The
declaration-file surface FaceTheory imports is unchanged: `createApp`,
`createLambdaFunctionURLStreamingHandler`, the `/apptheory` adapter types and the two test helpers are
byte-identical to `v7.1.0`. `@theory-cloud/apptheory-cdk` `v7.3.1` keeps the same exact
`aws-cdk-lib@2.275.0` peer (with `constructs ^10.8.1`), so the CDK package versions stay pinned where
they are. The bundled handler asset still moves: the reference stacks bundle `@theory-cloud/apptheory`
into the Lambda asset, and `dist/index.js` re-exports the MCP and OAuth modules, so published code the
reference handlers never call is still inside the bundle — unreachable at runtime is not absent from the
asset. The `v7.3.1` module changes and the `@aws-sdk/*` floor that release raises therefore produce a
different esbuild output. Both snapshots' `Code.S3Key` values changed and both were regenerated.

Two upstream facts matter for this repository:

- **The AWS SDK floor moved.** `@theory-cloud/apptheory` `v7.3.1` raises its `@aws-sdk/*` ranges from
  `^3.1156.0` to `^3.1164.0`, so the three lockfiles now resolve `@aws-sdk/*` and a few `@smithy/*`
  transitives to the newest in-range releases. That movement is upstream-forced, not a range refresh
  this repository chose.
- **TableTheory is still pinned transitively at `v6.3.0`.** `@theory-cloud/apptheory` `v7.3.1`
  declares `@theory-cloud/tabletheory-ts` `v6.3.0` as a tarball URL, while the same release's Go
  module requires TableTheory `v6.4.1`. This is an upstream declaration gap: the TypeScript package
  and the Go module of one AppTheory tag name different TableTheory releases. FaceTheory keeps its
  direct dependency at the resolved `v6.4.1` tag, keeps the
  `@theory-cloud/apptheory` -> `@theory-cloud/tabletheory-ts` override pointing at that same `v6.4.1`
  tarball, and proves the combination in the `ts`, `ts-pack` and `examples-local` evidence records. No
  other workaround is applied.

Adopting `v7.3.1` also moves the local runner floor: `github.com/theory-cloud/apptheory/v7` at
`v7.3.1` declares `go 1.27.4`, so `.go-version` moves with it and the runner install is verified
against the tag the manifest names.

## 7.1.0 Compatibility Impact (history)

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

The CDK package's type surface is unchanged: every `.d.ts` file is byte-identical between `v7.0.0` and `v7.1.0`. The
published CDK tarball contains 57 `lib/*.js` files: the 46 that carry the jsii `JSII_RTTI_SYMBOL` differ only in that
version string, and the other 11 are byte-identical; `.jsii` differs only in `version` and `fingerprint`.
`@theory-cloud/apptheory-cdk` `v7.1.0` declares the same exact `aws-cdk-lib@2.275.0` peer (with
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
repository; the current pin is `v7.4.0`. Each v7 break remains unreachable from FaceTheory:

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
consumer's own AppTheory install. Newly generated starters pick up the pinned tarball recorded in
`ts/package.json`. The pin move is a `build(deps)` compatibility update, not a breaking change for FaceTheory consumers.

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

- AppTheory runtime tarball: `11bc57ed0214de5be0eb15c3f84344ad58e1b26ac38053dc6704e9b0f709e30e`
- AppTheory CDK tarball: `2da76c5330bc1d3232e661b2be50e9d92e3b09f77b0d7476a9f75f07dee3c1c2`
- TableTheory TypeScript tarball: `3134137ee97f3769df9db8d5e4802e3d9c6a348c31e9e31e62002b78fec48f7c`

The matching SHA-512 lockfile integrities are
`sha512-1txwWztta9TGzAVQz2JxKIMSQW4E0PzuFOAKtJlWzMafvdM20D0szUw8P0u2GgJW0PbKzyoPnFy0kg4srVLmLw==`,
`sha512-dEc4/wsbhF7qpZnMRgJCOPZwH4aLxl16Lg4qyTbVd/K4a8rOlLcHcKAPsaC9Tzxy4G//k7AtCs4VSN/Dm5aq8g==`
and `sha512-KrS5Kfh+WFw7hRmuIo/98PY2jVxxAfZ57RXUq50O3Mhs1KyemqZWwvXFO0kzoCxMUOuAY0bUaGK0kxdujabqkA==`.

## Known Audit Exceptions

The gov-infra supply-chain allowlist (`gov-infra/planning/facetheory-supply-chain-allowlist.txt`) is the only place an
`npm audit` finding may be allowed, and `scripts/verify-npm-audit.sh` requires a clean audit in `ts`,
`infra/apptheory-ssr-site`, and `infra/apptheory-ssg-isr-site` otherwise. A scoped exception entry names an exact
advisory set, package, installed version, node path, project list, and UTC expiry; the gate fails on anything outside
those gates and ignores the entry once it expires. A parent package that npm reports only because an allowed dependency
is vulnerable (an entry whose `via` lists dependency names rather than advisories) inherits the allowance only when
every dependency it names is itself allowed and it carries no advisory of its own.

### Active exceptions

- **`picomatch` 2.3.2 and 4.0.7 under `ts/`** — `GHSA-fc5q-39xc-vjpf` (ReDoS through single-branch repeated
  extglobs), which affects every `picomatch <= 4.0.7` and carries **no patched release**: `4.0.7` is the newest
  published `picomatch`, so nothing installable clears it. The finding is build/lint/test-time only — `@rollup/pluginutils`
  (through `rollup-plugin-svelte`) and `vite`/`tinyglobby` are dev dependencies, the published package has no runtime
  dependencies, and no infra project resolves `picomatch` at all. Two scoped entries name exactly the three `ts/` nodes
  at their installed versions, for `ts/` only, and expire 2026-12-01. Operator-ruled 2026-11-17 as a scoped, expiring
  exception (the same ruling AppTheory records for its lint chain); nothing wider is claimed. Removal condition: retire
  both entries when a stable `picomatch >= 4.0.8` is published, or when `ts/` no longer resolves `picomatch <= 4.0.7`.
- **bundled `minimatch` 10.2.6 in `aws-cdk-lib@2.277.0`** — `GHSA-g3hv-75wg-m249` (DoS via globparts amplification),
  fixed in `minimatch@11.0.1`. The affected copy at `node_modules/aws-cdk-lib/node_modules/minimatch` ships inside the
  AWS-published `aws-cdk-lib` tarball and cannot be upgraded from this repository; `2.277.0` is the exact `aws-cdk-lib` peer that
  `@theory-cloud/apptheory-cdk` v7.4.0 declares, and no published `aws-cdk-lib` fixes this: `2.277.0` is the newest
  release when re-checked on 2026-11-17 and it still declares `minimatch ^10.2.6`. The scoped entry names exactly that package, version, node path, all three audited
  projects, and the single advisory, and expires 2026-12-01. Authorised by the operator ruling of 2026-10-03 ("if a
  vulnerable dependency is bundled in AWS we make an exception until its updated there"), extended 2026-10-04 to
  AWS-published build-toolchain chains. Removal condition: the pinned `aws-cdk-lib` bundles `minimatch >= 11.0.1`.

### Non-bundled remediation

Non-bundled copies are not eligible for an exception and are resolved by upgrade instead. The same advisory batch
(2026-10-30) also published `GHSA-3g3m-2fjr-6pw4` against `glob` (patched `14.0.2`), so `ts/package.json` overrides
`minimatch` to `11.0.9` and `glob` to `14.0.3`; `ts/package-lock.json` resolves every non-bundled `minimatch` to
`11.0.9` and `glob` to `14.0.3`, leaving only the AWS-bundled node above.

### Recently cleared

- **bundled `brace-expansion` 5.0.9** — retired by the AppTheory v6 CDK pin move and kept retired here. The exception's
  documented removal condition ("must be rechecked when `aws-cdk-lib` bundles a fixed `brace-expansion` (>= 5.0.12)") is
  met: `aws-cdk-lib@2.273.0`, the exact peer of `@theory-cloud/apptheory-cdk` `v6.4.0`, bundles `brace-expansion@5.0.12`
  at `node_modules/aws-cdk-lib/node_modules/brace-expansion` in all three projects, and the current
  `aws-cdk-lib@2.277.0` pin bundles `5.0.13`; the three advisories (`GHSA-q2hr-2g5m-vwhr`,
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

AppTheory `v7.4.0` raises the `^3.1164.0` `@aws-sdk/*` floor to `^3.1169.0` and adds `@aws-sdk/client-ssm`, so this
pin move does require AWS SDK graph movement: the three locks were regenerated with `npm install --ignore-scripts`,
the only non-`@theory-cloud` nodes that moved are the `@aws-sdk/*` and `@smithy/*` transitives inside that new floor
plus the new `client-ssm` node, the CDK `inBundle` entries were preserved, and every lock was validated with a real
`npm ci`. The `aws-cdk-lib` peer move to `2.277.0` moves that package's own bundled toolchain with it
(`@aws-cdk/cloud-assembly-schema` `55.6.0`, `@aws/cloudformation-validate` `1.14.0`, `semver` `7.8.6`,
`brace-expansion` `5.0.13`); those nodes are the package's published dependency tree, not a range refresh.

Both infra snapshots move. The reference handlers import only `createApp` and
`createLambdaFunctionURLStreamingHandler`, and that imported declaration surface is unchanged, but the stacks bundle
the pinned `@theory-cloud/apptheory` release into the Lambda asset. Its `dist/index.js` re-exports the MCP and OAuth
modules, so published code the reference handlers never call is still inside the bundle: unreachable at runtime is not
absent from the asset. A pin move that changes that package's published code — as `v7.4.0` does (only
`dist/mcpfacade.js` and the package version differ), together with the `@aws-sdk/*` floor it raises — therefore changes
the esbuild output and the handler bundle hash. Both snapshots' `Code.S3Key` values changed and both were regenerated;
no stack shape, resource or property moved. A future pin move must regenerate both snapshots (`npm test` in each
`infra/` project) and commit the refreshed files, and must not assume the hash is stable.

## Install (npm)

```bash
  # AppTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v7.4.0/theory-cloud-apptheory-7.4.0.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v6.5.1/theory-cloud-tabletheory-ts-6.5.1.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v7.4.0/theory-cloud-apptheory-cdk-7.4.0.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v7.4.0/theory-cloud-apptheory-7.4.0.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v6.5.1/theory-cloud-tabletheory-ts-6.5.1.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v6.5.1/theory-cloud-tabletheory-ts-6.5.1.tgz"
    }
  }
}
```

Note: AppTheory `v7.4.0` declares `@theory-cloud/tabletheory-ts` `v6.5.0` transitively, as a pinned GitHub Release tarball URL carrying its own integrity (`…/releases/download/v6.5.0/theory-cloud-tabletheory-ts-6.5.0.tgz#sha512-PJSRT42RXj/woaH6M9Tf3lQj86Q1ky96cBonWaNNRlsuVb7wBYjGePncxbe966LQPVlZSIzc9mCP0lmxsNWMsg==`). FaceTheory resolves TableTheory from the immutable `v6.5.1` release instead, so the `overrides` block above **is load-bearing for the resolved version**: it keeps FaceTheory's validated TableTheory tarball authoritative under `@theory-cloud/apptheory`, and all three lockfiles resolve a single top-level `6.5.1` node. The `ts/` and infra lockfiles still keep the upstream-declared `v6.5.0` string verbatim inside the `@theory-cloud/apptheory` package node — that is AppTheory's own published manifest, not a FaceTheory pin, and it is not editable. AppTheory `v7.4.0`'s Go module requires the same `v6.5.0`, so this is a pin that leads an agreed declaration rather than a gap; the `ts`, `ts-pack` and `examples-local` records prove the override combination.

`facetheory create` and `facetheory doctor` carry no version constants: the create CLI derives the AppTheory, CDK, and
TableTheory tarball URLs from `ts/package.json` at runtime, and the doctor CLI checks the generated project's override
alignment against the tarball it finds there. Both therefore emit and validate exactly the pins above.
