# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v6.0.0`
- AppTheory (CDK): `v6.0.0`
- TableTheory (TypeScript): `v5.0.0`

## Compatibility Impact

AppTheory `v6.0.0` and TableTheory `v5.0.0` are coordinated majors. FaceTheory consumes only the **TypeScript** AppTheory
runtime asset and the **TypeScript** AppTheory CDK asset, so neither Go axis reaches it: the AppTheory Go module path move
(`github.com/theory-cloud/apptheory/v6`) and the TableTheory Go module path move (`github.com/theory-cloud/tabletheory/v5`)
have no FaceTheory counterpart (the repo has no `go.mod`, no `*.go` files, and only a `.go-version` pin). This move is a
dependency-compatibility adoption:

- the AppTheory CDK peer floor **moves**: `@theory-cloud/apptheory-cdk` `v6.0.0` declares exact `aws-cdk-lib@2.273.0`
  (was exact `2.271.0`); `constructs@^10.8.1` is unchanged. Because the peer floor is exact, `ts/` and both infra
  examples must move `aws-cdk-lib` to `2.273.0` in the same change — `npm ci` otherwise fails with `ERESOLVE` — so the
  AppTheory CDK pin and the `aws-cdk-lib` pin cannot land separately. That `aws-cdk-lib` bump is also what retires the
  bundled `brace-expansion` exception (see "Known Audit Exceptions");
- the constructs both reference stacks consume are **unchanged**: the `v5.0.1` -> `v6.0.0` diff for `lib/ssr-site.js`
  (`AppTheorySsrSite`) and `lib/dynamo-table.js` (`AppTheoryDynamoTable`) is the jsii runtime type version string and
  nothing else. AppTheory `v6.0.0` does fail closed on several CDK security defaults — `AppTheoryAppProps.logRemovalPolicy`
  and the `AppTheoryFunction` log-group removal policy now default to `RemovalPolicy.RETAIN`;
  `AppTheoryHttpApi` disables the default `execute-api` endpoint when `domain.mutualTlsAuthentication` is set;
  `AppTheoryS3VersionedIngress` grant locations now reject unresolved CDK tokens; and
  `AppTheoryVectorIndex.grantBedrockInvokeModel` scopes its default resource ARN to the configured model instead of `*`.
  FaceTheory's reference stacks use none of those constructs or props (they use `AppTheorySsrSite`, `AppTheoryDynamoTable`,
  and their own `Bucket`/`NodejsFunction`/`BucketDeployment` resources), so no *construct* change reaches the
  synthesized templates;
- the `aws-cdk-lib` bump itself **does** change both synthesized templates, by exactly one resource each: `aws-cdk-lib`
  `2.273.0`'s `FunctionUrlOrigin.withOriginAccessControl` now also creates an `AWS::Lambda::Permission`
  (`InvokeFunctionFromCloudFrontFor*`, action `lambda:InvokeFunction`, `InvokedViaFunctionUrl: true`) alongside the
  pre-existing `InvokeFromApiFor*` (`lambda:InvokeFunctionUrl`); `2.271.0`'s
  `aws-cloudfront-origins/lib/function-url-origin.js` `addInvokePermission()` creates only the first. Each reference site
  therefore gains one permission resource; nothing is removed or reordered;
- the AppTheory runtime code **changes** (unlike the previous patch move): many generated `dist/**` modules differ between
  the `v5.0.1` and `v6.0.0` runtime tarballs, so the esbuild-bundled Lambda asset content — and therefore each reference
  site's `Code.S3Key` — moves. The published manifest raises the `@aws-sdk/*` floor from `^3.1141.0` to `^3.1146.0` and
  moves AppTheory's own transitive `@theory-cloud/tabletheory-ts` pin from `v4.0.1` to `v5.0.0`;
