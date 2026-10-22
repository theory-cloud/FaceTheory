# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v6.3.1`
- AppTheory (CDK): `v6.3.1`
- TableTheory (TypeScript): `v6.1.1`

## Compatibility Impact

AppTheory `v6.3.1` and TableTheory `v6.1.1` are patch re-cuts inside the `v6` major lines FaceTheory already consumes.
FaceTheory consumes only the **TypeScript** AppTheory runtime asset, the **TypeScript** AppTheory CDK asset, and the
**TypeScript** TableTheory asset, so none of the Go axes reach it (the repo has no `go.mod`, no `*.go` files, and only a
`.go-version` pin).

Both TypeScript runtime packages are **byte-for-byte code-identical** to the versions they replace, so this move
changes nothing FaceTheory executes:

- the AppTheory runtime `dist/` tree is byte-identical between `v6.3.0` and `v6.3.1` across all 138 files. The only
  published-manifest deltas are the `version` field and the transitive `@theory-cloud/tabletheory-ts` pin, which moves
  from the `v6.1.0` to the `v6.1.1` tarball. `tsc -p tsconfig.json --noEmit` and the unit suite therefore pass with no
  source change, and the AppTheory `CHANGELOG.md` carries no `6.3.1` section because no shipped code moved;
- the TableTheory runtime `dist/` tree is byte-identical between `v6.1.0` and `v6.1.1` across all 154 files, and the
  only manifest delta is the `version` field. The upstream release is recorded as "Stable promotion of `v6.1.1-rc`";
  `dist/facetheory-isr.d.ts` — the surface FaceTheory imports from `@theory-cloud/tabletheory-ts/facetheory` — is
  unchanged, and the `facetheory-isr` key encoding, marshalling, and written attributes are untouched;
- the esbuild-bundled Lambda asset content, and therefore each reference site's `Code.S3Key`, is **unchanged**, because
  the bundled runtime bytes do not move. The infra synth snapshots pass without regeneration;
- the AppTheory CDK peer floor is **unchanged**: `@theory-cloud/apptheory-cdk` `v6.3.1` still declares exact
  `aws-cdk-lib@2.273.0` and `constructs@^10.8.1`, so `ts/` and both infra examples stay on `aws-cdk-lib@2.273.0` and no
  CDK bump lands with this move;
- the constructs both reference stacks consume are **unchanged**: `lib/ssr-site.d.ts` (`AppTheorySsrSite`) and
  `lib/dynamo-table.d.ts` (`AppTheoryDynamoTable`) are byte-identical between `v6.3.0` and `v6.3.1`. Of the 46 differing
  `lib/*.js` files, 43 differ by the jsii runtime type version string alone and 2 (`lib/app.js`, `lib/function.js`) by
  their inline sourcemap only; the single substantive delta is one line in `lib/vector-index.js`
  (`this.index.addDependency` -> `this.index.addResourceDependency`), a CDK deprecation fix in a construct FaceTheory
  never instantiates. No synthesized template changes, which is why the snapshots are stable;
- the published AppTheory manifest keeps the `@aws-sdk/*` floor at `^3.1149.0`;
- the TableTheory `@aws-sdk/client-dynamodb`, `@aws-sdk/client-kms`, and `@aws-sdk/client-sts` peer ranges are unchanged
  (`^3.1092.0`), so the hoisted peer resolutions are restored to their `staging` versions rather than moved;
- the `v6.3` line's **required `RouteRefreshPolicy`** remains a startup-breaking change for consumers of AppTheory's
  framework-owned MCP front channel only (`mcpfacade.RegisterMCPFacade` / `registerMcpFacade` with `Provider` set).
  FaceTheory does not consume it: `ts/src`, `ts/test`, and `infra/` contain zero `mcpfacade` / `registerMcpFacade` /
  `RouteRefreshPolicy` references, the reference handlers wire only `createApp` and
  `createLambdaFunctionURLStreamingHandler`, and neither stack constructs `AppTheoryMcpServer`. No FaceTheory path
  registers a facade, so the new validation cannot fire.

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

