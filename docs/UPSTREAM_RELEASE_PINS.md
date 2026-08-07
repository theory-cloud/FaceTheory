# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v3.0.2`
- AppTheory (CDK): `v3.0.2`
- TableTheory (TypeScript): `v3.0.4`

## Compatibility Impact

The AppTheory `v3.0.2` runtime/CDK pins and the TableTheory `v3.0.4` TypeScript pin are a coordinated
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

- AppTheory runtime tarball: `8251003a245470f9718e014ae4792761127ab1c1d9c89c75b4d85aa8302d41a4`
- AppTheory CDK tarball: `201b0a2d4ac2145c71404d27532eb58c01eb46e5e170679bd52106d977f99381`
- TableTheory TypeScript tarball: `ec622601a39c6068b47cf90aa08fff5eff7defc7ce2f47645e54fddbdd12ea1b`

## Known Audit Exceptions

There are no active `npm audit` exceptions for the current upstream baseline. `scripts/verify-npm-audit.sh` requires a
clean audit in `ts`, `infra/apptheory-ssr-site`, and `infra/apptheory-ssg-isr-site`; any reported vulnerability or nonzero
audit exit fails the verifier.

### Recently cleared

- **bundled `brace-expansion`** — `aws-cdk-lib@2.263.0` bundles fixed `brace-expansion@5.0.8`, so the temporary
  `GHSA-mh99-v99m-4gvg` audit exception has been retired across all three projects.
- **top-level `brace-expansion`** — non-bundled dependency paths resolve to fixed `brace-expansion@5.0.9`.
- **`fast-uri`** — AppTheory CDK `v3.0.2` requires `aws-cdk-lib@2.263.0`, and the infra example
  lockfiles now resolve the previous nested `fast-uri` audit finding to the patched AWS CDK dependency set.

## Infra Lockfile Note

The infra example lockfiles intentionally retain AWS CDK bundled-dependency metadata for
`aws-cdk-lib/node_modules/@aws-cdk/cloud-assembly-api`. Keep those nested `inBundle` entries when regenerating the
locks so `npm ci` can validate the AWS CDK package tree under npm 11.

## Install (npm)

```bash
  # AppTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v3.0.2/theory-cloud-apptheory-3.0.2.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v3.0.4/theory-cloud-tabletheory-ts-3.0.4.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v3.0.2/theory-cloud-apptheory-cdk-3.0.2.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v3.0.2/theory-cloud-apptheory-3.0.2.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v3.0.4/theory-cloud-tabletheory-ts-3.0.4.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v3.0.4/theory-cloud-tabletheory-ts-3.0.4.tgz"
    }
  }
}
```