- the TableTheory runtime code **changes** too: generated `dist/**` modules differ between the `v4.0.1` and `v5.0.0`
  tarballs. Its `@aws-sdk/client-dynamodb`, `@aws-sdk/client-kms`, and `@aws-sdk/client-sts` peer ranges are unchanged
  (`^3.1092.0`), so no dependency-floor move reaches the consumers;
- TableTheory `v5.0.0`'s breaking TypeScript change — on the default `TheorydbClient` (`numberUnmarshalMode` `'string'`)
  typed items now declare DynamoDB `N` as `string` and `NS` as `string[]`, and `TheorydbClient` became generic
  (`TheorydbClient<TNumberMode>`) with `model()` returning `InferModelItemForMode<M, TNumberMode>` — is a
  compile-time-only break that **does not reach FaceTheory**: FaceTheory imports only
  `@theory-cloud/tabletheory-ts/facetheory` (`createFaceTheoryIsrMetaStore` and its types), whose `.d.ts` is
  byte-identical between `v4.0.1` and `v5.0.0` (`FaceTheoryIsrMeta.generatedAtMs`/`revalidateSeconds` and
  `FaceTheoryIsrLease.leaseExpiresAtMs` stay `number`), and FaceTheory never constructs a `TheorydbClient` or calls
  `model()`. `tsc -p tsconfig.json --noEmit` and the unit suite pass with no source change;
- the TableTheory `v5.0.0` DMS `v0.2` selected-`omitempty` contract already matched the TypeScript behavior in
  `v4.0.1`, so no persisted-shape change reaches FaceTheory.

Retained history — AppTheory `v5.0.1` / TableTheory `v4.0.1` (previous pin move): AppTheory `v5.0.1` and TableTheory
`v4.0.1` are patch releases on the lines adopted by the previous pin move; the
coordinated major is AppTheory `v5.0.0`, whose Go module path (`github.com/theory-cloud/apptheory/v5`) and Go data
layer (TableTheory `v4.0.0`) axes do not reach FaceTheory, because FaceTheory consumes only the **TypeScript** AppTheory
runtime asset and the **TypeScript** AppTheory CDK asset. The patch move is a dependency-compatibility fix:

- the AppTheory CDK peer floor **moves**: `@theory-cloud/apptheory-cdk` `v5.0.1` declares exact `aws-cdk-lib@2.271.0`
  (was exact `2.270.0`); `constructs@^10.8.1` is unchanged. Because the peer floor is exact, `ts/` and both infra
  examples must move `aws-cdk-lib` to `2.271.0` in the same change — `npm ci` otherwise fails with `ERESOLVE` — so the
  AppTheory CDK pin and the `aws-cdk-lib` pin cannot land separately;
- the AppTheory CDK construct surface is **unchanged**: the `v5.0.0` -> `v5.0.1` diff across the generated `lib/*.js`
  files is the jsii runtime type version string plus a documentation comment on the S3 Vectors `encryptionKey` option,
  so the `AppTheorySsrSite` behavior both reference stacks consume is identical and both templates synthesize unchanged;
- the AppTheory runtime code is **byte-identical**: the only file that differs between the `v5.0.0` and `v5.0.1` runtime
  tarballs is `package.json`, so no exported signature changes and the esbuild-bundled Lambda asset — and therefore the
  infra synth `Code.S3Key` — is unchanged. The published manifest raises the `@aws-sdk/*` floor from `^3.1134.0` to
  `^3.1141.0` and moves AppTheory's own transitive `@theory-cloud/tabletheory-ts` pin from `v4.0.0` to `v4.0.1`;
- the TableTheory runtime code is **byte-identical**: the only file that differs between the `v4.0.0` and `v4.0.1`
  tarballs is `package.json`. Its `@aws-sdk/client-dynamodb`, `@aws-sdk/client-kms`, and `@aws-sdk/client-sts` peer
  ranges are unchanged (`^3.1092.0`); only the dev-only ranges moved, so no exported surface, removed API, or
  persisted-shape change reaches FaceTheory.

