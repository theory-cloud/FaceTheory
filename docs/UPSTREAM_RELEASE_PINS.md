# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v6.2.0`
- AppTheory (CDK): `v6.2.0`
- TableTheory (TypeScript): `v6.0.0`

## Compatibility Impact

AppTheory `v6.2.0` is a minor-line move inside the `v6` major FaceTheory already consumes, and TableTheory `v6.0.0` is a
major whose TypeScript package keeps the same consumer surface. FaceTheory consumes only the **TypeScript** AppTheory
runtime asset, the **TypeScript** AppTheory CDK asset, and the **TypeScript** TableTheory asset, so none of the Go axes
reach it (the repo has no `go.mod`, no `*.go` files, and only a `.go-version` pin):

- the AppTheory CDK peer floor is **unchanged**: `@theory-cloud/apptheory-cdk` `v6.2.0` still declares exact
  `aws-cdk-lib@2.273.0` and `constructs@^10.8.1`, so `ts/` and both infra examples stay on `aws-cdk-lib@2.273.0` and no
  CDK bump lands with this move;
- the constructs both reference stacks consume are **unchanged**: the `v6.0.0` -> `v6.2.0` diff for `lib/ssr-site.js`
  (`AppTheorySsrSite`) and `lib/dynamo-table.js` (`AppTheoryDynamoTable`) is the jsii runtime type version string and
  nothing else. AppTheory `v6.1.0`/`v6.2.0` added constructs and props FaceTheory does not use — the MCP route model
  (`AppTheoryMcpServer.routeModel` / `routeIdMode`), the `AppTheoryHttpApi` explicit `routes` and validated
  `routeSettings`, and `AppTheoryRestV1ChallengeRestoration` — so no construct change reaches the synthesized templates;
- the AppTheory runtime code **changes**, so the esbuild-bundled Lambda asset content — and therefore each reference
  site's `Code.S3Key` — moves. The runtime deltas are additive or internal: the server-issued request-ID source
  (`requestIdSource`, `ctx.clientRequestId`, stricter `x-request-id` validation), the always-present nested
  `error.status_code`, the routed MCP facade metadata (`authorization_response_iss_parameter_supported`), the
  `registerMcpFacadeSecure` companion, and the OAuth provider hint validation. The published manifest raises the
  `@aws-sdk/*` floor from `^3.1146.0` to `^3.1149.0` and pins its transitive `@theory-cloud/tabletheory-ts` to the
  `v6.0.0` tarball;
- FaceTheory's AppTheory adapter touches only the stable type surface: `Context`, `Handler`, `Request`, and `Response`
  from `@theory-cloud/apptheory` (the first two as `import type`), `ctx.requestId`/`ctx.request` reads, and the testkit's
  `createTestEnv`/`buildLambdaFunctionURLRequest`. `dist/types.d.ts` is byte-identical between `v6.0.0` and `v6.2.0`,
  and `dist/context.d.ts` / `dist/app.d.ts` only gain optional members, so `tsc -p tsconfig.json --noEmit` and the unit
  suite pass with no source change. The stricter client `x-request-id` handling is inherited upstream behavior, not a
  FaceTheory edit;
- the TableTheory TypeScript consumer surface is **unchanged**: TableTheory `v6.0.0` is a Go-only major (module path
  `/v6` and `LambdaDB.WithLambdaTimeout` returning `core.DB`, per `docs/migration/v6.md`), and FaceTheory imports only
  `@theory-cloud/tabletheory-ts/facetheory`, whose `dist/facetheory-isr.d.ts` is byte-identical across the TableTheory
  v5 and v6 TypeScript packages (`FaceTheoryIsrMeta.generatedAtMs`/`revalidateSeconds` and
  `FaceTheoryIsrLease.leaseExpiresAtMs` stay `number`). FaceTheory never constructs a `TheorydbClient` and never calls
  `model()`. The generated `dist/**` modules do differ, so the bundled ISR handler asset moves with the AppTheory change;
- the TableTheory `@aws-sdk/client-dynamodb`, `@aws-sdk/client-kms`, and `@aws-sdk/client-sts` peer ranges are unchanged
  (`^3.1092.0`), so the hoisted peer resolutions are restored rather than moved;
- no persisted-shape change reaches FaceTheory: TableTheory `v6.0.0` keeps the `v5` key encoding, marshalling, and
  written attributes, and the DMS `v0.2` selected-`omitempty` contract is unchanged.

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

## Release Asset SHA-256

Each hash below is the SHA-256 of the downloaded GitHub Release asset, cross-checked against the release's published
AppTheory `SHA256SUMS.txt` (runtime + CDK) and TableTheory `tabletheory-SHA256SUMS.txt` (all three matched; a mismatch is
a release-asset integrity stop condition).

