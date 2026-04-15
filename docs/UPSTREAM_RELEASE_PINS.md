# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v0.24.5`
- AppTheory (CDK): `v0.24.5`
- TableTheory (TypeScript): `v1.5.5`

## Install (npm)

```bash
  # AppTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v0.24.5/theory-cloud-apptheory-0.24.5.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v1.5.5/theory-cloud-tabletheory-ts-1.5.5.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v0.24.5/theory-cloud-apptheory-cdk-0.24.5.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v0.24.5/theory-cloud-apptheory-0.24.5.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v1.5.5/theory-cloud-tabletheory-ts-1.5.5.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v1.5.5/theory-cloud-tabletheory-ts-1.5.5.tgz"
    }
  }
}
```
