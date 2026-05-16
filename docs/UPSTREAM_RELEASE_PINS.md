# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v1.6.0`
- AppTheory (CDK): `v1.6.0`
- TableTheory (TypeScript): `v1.8.3`

## Known Audit Exception

None currently. AppTheory CDK `v1.6.0` requires `aws-cdk-lib@2.254.0`, and the infra example lockfiles now resolve
the previous nested `fast-uri` audit finding to the patched AWS CDK dependency set.

## Infra Lockfile Note

The infra example lockfiles intentionally retain AWS CDK bundled-dependency metadata for
`aws-cdk-lib/node_modules/@aws-cdk/cloud-assembly-api`. Keep those nested `inBundle` entries when regenerating the
locks so `npm ci` can validate the AWS CDK package tree under npm 11.

## Install (npm)

```bash
  # AppTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v1.6.0/theory-cloud-apptheory-1.6.0.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v1.8.3/theory-cloud-tabletheory-ts-1.8.3.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v1.6.0/theory-cloud-apptheory-cdk-1.6.0.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v1.6.0/theory-cloud-apptheory-1.6.0.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v1.8.3/theory-cloud-tabletheory-ts-1.8.3.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v1.8.3/theory-cloud-tabletheory-ts-1.8.3.tgz"
    }
  }
}
```