- AppTheory runtime tarball: `dd9b6839d1f2e4191ef588dbd21daba4382d3a18648eb4eb885d38ff017c4e93`
- AppTheory CDK tarball: `e7d6665df08f94f5f11754c7d8a88a0cf0a1c0502e6ec84aa382495a8cfd0de3`
- TableTheory TypeScript tarball: `6b32f14664584d0a6580f50465d8b4510c43c00252e3c621155d2a79f18c71df`

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
  met: `aws-cdk-lib@2.273.0`, the exact peer of `@theory-cloud/apptheory-cdk` `v6.3.1`, bundles `brace-expansion@5.0.12`
  at `node_modules/aws-cdk-lib/node_modules/brace-expansion` in all three projects, and the three advisories
  (`GHSA-q2hr-2g5m-vwhr`, `GHSA-qhr7-859c-m2p7`, `GHSA-6j4f-fj2g-mc7p`) are fixed at 5.0.10 / 5.0.11 / 5.0.12. The scoped
  allowlist entry was removed rather than re-granted; it expired 2026-11-02, and removal happened first because the
  condition it named was actually satisfied.
- **top-level `brace-expansion`** — non-bundled dependency paths resolve to fixed `brace-expansion@5.0.12`.

## Infra Lockfile Note

The infra example lockfiles intentionally retain AWS CDK bundled-dependency metadata for
`aws-cdk-lib/node_modules/@aws-cdk/cloud-assembly-api`. Keep those nested `inBundle` entries when regenerating the
locks so `npm ci` can validate the AWS CDK package tree under npm 11.

A `npm install --package-lock-only` run also re-resolves the peer-only `@aws-sdk/client-dynamodb`,
`@aws-sdk/client-kms`, and `@aws-sdk/client-sts` nodes (plus their `@aws-sdk/*` and `@smithy/*` transitives) even
though their peer range did not move. Restore those nodes from the prior lock so each lockfile diff stays scoped to the
three `@theory-cloud` pin nodes, then confirm the result with a real `npm ci`.

## Install (npm)

```bash
  # AppTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v6.3.1/theory-cloud-apptheory-6.3.1.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v6.1.1/theory-cloud-tabletheory-ts-6.1.1.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v6.3.1/theory-cloud-apptheory-cdk-6.3.1.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v6.3.1/theory-cloud-apptheory-6.3.1.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v6.1.1/theory-cloud-tabletheory-ts-6.1.1.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v6.1.1/theory-cloud-tabletheory-ts-6.1.1.tgz"
    }
  }
}
```

Note: AppTheory `v6.3.1` declares `@theory-cloud/tabletheory-ts` `v6.1.1` transitively, as a pinned GitHub Release tarball URL carrying its own integrity (`…/releases/download/v6.1.1/theory-cloud-tabletheory-ts-6.1.1.tgz#sha512-g9+SCnBLJ3/OdnLObPpfMLmVn7PDLcLeI0/UBfCOqaNe+WQD+Z6GtYAbIV8UoKaxPG/3kOkZv9cY0UiAPe8s4Q==`). The local SHA-512 of the downloaded TableTheory `v6.1.1` tarball, the integrity AppTheory `v6.3.1` declares, and the integrity recorded in all three lockfiles agree. The `overrides` block above is therefore **not load-bearing for the resolved version**: the direct dev dependency and AppTheory's transitive requirement name the same `v6.1.1` tarball URL, so both resolve to a single deduped `v6.1.1` node (`npm ls @theory-cloud/tabletheory-ts` reports `apptheory@6.3.1 -> tabletheory-ts@6.1.1 deduped`, plus the top-level `6.1.1`). The override is retained deliberately as a narrow guard: it keeps FaceTheory's validated TableTheory tarball authoritative under `@theory-cloud/apptheory` even if a future upstream release regresses its transitive declaration. The `ts/` and infra lockfiles also keep that upstream-declared `v6.1.1` string verbatim inside the `@theory-cloud/apptheory` package node — that is AppTheory's own published manifest, not a FaceTheory pin, and it is not editable.

`facetheory create` and `facetheory doctor` carry no version constants: the create CLI derives the AppTheory, CDK, and
TableTheory tarball URLs from `ts/package.json` at runtime, and the doctor CLI checks the generated project's override
alignment against the tarball it finds there. Both therefore emit and validate exactly the pins above.
