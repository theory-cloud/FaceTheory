# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v6.4.0`
- AppTheory (CDK): `v6.4.0`
- TableTheory (TypeScript): `v6.1.1`

## Compatibility Impact

AppTheory `v6.4.0` is a minor release inside the `v6` major line FaceTheory already consumes, and it keeps the same
TableTheory `v6.1.1` transitive pin, so the TableTheory asset does not move with this adoption. FaceTheory consumes only
the **TypeScript** AppTheory runtime asset, the **TypeScript** AppTheory CDK asset, and the **TypeScript** TableTheory
asset, so none of the Go axes reach it (the repo has no `go.mod`, no `*.go` files, and only a `.go-version` pin).

The only shipped runtime code change is the opt-in MCP initial-session-listener posture, which FaceTheory does not
reach:

- the AppTheory runtime `dist/` tree contains 304 files in both `v6.3.1` and `v6.4.0`, and exactly 4 differ
  (`dist/mcp/index.js`, `.d.ts`, and their maps). `dist/index.js` and every non-MCP module are byte-identical, and the
  published manifest's only runtime-relevant deltas are the `version` field and the `@aws-sdk/*` floor moving from
  `^3.1149.0` to `^3.1156.0`; the published devDependency/toolchain bumps are not installed by consumers, and the
  TableTheory tarball pin plus its integrity are unchanged. The MCP delta adds an `initialSessionListenerEnabled`
  option (default `true`, i.e. the previous behaviour) that answers the optional common stream with
  `405 Method Not Allowed` when an operator opts out, while GET stays available for `Last-Event-ID` replay;
- FaceTheory does not consume that surface: `ts/src`, `ts/test`, and `infra/` contain zero `mcpfacade` /
  `registerMcpFacade` / `McpServer` references, the reference handlers wire only `createApp` and
  `createLambdaFunctionURLStreamingHandler`, and neither stack constructs `AppTheoryMcpServer`. No FaceTheory path can
  enable or disable the listener, so the new branch cannot fire;
- the esbuild-bundled Lambda asset content, and therefore each reference site's `Code.S3Key`, is **unchanged**: esbuild
  parses `dist/mcp/index.js` (the package entry re-exports it) but emits nothing from it, because FaceTheory imports
  only the app handler surfaces, and a metafile-instrumented bundle of the reference handler contains no
  `initialSessionListenerEnabled` symbol. Both infra synth snapshots pass without regeneration (551.9 kB SSR /
  720.8 kB SSG+ISR, the same bytes the `v6.3.1` snapshots recorded);
- the AppTheory CDK peer floor is **unchanged**: `@theory-cloud/apptheory-cdk` `v6.4.0` still declares exact
  `aws-cdk-lib@2.273.0` and `constructs@^10.8.1`, so `ts/` and both infra examples stay on `aws-cdk-lib@2.273.0` and no
  CDK bump lands with this move;
- the AppTheory CDK assembly has **no substantive code change**: of 153 `lib/` files, 107 are byte-identical and all 46
  that differ do so only in the jsii runtime type version string (`6.3.1` -> `6.4.0`); the `.jsii` assembly differs only
  in its `version` and `fingerprint`. The constructs both reference stacks consume are unchanged and no synthesized
  template moves, which is why the snapshots are stable;
- the raised `@aws-sdk/*` floor moves the transitive AWS SDK graph even though no FaceTheory source changes: npm
  resolves the six AppTheory runtime clients to `3.1156.0` and nests the newer `@aws-sdk/core`, `credential-provider-*`,
  `@aws-sdk/types`, and middleware versions those clients now require. The locks were regenerated with
  `--before=2026-10-26T00:00:00.000Z` so the graph holds at the declared floor (`@aws-sdk/core@3.978.5`,
  `@smithy/core@3.36.2`, matching the existing `@aws-sdk/client-s3@3.1156.0` in this repo) instead of floating to the
  `3.1157.0` line published 2026-10-26;
