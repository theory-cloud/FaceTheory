# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v4.4.2`
- AppTheory (CDK): `v4.4.2`
- TableTheory (TypeScript): `v3.1.0`

## Compatibility Impact

The AppTheory `v4.4.2` runtime/CDK pins and the TableTheory `v3.1.0` TypeScript pin are a coordinated
FaceTheory compatibility baseline:

- the AppTheory runtime pin keeps Lambda URL streaming and AppTheory integration examples on the same upstream release
  line as the deployed reference stacks;
- the AppTheory CDK pin keeps the SSR and SSG/ISR infrastructure examples aligned with the runtime tarball they deploy;
- the TableTheory pin keeps ISR cache-entry and regeneration-lease examples on the TableTheory release line FaceTheory
  validates through the package override below;
- the AppTheory CDK peer floor is **unchanged** by this move: `@theory-cloud/apptheory-cdk` `v4.4.2` still declares exact
  `aws-cdk-lib@2.270.0` and `constructs@^10.8.1`, identical to `v4.4.0` and `v4.3.0`, so `ts/` and both infra examples
  keep the `aws-cdk-lib@2.270.0` / `constructs@10.8.1` pair they already pinned and no peer bump accompanies this pin;
- the AppTheory runtime dependency set is **unchanged** by this move: a `diff` of the `v4.4.0` and `v4.4.2` runtime
  tarball `package.json` files reports exactly one changed line, the `version` field.
  `@aws-sdk/s3-request-presigner@^3.1134.0` (added upstream in `v4.4.0` for the bounded object-store upload grant) is
  carried over verbatim, so the regenerated lockfiles resolve no new package and both infra projects add no new audit
  findings;
- AppTheory `v4.4.1` adds one optional construct option, `scopePermissionToRoute` (`@default true`), on `AppTheoryApp`,
  `AppTheoryHttpApi`, `AppTheoryHttpIngestionEndpoint`, `AppTheoryMcpServer`, and `AppTheoryMicrovmController`; `v4.4.2`
  is a version-bump/README rerelease on top of `v4.4.1`. The default preserves the previous
  one-invoke-permission-per-route behavior, so the FaceTheory reference stacks synthesize **byte-identical templates** to
  `v4.4.0` (no snapshot changed), and the `AppTheorySsrSite` construct FaceTheory consumes is unchanged between `v4.4.0`
  and `v4.4.2`. FaceTheory deliberately does **not** adopt the option in this move.

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

- AppTheory runtime tarball: `68ac9ccfaac24370502e98e749f52e4372d63c8136757808ffd62541c368dc0a`
- AppTheory CDK tarball: `d3f306aa11cc7e6f33584b417ca7b889b46206df68b3d605a950a08e8308eb98`
- TableTheory TypeScript tarball: `cda324e3633157470dd11a6881aeb7c7ea318d1a9fd3e497393ae1bcd59df425`

## Known Audit Exceptions

There are no active `npm audit` exceptions for the current upstream baseline. `scripts/verify-npm-audit.sh` requires a
clean audit in `ts`, `infra/apptheory-ssr-site`, and `infra/apptheory-ssg-isr-site`; any reported vulnerability or nonzero
audit exit fails the verifier.

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
  https://github.com/theory-cloud/AppTheory/releases/download/v4.4.2/theory-cloud-apptheory-4.4.2.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v3.1.0/theory-cloud-tabletheory-ts-3.1.0.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v4.4.2/theory-cloud-apptheory-cdk-4.4.2.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v4.4.2/theory-cloud-apptheory-4.4.2.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v3.1.0/theory-cloud-tabletheory-ts-3.1.0.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v3.1.0/theory-cloud-tabletheory-ts-3.1.0.tgz"
    }
  }
}
```

Note: AppTheory `v4.4.2` declares `@theory-cloud/tabletheory-ts` `v3.1.0` transitively, as a pinned GitHub Release tarball URL carrying its own integrity (`…/releases/download/v3.1.0/theory-cloud-tabletheory-ts-3.1.0.tgz#sha512-iK2Zn+aeyP9BnAFAUjq36G6G7ZlP1bulz04aIGCy6lRyOMkRihYZutiAkuABQlIwnGd0FqomrSw4nUvjx3dDYw==`) — the identical TableTheory `v3.1.0` asset `v4.4.0` and `v4.3.0` declared, byte-for-byte unchanged by this move, so this pin move leaves TableTheory untouched. The local SHA-512 of the downloaded TableTheory `v3.1.0` tarball, the integrity AppTheory `v4.4.2` declares, and the integrity recorded in all three lockfiles agree. The `overrides` block above is therefore **still not load-bearing for the resolved version**: the direct dev dependency and AppTheory's transitive requirement name the same `v3.1.0` tarball URL, so both resolve to a single deduped `v3.1.0` node (`npm ls @theory-cloud/tabletheory-ts` reports `apptheory@4.4.2 -> tabletheory-ts@3.1.0 deduped`, plus the top-level `3.1.0`). The override is retained deliberately as a narrow guard: it keeps FaceTheory's validated TableTheory tarball authoritative under `@theory-cloud/apptheory` even if a future upstream release regresses its transitive declaration. The `ts/` and infra lockfiles also keep that upstream-declared `v3.1.0` string verbatim inside the `@theory-cloud/apptheory` package node — that is AppTheory's own published manifest, not a FaceTheory pin, and it is not editable.
