---
title: Deprecation Policy
---

# FaceTheory Deprecation Policy

FaceTheory has published a post-1.0 release line since v1.0.0, so post-1.0 SemVer discipline applies even while the public API is still being strengthened.

## Policy

- **Additive changes** may ship in minor or patch releases when they preserve the existing rendering contract.
- **Deprecations** stay available for at least one minor release before removal, unless a security or determinism bug makes the old surface unsafe to keep.
- **Removals or behavior changes** require a breaking Conventional Commit (`feat!:` or `fix!:`) with a `BREAKING CHANGE:` footer, release notes, and a migration guide entry.
- **Adapters stay peers.** A deprecation that affects a shared contract must name the React, Vue, and Svelte migration path; adapter-only deprecations stay inside that adapter's docs.
- **Release Please owns version bumps and changelog generation.** Do not hand-edit release manifests, tags, generated release notes, or release assets to accelerate a deprecation.

## Deprecations

No deprecation is open on the current release line. Every deprecation announced on the 3.x release line was removed in
the v4.0.0 major, so the replacement surfaces have been the only supported ones since then. The rows below are
historical, and the `Removed` column records the release that dropped each one.

| Surface                                       | Replacement                         | Removed | Notes                                                                                                                                                                                                                   |
| --------------------------------------------- | ----------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Headers` type alias                          | `FaceHeaders`                       | v4.0.0  | The alias survived the 3.x train to avoid colliding with the browser `Headers` class while consumers migrated imports.                                                                                                  |
| `FaceRenderResult.head.html` for tag emission | Structured `headTags` / `styleTags` | v4.0.0  | `head.html` was escaped legacy text. Use structured head/style tags for deterministic ordering, CSP nonce handling, and adapter parity. See [Migration 9](./migration-guide.md#migration-9-v4-public-surface-curation). |

## Support-contract updates are not breaking changes

Some policy moves change what FaceTheory supports without changing its public API. Two are current:

- raising the Node floor the published package declares (precedent: `c97c1ca`,
  `feat(platform): raise the Node floor to Node 22`); and
- moving the Lambda runtime that the reference stacks, the `facetheory create` scaffold, and the deploy examples
  declare (for example `nodejs20.x` to `nodejs24.x`).

Consumers keep the same imports, the same Face modes, and the same render contract; only the runtime the app is
deployed onto changes, and no code edit is required of anyone who is not deploying. These ship as non-breaking
`feat(...)` commits and non-breaking releases, **not** as `feat!:`/`fix!:` breaking changes.

Routing a runtime move through the breaking-change channel misprices it: it forces a major version and a breaking-change
footer for a change that breaks no API, which in turn makes real breaking changes indistinguishable from housekeeping in
the changelog.

The migration path is still published, because the constraint that matters is operational rather than syntactic: AWS
stops allowing `nodejs20.x` function _creation_ before it stops allowing _updates_, so "your code still compiles" is not
a safe proxy for "you can still deploy". See
[Migration 11](./migration-guide.md#migration-11-node-20-to-node-24-lambda-runtime).

## Consumer obligations

When a release marks an API as deprecated:

1. update imports and examples to the replacement surface;
2. run `cd ts && npm run check` in this repository or the consuming app's equivalent gate;
3. verify representative SSR/SSG/ISR/SPA pages hydrate without warnings; and
4. keep the prior pinned GitHub Release tarball available until the migration is verified.

Breaking removals are never smuggled into non-breaking commit subjects. If a downstream Theory Cloud consumer such as Autheory or Pay Theory depends on a deprecated surface, coordinate through the user before the removal release.
