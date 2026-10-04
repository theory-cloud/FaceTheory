# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v5.0.0`
- AppTheory (CDK): `v5.0.0`
- TableTheory (TypeScript): `v4.0.0`

## Compatibility Impact

AppTheory `v5.0.0` is a coordinated major on two axes: the Go module path moves to the next semantic import version
(`github.com/theory-cloud/apptheory/v5`) and the Go data layer moves to TableTheory `v4.0.0`. FaceTheory consumes only
the **TypeScript** AppTheory runtime asset and the **TypeScript** AppTheory CDK asset — no AppTheory Go module and no
generated Go CDK bindings — so the Go module-path axis of the major reaches no FaceTheory package. The axes that do
reach FaceTheory are the TableTheory `v4.0.0` floor and the v5 invocation-scoped runtime behavior:

- the AppTheory CDK peer floor is **unchanged** by this move: `@theory-cloud/apptheory-cdk` `v5.0.0` still declares exact
  `aws-cdk-lib@2.270.0` and `constructs@^10.8.1`, identical to `v4.4.2`, so `ts/` and both infra examples keep the
  `aws-cdk-lib@2.270.0` / `constructs@10.8.1` pair they already pinned and no peer bump accompanies this pin;
- the AppTheory runtime dependency set is **unchanged** by this move: the `v4.4.2` and `v5.0.0` runtime tarball
  `package.json` files declare the identical `@aws-sdk/*@^3.1134.0` set (including
  `@aws-sdk/s3-request-presigner@^3.1134.0`, added upstream in `v4.4.0` for the bounded object-store upload grant); the
  only difference is AppTheory's own transitive `@theory-cloud/tabletheory-ts` pin (`v3.1.0` -> `v4.0.0`), so the
  regenerated lockfiles resolve no new package and both infra projects add no new audit findings;
- AppTheory `v4.5.0` is a CDK-only feature release: an optional `onFailure` destination on
  `AppTheoryDynamoDBStreamMapping` and `AppTheoryKinesisStreamMapping` that defaults off and emits no `DestinationConfig`
  when omitted. FaceTheory configures neither mapping, so the `v4.4.2` -> `v5.0.0` CDK surface FaceTheory consumes is
  behaviorally unchanged and both reference stacks synthesize the same templates;
- AppTheory `v5.0.0` is a **behavioral** major for every runtime: no work outlives the Lambda invocation that started
  it. Task-augmented `tools/call` runs the tool body inside the invocation, the buffered adapters (HTTP API v2, the
  Lambda Function URL, the ALB target group, and the buffered REST v1 shape) drain-and-join a streaming body instead of
  dropping or detaching it, and a response body is joined to its producer before the adapter returns. FaceTheory's infra
  handlers use the **Lambda Function URL streaming** handler and supply a terminating stream, so there is no detached
  work to remove. No exported signature changed in this line;
- TableTheory `v4.0.0` removes the ticker-driven memory monitor (`MemoryMonitor.Start` / `Stop`,
  `ResourceProtector.StartMemoryMonitoring` / `StopMemoryMonitoring`, and `ResourceLimits.MemoryCheckInterval`) in favor
  of on-demand `MemoryMonitor.Sample` / `ResourceProtector.SampleMemory` / `ResourceProtector.SetMemoryAlertCallback`.
  Neither the AppTheory TypeScript runtime nor FaceTheory used the removed API. TableTheory `v4.0.0` also returns
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

- AppTheory runtime tarball: `61417f6134988b32cc836be9bdd92b4d4ccf207367f2925c8e047bacbad87df3`
- AppTheory CDK tarball: `5a76b352ada408cf8eba1a6feb5e53c8d7a9aa54beeacefe9e7b1143f2dc78f1`
- TableTheory TypeScript tarball: `2639c3bd5f8e06dc8cc8062d0cb171b8c43749edb858273fea3c195b23fe7fd4`

## Known Audit Exceptions

The gov-infra supply-chain allowlist (`gov-infra/planning/facetheory-supply-chain-allowlist.txt`) is the only place an
`npm audit` finding may be allowed, and `scripts/verify-npm-audit.sh` requires a clean audit in `ts`,
`infra/apptheory-ssr-site`, and `infra/apptheory-ssg-isr-site` otherwise. A scoped exception entry names an exact
advisory set, package, installed version, node path, project list, and UTC expiry; the gate fails on anything outside
those gates and ignores the entry once it expires.

### Active exceptions

- **bundled `brace-expansion` 5.0.9** — `aws-cdk-lib@2.271.0` bundles `brace-expansion@5.0.9` at
  `node_modules/aws-cdk-lib/node_modules/brace-expansion` in all three projects. The three advisories below are fixed
  only at 5.0.10 / 5.0.11 / 5.0.12, which no AppTheory-compatible `aws-cdk-lib` line bundles yet. FaceTheory does not
  repackage AWS dependencies (operator ruling 2026-10-03: "if a vulnerable dependency is bundled in AWS we make an
  exception until its updated there"), so a scoped allowlist exception covers this exact copy only:
  `GHSA-q2hr-2g5m-vwhr`, `GHSA-qhr7-859c-m2p7`, `GHSA-6j4f-fj2g-mc7p`. The entry expires **2026-11-02** and must be
  rechecked when `aws-cdk-lib` bundles a fixed `brace-expansion` (>= 5.0.12).

### Recently cleared

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
  https://github.com/theory-cloud/AppTheory/releases/download/v5.0.0/theory-cloud-apptheory-5.0.0.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v4.0.0/theory-cloud-tabletheory-ts-4.0.0.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v5.0.0/theory-cloud-apptheory-cdk-5.0.0.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v5.0.0/theory-cloud-apptheory-5.0.0.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v4.0.0/theory-cloud-tabletheory-ts-4.0.0.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v4.0.0/theory-cloud-tabletheory-ts-4.0.0.tgz"
    }
  }
}
```

Note: AppTheory `v5.0.0` declares `@theory-cloud/tabletheory-ts` `v4.0.0` transitively, as a pinned GitHub Release tarball URL carrying its own integrity (`…/releases/download/v4.0.0/theory-cloud-tabletheory-ts-4.0.0.tgz#sha512-qw/8a6sy5pYk6kO1eP/sO0aCNPALyEQZwHbe5FGBnqBCM6dzhfMdHFW2TkJRuDg4+5JquUZBYCWr561ooObOOA==`). The local SHA-512 of the downloaded TableTheory `v4.0.0` tarball, the integrity AppTheory `v5.0.0` declares, and the integrity recorded in all three lockfiles agree. The `overrides` block above is therefore **not load-bearing for the resolved version**: the direct dev dependency and AppTheory's transitive requirement name the same `v4.0.0` tarball URL, so both resolve to a single deduped `v4.0.0` node (`npm ls @theory-cloud/tabletheory-ts` reports `apptheory@5.0.0 -> tabletheory-ts@4.0.0 deduped`, plus the top-level `4.0.0`). The override is retained deliberately as a narrow guard: it keeps FaceTheory's validated TableTheory tarball authoritative under `@theory-cloud/apptheory` even if a future upstream release regresses its transitive declaration. The `ts/` and infra lockfiles also keep that upstream-declared `v4.0.0` string verbatim inside the `@theory-cloud/apptheory` package node — that is AppTheory's own published manifest, not a FaceTheory pin, and it is not editable.
