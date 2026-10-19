# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v6.3.0`
- AppTheory (CDK): `v6.3.0`
- TableTheory (TypeScript): `v6.1.0`

## Compatibility Impact

AppTheory `v6.3.0` is a minor-line move inside the `v6` major FaceTheory already consumes, and TableTheory `v6.1.0`
keeps the TypeScript surface FaceTheory imports. FaceTheory consumes only the **TypeScript** AppTheory runtime asset,
the **TypeScript** AppTheory CDK asset, and the **TypeScript** TableTheory asset, so none of the Go axes reach it (the
repo has no `go.mod`, no `*.go` files, and only a `.go-version` pin):

- the AppTheory CDK peer floor is **unchanged**: `@theory-cloud/apptheory-cdk` `v6.3.0` still declares exact
  `aws-cdk-lib@2.273.0` and `constructs@^10.8.1`, so `ts/` and both infra examples stay on `aws-cdk-lib@2.273.0` and no
  CDK bump lands with this move;
- the constructs both reference stacks consume are **unchanged**: `lib/ssr-site.d.ts` (`AppTheorySsrSite`) and
  `lib/dynamo-table.d.ts` (`AppTheoryDynamoTable`) are byte-identical between `v6.2.0` and `v6.3.0`, and their `.js`
  differs only by the jsii runtime type version string. Of the 46 differing `lib/*.js` files, 44 differ by that string
  alone; the two substantive deltas — `lib/rest-api-router.js` and `lib/remote-mcp-server.js` — only add optional
  `authorizer` / `authorizationType` props to the remote MCP construct, which FaceTheory does not use;
- the AppTheory runtime type surface is **stable**: `dist/types.d.ts` is byte-identical between `v6.2.0` and `v6.3.0`
  and `dist/app.d.ts` is unchanged; `dist/context.d.ts` only gains the optional `requestedTenantId` and the
  `policyHookView()` helper, so `tsc -p tsconfig.json --noEmit` and the unit suite pass with no source change;
- the `v6.3.0` **required `RouteRefreshPolicy`** is a startup-breaking change for consumers of AppTheory's
  framework-owned MCP front channel only (`mcpfacade.RegisterMCPFacade` / `registerMcpFacade` with `Provider` set).
  FaceTheory does not consume it: `ts/src`, `ts/test`, and `infra/` contain zero `mcpfacade` / `registerMcpFacade` /
  `RouteRefreshPolicy` references, the reference handlers wire only `createApp` and
  `createLambdaFunctionURLStreamingHandler`, and neither stack constructs `AppTheoryMcpServer`. No FaceTheory path
  registers a facade, so the new validation cannot fire;
- the published manifest keeps the `@aws-sdk/*` floor at `^3.1149.0` and re-pins its transitive
  `@theory-cloud/tabletheory-ts` to the `v6.1.0` tarball. The runtime modules that move are the mcpfacade, MCP store,
  microvm, objectstore, and OAuth-store internals — none of which FaceTheory imports;
- the esbuild-bundled Lambda asset content, and therefore each reference site's `Code.S3Key`, moves with the runtime
  package;
- the TableTheory TypeScript consumer surface FaceTheory uses is **unchanged**: FaceTheory imports only
  `@theory-cloud/tabletheory-ts/facetheory`, whose `dist/facetheory-isr.d.ts` is byte-identical between `v6.0.0` and
  `v6.1.0` (`FaceTheoryIsrMeta.generatedAtMs`/`revalidateSeconds` and `FaceTheoryIsrLease.leaseExpiresAtMs` stay
  `number`). The `v6.1.0` additions — the `jsonStringMode` model option and the encryption-envelope v2 record binding —
  sit outside that surface and are unused;
- the TableTheory `@aws-sdk/client-dynamodb`, `@aws-sdk/client-kms`, and `@aws-sdk/client-sts` peer ranges are unchanged
  (`^3.1092.0`), so the hoisted peer resolutions are restored to their `staging` versions rather than moved;
- no persisted-shape change reaches FaceTheory: the `facetheory-isr` key encoding, marshalling, and written attributes
  are untouched across the `v6.0.0` -> `v6.1.0` move.

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

- AppTheory runtime tarball: `762d336dcbeb88f303b752f40083db0b9d1a4171264b5fa357362164a535e983`
- AppTheory CDK tarball: `33e23d9c7b5f124781ca4ba1116ea7dd2659496013507e1bfe63847ad253f364`
- TableTheory TypeScript tarball: `109fbd52237667ffbdfd2109e70c61477a6b270d56bc08e5b12bc4d0e90847d9`

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
  met: `aws-cdk-lib@2.273.0`, the exact peer of `@theory-cloud/apptheory-cdk` `v6.3.0`, bundles `brace-expansion@5.0.12`
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
  https://github.com/theory-cloud/AppTheory/releases/download/v6.3.0/theory-cloud-apptheory-6.3.0.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v6.1.0/theory-cloud-tabletheory-ts-6.1.0.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v6.3.0/theory-cloud-apptheory-cdk-6.3.0.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v6.3.0/theory-cloud-apptheory-6.3.0.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v6.1.0/theory-cloud-tabletheory-ts-6.1.0.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v6.1.0/theory-cloud-tabletheory-ts-6.1.0.tgz"
    }
  }
}
```

Note: AppTheory `v6.3.0` declares `@theory-cloud/tabletheory-ts` `v6.1.0` transitively, as a pinned GitHub Release tarball URL carrying its own integrity (`…/releases/download/v6.1.0/theory-cloud-tabletheory-ts-6.1.0.tgz#sha512-tNfecWLYU6EYidHxr3KZ3Dn4ZnEdCDDJRztQz/qfcg0yGtVNKU75W82iGoWxUa8N/FgKQ4oGFFTXJR+vi+CISg==`). The local SHA-512 of the downloaded TableTheory `v6.1.0` tarball, the integrity AppTheory `v6.3.0` declares, and the integrity recorded in all three lockfiles agree. The `overrides` block above is therefore **not load-bearing for the resolved version**: the direct dev dependency and AppTheory's transitive requirement name the same `v6.1.0` tarball URL, so both resolve to a single deduped `v6.1.0` node (`npm ls @theory-cloud/tabletheory-ts` reports `apptheory@6.3.0 -> tabletheory-ts@6.1.0 deduped`, plus the top-level `6.1.0`). The override is retained deliberately as a narrow guard: it keeps FaceTheory's validated TableTheory tarball authoritative under `@theory-cloud/apptheory` even if a future upstream release regresses its transitive declaration. The `ts/` and infra lockfiles also keep that upstream-declared `v6.1.0` string verbatim inside the `@theory-cloud/apptheory` package node — that is AppTheory's own published manifest, not a FaceTheory pin, and it is not editable.

`facetheory create` and `facetheory doctor` carry no version constants: the create CLI derives the AppTheory, CDK, and
TableTheory tarball URLs from `ts/package.json` at runtime, and the doctor CLI checks the generated project's override
alignment against the tarball it finds there. Both therefore emit and validate exactly the pins above.
