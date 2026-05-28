# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v1.12.0`
- AppTheory (CDK): `v1.12.0`
- TableTheory (TypeScript): `v1.8.4`

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

- **`fast-uri`** — AppTheory CDK `v1.12.0` requires `aws-cdk-lib@2.257.0`, and the infra example
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
  https://github.com/theory-cloud/AppTheory/releases/download/v1.12.0/theory-cloud-apptheory-1.12.0.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v1.8.4/theory-cloud-tabletheory-ts-1.8.4.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v1.12.0/theory-cloud-apptheory-cdk-1.12.0.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v1.12.0/theory-cloud-apptheory-1.12.0.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v1.8.4/theory-cloud-tabletheory-ts-1.8.4.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v1.8.4/theory-cloud-tabletheory-ts-1.8.4.tgz"
    }
  }
}
```
