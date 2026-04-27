# FaceTheory agent notes

These repository-local notes supplement the FaceTheory stewardship instructions.

## Staging PR version alignment

Before opening or updating any PR into `staging`, verify version alignment for both the stable release path and the release-candidate path. In practice, confirm the root `VERSION`, `ts/package.json`, `ts/package-lock.json`, `.release-please-manifest.json`, and `.release-please-manifest.premain.json` remain consistent with the intended release / RC state, and run the repository version-alignment check when the branch changes release metadata.
