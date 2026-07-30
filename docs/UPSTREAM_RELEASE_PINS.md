# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v2.0.2`
- AppTheory (CDK): `v2.0.2`
- TableTheory (TypeScript): `v2.0.6`

## Compatibility Impact

The AppTheory `v2.0.2` runtime/CDK pins and the TableTheory `v2.0.6` TypeScript pin are a coordinated
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

- AppTheory runtime tarball: `56a83d5b8922cec26bc2f25321b6381f72adabfedb8d091055bf7354547bb1da`
- AppTheory CDK tarball: `917a8fb28fe4cfd8adf2dd1d1d153c980df71b8ede2df33eda71d30e6fc945d7`
- TableTheory TypeScript tarball: `6172d4f0c112f16b24d7459ca2e2349577d40b5a512fd9cab4bc2925c8521b70`

## Known Audit Exceptions

One active `npm audit` exception remains for the current upstream baseline:

- **`brace-expansion@5.0.7` / `GHSA-mh99-v99m-4gvg`** — AppTheory CDK `v2.0.2` requires the exact
  `aws-cdk-lib@2.262.2` peer. That AWS CDK tarball bundles `minimatch` and its own nested `brace-expansion@5.0.7`, so npm
  overrides cannot replace the vulnerable copy. The path is used by the CDK infrastructure toolchain during synthesis;
  FaceTheory does not ship it in rendered application or Lambda runtime output. We must wait for the AppTheory-compatible
  AWS CDK bundle to include `brace-expansion@5.0.8` or newer rather than forking or repackaging an AWS dependency.

`scripts/verify-npm-audit.sh` accepts that finding only when the package name, advisory URL, single nested
`node_modules/aws-cdk-lib/node_modules/brace-expansion` path, affected workspace, and bundled version all match. The
exception expires on `2026-08-15` for mandatory re-review, and the verifier fails if AWS CDK's bundled version changes so
the exception cannot survive its upstream fix. Every other audit finding still fails in `ts`,
`infra/apptheory-ssr-site`, and `infra/apptheory-ssg-isr-site`.

### Recently cleared

- **top-level `brace-expansion`** — non-bundled dependency paths resolve to fixed `brace-expansion@5.0.9`; only the exact
  AWS CDK bundled path described above remains excepted.
- **`fast-uri`** — AppTheory CDK `v2.0.2` requires `aws-cdk-lib@2.262.2`, and the infra example
  lockfiles now resolve the previous nested `fast-uri` audit finding to the patched AWS CDK dependency set.

## Infra Lockfile Note

The infra example lockfiles intentionally retain AWS CDK bundled-dependency metadata for
`aws-cdk-lib/node_modules/@aws-cdk/cloud-assembly-api`. Keep those nested `inBundle` entries when regenerating the
locks so `npm ci` can validate the AWS CDK package tree under npm 11.

## Install (npm)

```bash
  # AppTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v2.0.2/theory-cloud-apptheory-2.0.2.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v2.0.6/theory-cloud-tabletheory-ts-2.0.6.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v2.0.2/theory-cloud-apptheory-cdk-2.0.2.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v2.0.2/theory-cloud-apptheory-2.0.2.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v2.0.6/theory-cloud-tabletheory-ts-2.0.6.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v2.0.6/theory-cloud-tabletheory-ts-2.0.6.tgz"
    }
  }
}
```
