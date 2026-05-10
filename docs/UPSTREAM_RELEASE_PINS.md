# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v1.4.1`
- AppTheory (CDK): `v1.4.1`
- TableTheory (TypeScript): `v1.8.2`

## Known Audit Exception

The infra example lockfiles currently inherit `fast-uri@3.1.0` from the published `aws-cdk-lib@2.253.0` tarball
(`aws-cdk-lib -> table -> ajv -> fast-uri`). FaceTheory accepts this as a documented exception because the
dependency is bundled inside the AWS CDK release asset and we do not maintain custom AWS CDK tarballs. Revisit the
exception when AWS CDK, and then AppTheory CDK, publish a patched bundle.

## Install (npm)

```bash
  # AppTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v1.4.1/theory-cloud-apptheory-1.4.1.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v1.8.2/theory-cloud-tabletheory-ts-1.8.2.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v1.4.1/theory-cloud-apptheory-cdk-1.4.1.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v1.4.1/theory-cloud-apptheory-1.4.1.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v1.8.2/theory-cloud-tabletheory-ts-1.8.2.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v1.8.2/theory-cloud-tabletheory-ts-1.8.2.tgz"
    }
  }
}
```