- the `v6.3` line's **required `RouteRefreshPolicy`** remains a startup-breaking change for consumers of AppTheory's
  framework-owned MCP front channel only (`mcpfacade.RegisterMCPFacade` / `registerMcpFacade` with `Provider` set).
  FaceTheory does not consume it (see above), so the new validation cannot fire.

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

- AppTheory runtime tarball: `2f9b97e30000c159afcf48f4d3df9a6ed9a68a88372f59d03e5bcdd58c22a54c`
- AppTheory CDK tarball: `6592a7438721c30af7d2a04e4cd50f51c887091e32d1022c7c12ebd283e07804`
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
  met: `aws-cdk-lib@2.273.0`, the exact peer of `@theory-cloud/apptheory-cdk` `v6.4.0`, bundles `brace-expansion@5.0.12`
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
though their peer range did not move. Restore those nodes from the prior lock whenever the new pin does not require
them, so each lockfile diff stays scoped to the `@theory-cloud` pin nodes, then confirm the result with a real
`npm ci`.

That restore rule stops at the pinned runtime's own declared dependency floor. AppTheory `v6.4.0` raises its
`@aws-sdk/*` requirement from `^3.1149.0` to `^3.1156.0`, so the six AppTheory runtime clients and the `@aws-sdk/core`,
`credential-provider-*`, `@aws-sdk/types`, and middleware versions they require must move with it; restoring them to
their `v6.3.1` versions would make the lock violate the manifest it installs. This adoption resolved them at that
declared floor (`@aws-sdk/core@3.978.5`, `@smithy/core@3.36.2`) with `--before=2026-10-26T00:00:00.000Z`, deliberately
not floating to the `3.1157.0` line published 2026-10-26.

## Install (npm)

```bash
  # AppTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v6.4.0/theory-cloud-apptheory-6.4.0.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v6.1.1/theory-cloud-tabletheory-ts-6.1.1.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v6.4.0/theory-cloud-apptheory-cdk-6.4.0.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v6.4.0/theory-cloud-apptheory-6.4.0.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v6.1.1/theory-cloud-tabletheory-ts-6.1.1.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v6.1.1/theory-cloud-tabletheory-ts-6.1.1.tgz"
    }
  }
}
```

Note: AppTheory `v6.4.0` declares `@theory-cloud/tabletheory-ts` `v6.1.1` transitively, as a pinned GitHub Release tarball URL carrying its own integrity (`…/releases/download/v6.1.1/theory-cloud-tabletheory-ts-6.1.1.tgz#sha512-g9+SCnBLJ3/OdnLObPpfMLmVn7PDLcLeI0/UBfCOqaNe+WQD+Z6GtYAbIV8UoKaxPG/3kOkZv9cY0UiAPe8s4Q==`). The local SHA-512 of the downloaded TableTheory `v6.1.1` tarball, the integrity AppTheory `v6.4.0` declares, and the integrity recorded in all three lockfiles agree. The `overrides` block above is therefore **not load-bearing for the resolved version**: the direct dev dependency and AppTheory's transitive requirement name the same `v6.1.1` tarball URL, so both resolve to a single deduped `v6.1.1` node (`npm ls @theory-cloud/tabletheory-ts` reports `apptheory@6.4.0 -> tabletheory-ts@6.1.1 deduped`, plus the top-level `6.1.1`). The override is retained deliberately as a narrow guard: it keeps FaceTheory's validated TableTheory tarball authoritative under `@theory-cloud/apptheory` even if a future upstream release regresses its transitive declaration. The `ts/` and infra lockfiles also keep that upstream-declared `v6.1.1` string verbatim inside the `@theory-cloud/apptheory` package node — that is AppTheory's own published manifest, not a FaceTheory pin, and it is not editable.

`facetheory create` and `facetheory doctor` carry no version constants: the create CLI derives the AppTheory, CDK, and
TableTheory tarball URLs from `ts/package.json` at runtime, and the doctor CLI checks the generated project's override
alignment against the tarball it finds there. Both therefore emit and validate exactly the pins above.
