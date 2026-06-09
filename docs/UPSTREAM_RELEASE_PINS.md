# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v1.13.0`
- AppTheory (CDK): `v1.13.0`
- TableTheory (TypeScript): `v1.10.0`

## Compatibility Impact

The AppTheory `v1.13.0` runtime/CDK pins and the TableTheory `v1.10.0` TypeScript pin are a coordinated
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

- AppTheory runtime tarball: `86fd1da349ca5aaacba3cbe785f552c6d00d037a0dfb88ecbfd2ff9319e2fd06`
- AppTheory CDK tarball: `337cc28696594e512a4c32e5ee1f4394234154a6904f4b9a29920273577e5143`
- TableTheory TypeScript tarball: `7c6fa748c4dd08d1f3cb759a5b91eaef1985b2bee52fa25238273ba7e9345e84`

## Known Audit Exceptions

FaceTheory does not repackage AWS dependencies. The `infra/apptheory-ssr-site` and
`infra/apptheory-ssg-isr-site` workspaces are reference / example deployment shapes that
consumer applications reproduce themselves; the `aws-cdk-lib` tarball bundles its own
`node_modules/` for some transitives, and FaceTheory cannot ship a patched version of those
without forking AWS CDK. The exceptions below are narrowly scoped to one specific package
name, one nested path inside `aws-cdk-lib/node_modules/`, one set of advisory URLs, and
the `infra/apptheory-*` workspaces only. Anything outside those gates is still treated as
`FAIL` by `scripts/verify-npm-audit.sh`.

### Active exceptions

- **`brace-expansion`** — [GHSA-jxxr-4gwj-5jf2](https://github.com/advisories/GHSA-jxxr-4gwj-5jf2)
  ("Large numeric range defeats documented `max` DoS protection"), moderate severity.
  Present transitively at `node_modules/aws-cdk-lib/node_modules/brace-expansion` in the
  `infra/apptheory-*` workspaces because the `aws-cdk-lib` tarball bundles its own copy.
  The FaceTheory package surface (`ts/`) was cleared in THE-1460 / PR #220 (transitive
  `brace-expansion` upgraded `5.0.5` → `5.0.6` in `ts/package-lock.json`). The bundled
  copy under `aws-cdk-lib` is upstream AWS's to ship; the exception will be removed once an
  `aws-cdk-lib` release vendors a patched `brace-expansion` (≥ `5.0.6`).

### Recently cleared

- **`fast-uri`** — AppTheory CDK `v1.13.0` requires `aws-cdk-lib@2.257.0`, and the infra example
  lockfiles now resolve the previous nested `fast-uri` audit finding to the patched AWS CDK
  dependency set. The `fast-uri` allowlist in `scripts/verify-npm-audit.sh` is kept as a
  belt-and-suspenders guard against future regressions; remove it when `aws-cdk-lib` no
  longer bundles `fast-uri` at all.

## Infra Lockfile Note

The infra example lockfiles intentionally retain AWS CDK bundled-dependency metadata for
`aws-cdk-lib/node_modules/@aws-cdk/cloud-assembly-api`. Keep those nested `inBundle` entries when regenerating the
locks so `npm ci` can validate the AWS CDK package tree under npm 11.

## Install (npm)

```bash
  # AppTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v1.13.0/theory-cloud-apptheory-1.13.0.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v1.10.0/theory-cloud-tabletheory-ts-1.10.0.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v1.13.0/theory-cloud-apptheory-cdk-1.13.0.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v1.13.0/theory-cloud-apptheory-1.13.0.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v1.10.0/theory-cloud-tabletheory-ts-1.10.0.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v1.10.0/theory-cloud-tabletheory-ts-1.10.0.tgz"
    }
  }
}
```