- AppTheory runtime tarball: `de84c9ea26508dfeba635f582caa0f4b90a214d5170de6c7f93c59ae4a219af9`
- AppTheory CDK tarball: `8f66727a6b68d5497637971f2b273016eb3a35b7ab122a035694ecc2217baa63`
- TableTheory TypeScript tarball: `bb40ed7a7be26e171eb7bccdd79437a6c76bfd0d5f1273019ada0474bc5bced9`

## Known Audit Exceptions

The gov-infra supply-chain allowlist (`gov-infra/planning/facetheory-supply-chain-allowlist.txt`) is the only place an
`npm audit` finding may be allowed, and `scripts/verify-npm-audit.sh` requires a clean audit in `ts`,
`infra/apptheory-ssr-site`, and `infra/apptheory-ssg-isr-site` otherwise. A scoped exception entry names an exact
advisory set, package, installed version, node path, project list, and UTC expiry; the gate fails on anything outside
those gates and ignores the entry once it expires.

### Active exceptions

None. The allowlist grants no exception; `scripts/verify-npm-audit.sh` fails on any finding that appears.

### Recently cleared

- **bundled `brace-expansion` 5.0.9** — retired by the AppTheory v6 CDK pin move and kept retired here. The exception's
  documented removal condition ("must be rechecked when `aws-cdk-lib` bundles a fixed `brace-expansion` (>= 5.0.12)") is
  met: `aws-cdk-lib@2.273.0`, the exact peer of `@theory-cloud/apptheory-cdk` `v6.2.0`, bundles `brace-expansion@5.0.12`
  at `node_modules/aws-cdk-lib/node_modules/brace-expansion` in all three projects, and the three advisories
  (`GHSA-q2hr-2g5m-vwhr`, `GHSA-qhr7-859c-m2p7`, `GHSA-6j4f-fj2g-mc7p`) are fixed at 5.0.10 / 5.0.11 / 5.0.12. The scoped
  allowlist entry was removed rather than re-granted; it expired 2026-11-02, and removal happened first because the
  condition it named was actually satisfied.
- **top-level `brace-expansion`** — non-bundled dependency paths resolve to fixed `brace-expansion@5.0.12`.

## Infra Lockfile Note

The infra example lockfiles intentionally retain AWS CDK bundled-dependency metadata for
`aws-cdk-lib/node_modules/@aws-cdk/cloud-assembly-api`. Keep those nested `inBundle` entries when regenerating the
locks so `npm ci` can validate the AWS CDK package tree under npm 11.

## Install (npm)

```bash
  # AppTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v6.2.0/theory-cloud-apptheory-6.2.0.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v6.0.0/theory-cloud-tabletheory-ts-6.0.0.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v6.2.0/theory-cloud-apptheory-cdk-6.2.0.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v6.2.0/theory-cloud-apptheory-6.2.0.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v6.0.0/theory-cloud-tabletheory-ts-6.0.0.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v6.0.0/theory-cloud-tabletheory-ts-6.0.0.tgz"
    }
  }
}
```

Note: AppTheory `v6.2.0` declares `@theory-cloud/tabletheory-ts` `v6.0.0` transitively, as a pinned GitHub Release tarball URL carrying its own integrity (`…/releases/download/v6.0.0/theory-cloud-tabletheory-ts-6.0.0.tgz#sha512-sJafPYwl9o6ZvMkSxGVpwq7F/pbexq168Vxo8vlIjR2t+D7n+1+gdzWEoOFTplMg8N+r8KIt9flAjADIyNwsDA==`). The local SHA-512 of the downloaded TableTheory `v6.0.0` tarball, the integrity AppTheory `v6.2.0` declares, and the integrity recorded in all three lockfiles agree. The `overrides` block above is therefore **not load-bearing for the resolved version**: the direct dev dependency and AppTheory's transitive requirement name the same `v6.0.0` tarball URL, so both resolve to a single deduped `v6.0.0` node (`npm ls @theory-cloud/tabletheory-ts` reports `apptheory@6.2.0 -> tabletheory-ts@6.0.0 deduped`, plus the top-level `6.0.0`). The override is retained deliberately as a narrow guard: it keeps FaceTheory's validated TableTheory tarball authoritative under `@theory-cloud/apptheory` even if a future upstream release regresses its transitive declaration. The `ts/` and infra lockfiles also keep that upstream-declared `v6.0.0` string verbatim inside the `@theory-cloud/apptheory` package node — that is AppTheory's own published manifest, not a FaceTheory pin, and it is not editable.

`facetheory create` and `facetheory doctor` carry no version constants: the create CLI derives the AppTheory, CDK, and
TableTheory tarball URLs from `ts/package.json` at runtime, and the doctor CLI checks the generated project's override
alignment against the tarball it finds there. Both therefore emit and validate exactly the pins above.