Retained history — the AppTheory `v5.0.0` major: no work outlives the Lambda invocation that started it. Task-augmented
`tools/call` runs the tool body inside the invocation, the buffered adapters (HTTP API v2, the Lambda Function URL, the
ALB target group, and the buffered REST v1 shape) drain-and-join a streaming body instead of dropping or detaching it,
and a response body is joined to its producer before the adapter returns. FaceTheory's infra handlers use the **Lambda
Function URL streaming** handler and supply a terminating stream, so there is no detached work to remove. TableTheory
`v4.0.0` removed the ticker-driven memory monitor (`MemoryMonitor.Start` / `Stop`,
`ResourceProtector.StartMemoryMonitoring` / `StopMemoryMonitoring`, `ResourceLimits.MemoryCheckInterval`) in favor of
on-demand `MemoryMonitor.Sample` / `ResourceProtector.SampleMemory` / `ResourceProtector.SetMemoryAlertCallback`;
neither the AppTheory TypeScript runtime nor FaceTheory used the removed API. TableTheory `v4.0.0` also returns
`ErrInvalidOperator` from `ConsistentRead()` on GSI queries and converges `[]byte`/set-tagged DynamoDB write shapes on
the cross-runtime DMS matrix; FaceTheory's ISR metadata store uses base-table key conditions only, so neither change
applies and no persisted-shape migration is required.

Treat future upstream pin moves as dependency compatibility fixes, not release-process bookkeeping. FaceTheory consumers
install immutable GitHub Release tarballs, so a changed upstream baseline needs a normal RC for review before stable
promotion.

## Release Watchpoint

A `staging` -> `premain` PR is always RC intent. If upstream pin maintenance reaches `staging` without a
release-please-eligible `feat:`, `fix:`, or `perf:` commit, `scripts/verify-release-readiness.sh origin/premain
origin/staging prerelease` must fail rather than silently letting Release Please skip the RC. Do not recover with
manual tags, manual GitHub Releases, or `Release-As` footers; land a small, truthful compatibility change on `staging`
and keep the single release lane intact.

## Release Asset SHA-256

Each hash below is the SHA-256 of the downloaded GitHub Release asset, cross-checked against the release's published
AppTheory `SHA256SUMS.txt` (runtime + CDK) and TableTheory `tabletheory-SHA256SUMS.txt` (all three matched; a mismatch is
a release-asset integrity stop condition).

- AppTheory runtime tarball: `f7ed8ced1a747b0b111e8e121e2a49cee3b9beb801713f5efcae6a298ccbd5d1`
- AppTheory CDK tarball: `6ab3c0319d00324ac3d8beeee9404a782d70088efd39f4fad42d0e401f3b2b8a`
- TableTheory TypeScript tarball: `26b9d68e8540a08619903e30c64c79927ea522c1e9634c6f2e68243a54bc0e38`

## Known Audit Exceptions

The gov-infra supply-chain allowlist (`gov-infra/planning/facetheory-supply-chain-allowlist.txt`) is the only place an
`npm audit` finding may be allowed, and `scripts/verify-npm-audit.sh` requires a clean audit in `ts`,
`infra/apptheory-ssr-site`, and `infra/apptheory-ssg-isr-site` otherwise. A scoped exception entry names an exact
advisory set, package, installed version, node path, project list, and UTC expiry; the gate fails on anything outside
those gates and ignores the entry once it expires.

### Active exceptions

None. The allowlist grants no exception; `scripts/verify-npm-audit.sh` fails on any finding that appears.

### Recently cleared

