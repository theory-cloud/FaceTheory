# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v1.16.1`
- AppTheory (CDK): `v1.16.1`
- TableTheory (TypeScript): `v2.0.2`

## Compatibility Impact

The AppTheory `v1.16.1` runtime/CDK pins and the TableTheory `v2.0.2` TypeScript pin are a coordinated
FaceTheory compatibility baseline:

- the AppTheory runtime pin keeps Lambda URL streaming and AppTheory integration examples on the same upstream release
  line as the deployed reference stacks;
- the AppTheory CDK pin keeps the SSR and SSG/ISR infrastructure examples aligned with the runtime tarball they deploy;
- the TableTheory pin keeps ISR cache-entry and regeneration-lease examples on the TableTheory release line FaceTheory
  validates through the package override below.

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

- AppTheory runtime tarball: `0023e3cede74cadeeb166120c263bdb9a8c99970016d348da3a64ef08cf91aac`
- AppTheory CDK tarball: `a227364b13cd23c85011a89802ca57fa623c6392c9448c03e0f0cc9e5dbfb2f1`
- TableTheory TypeScript tarball: `f92279ab17f98eab85a30af7370b28efd1afd91d5d24ac81c0a4764de90422bc`

## Known Audit Exceptions

There are no active `npm audit` exceptions for the current upstream baseline. `scripts/verify-npm-audit.sh` fails on any
reported vulnerability in the `ts`, `infra/apptheory-ssr-site`, or `infra/apptheory-ssg-isr-site` workspaces.

FaceTheory still does not repackage AWS dependencies. The `ts` workspace keeps `aws-cdk-lib@2.261.0` only to satisfy the
exact `@theory-cloud/apptheory-cdk@1.16.1` peer used by reference constructs, and the `infra/apptheory-ssr-site` /
`infra/apptheory-ssg-isr-site` workspaces are reference / example deployment shapes that consumer applications reproduce
themselves. If a future AppTheory-compatible CDK line reintroduces a bundled-transitive advisory, treat it as a normal
security fix first; any exception must be narrow, documented here, and reviewed before merging.

### Recently cleared

- **`brace-expansion`** — AppTheory CDK `v1.16.1` requires `aws-cdk-lib@2.261.0`, and the npm audit baseline is now clean
  across the `ts` and `infra/apptheory-*` workspaces.
- **`fast-uri`** — AppTheory CDK `v1.16.1` requires `aws-cdk-lib@2.261.0`, and the infra example
  lockfiles now resolve the previous nested `fast-uri` audit finding to the patched AWS CDK dependency set.

## Infra Lockfile Note

The infra example lockfiles intentionally retain AWS CDK bundled-dependency metadata for
`aws-cdk-lib/node_modules/@aws-cdk/cloud-assembly-api`. Keep those nested `inBundle` entries when regenerating the
locks so `npm ci` can validate the AWS CDK package tree under npm 11.

## Install (npm)

```bash
  # AppTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v1.16.1/theory-cloud-apptheory-1.16.1.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v2.0.2/theory-cloud-tabletheory-ts-2.0.2.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v1.16.1/theory-cloud-apptheory-cdk-1.16.1.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v1.16.1/theory-cloud-apptheory-1.16.1.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v2.0.2/theory-cloud-tabletheory-ts-2.0.2.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v2.0.2/theory-cloud-tabletheory-ts-2.0.2.tgz"
    }
  }
}
```