- **bundled `brace-expansion` 5.0.9** — retired by this pin move. The exception's documented removal condition ("must be
  rechecked when `aws-cdk-lib` bundles a fixed `brace-expansion` (>= 5.0.12)") is now met: `aws-cdk-lib@2.273.0`, the
  exact peer of `@theory-cloud/apptheory-cdk` `v6.0.0`, bundles `brace-expansion@5.0.12` at
  `node_modules/aws-cdk-lib/node_modules/brace-expansion` in all three projects, and the three advisories
  (`GHSA-q2hr-2g5m-vwhr`, `GHSA-qhr7-859c-m2p7`, `GHSA-6j4f-fj2g-mc7p`) are fixed at 5.0.10 / 5.0.11 / 5.0.12. The scoped
  allowlist entry was removed rather than re-granted; it expired 2026-11-02, and removal happened first because the
  condition it named was actually satisfied.
- **bundled `brace-expansion`** — `aws-cdk-lib@2.270.0` bundles fixed `brace-expansion@5.0.9`, so the temporary
  `GHSA-mh99-v99m-4gvg` audit exception has been retired across all three projects.
- **top-level `brace-expansion`** — non-bundled dependency paths resolve to fixed `brace-expansion@5.0.9`.
- **`brace-expansion` 4.x/5.x DoS (`GHSA-rgw5-rvv9-x895`)** — cleared at `brace-expansion@5.0.9`, the patched floor for that
  line, in every lockfile. The gov-infra supply-chain allowlist entry was removed rather than re-granted, so the allowlist
  grants no exceptions and `scripts/verify-npm-audit.sh` fails on any finding that appears.
- **`fast-uri`** — AppTheory CDK `v4.3.0` requires `aws-cdk-lib@2.270.0`, and the infra example
  lockfiles now resolve the previous nested `fast-uri` audit finding to the patched AWS CDK dependency set; `fast-uri` no
  longer appears anywhere in the `v4.3.0` / `2.270.0` dependency tree.

## Infra Lockfile Note

The infra example lockfiles intentionally retain AWS CDK bundled-dependency metadata for
`aws-cdk-lib/node_modules/@aws-cdk/cloud-assembly-api`. Keep those nested `inBundle` entries when regenerating the
locks so `npm ci` can validate the AWS CDK package tree under npm 11.

## Install (npm)

```bash
  # AppTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v6.0.0/theory-cloud-apptheory-6.0.0.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v5.0.0/theory-cloud-tabletheory-ts-5.0.0.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v6.0.0/theory-cloud-apptheory-cdk-6.0.0.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v6.0.0/theory-cloud-apptheory-6.0.0.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v5.0.0/theory-cloud-tabletheory-ts-5.0.0.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v5.0.0/theory-cloud-tabletheory-ts-5.0.0.tgz"
    }
  }
}
```

Note: AppTheory `v6.0.0` declares `@theory-cloud/tabletheory-ts` `v5.0.0` transitively, as a pinned GitHub Release tarball URL carrying its own integrity (`…/releases/download/v5.0.0/theory-cloud-tabletheory-ts-5.0.0.tgz#sha512-17WgG31fbj2URjvPTBJDJW0EOzkBXZixLdgWCYyekmfRxc2zzDYMPpa6Gkt90TJUzDVmFxFKCg6Jt4YCWj2y3g==`). The local SHA-512 of the downloaded TableTheory `v5.0.0` tarball, the integrity AppTheory `v6.0.0` declares, and the integrity recorded in all three lockfiles agree. The `overrides` block above is therefore **not load-bearing for the resolved version**: the direct dev dependency and AppTheory's transitive requirement name the same `v5.0.0` tarball URL, so both resolve to a single deduped `v5.0.0` node (`npm ls @theory-cloud/tabletheory-ts` reports `apptheory@6.0.0 -> tabletheory-ts@5.0.0 deduped`, plus the top-level `5.0.0`). The override is retained deliberately as a narrow guard: it keeps FaceTheory's validated TableTheory tarball authoritative under `@theory-cloud/apptheory` even if a future upstream release regresses its transitive declaration. The `ts/` and infra lockfiles also keep that upstream-declared `v5.0.0` string verbatim inside the `@theory-cloud/apptheory` package node — that is AppTheory's own published manifest, not a FaceTheory pin, and it is not editable.
