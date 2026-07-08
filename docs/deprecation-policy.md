---
title: Deprecation Policy
---

# FaceTheory Deprecation Policy

FaceTheory is on the 3.x release line, so post-1.0 SemVer discipline applies even while the public API is still being strengthened.

## Policy

- **Additive changes** may ship in minor or patch releases when they preserve the existing rendering contract.
- **Deprecations** stay available for at least one minor release before removal, unless a security or determinism bug makes the old surface unsafe to keep.
- **Removals or behavior changes** require a breaking Conventional Commit (`feat!:` or `fix!:`) with a `BREAKING CHANGE:` footer, release notes, and a migration guide entry.
- **Adapters stay peers.** A deprecation that affects a shared contract must name the React, Vue, and Svelte migration path; adapter-only deprecations stay inside that adapter's docs.
- **Release Please owns version bumps and changelog generation.** Do not hand-edit release manifests, tags, generated release notes, or release assets to accelerate a deprecation.

## Current 3.x deprecations

| Surface                                       | Replacement                         | Earliest removal | Notes                                                                                                                                       |
| --------------------------------------------- | ----------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Headers` type alias                          | `FaceHeaders`                       | v4.0.0           | The alias remains in the 3.x train to avoid colliding with the browser `Headers` class while consumers migrate imports.                     |
| `FaceRenderResult.head.html` for tag emission | Structured `headTags` / `styleTags` | v4.0.0           | `head.html` remains escaped legacy text. Use structured head/style tags for deterministic ordering, CSP nonce handling, and adapter parity. |

## Consumer obligations

When a release marks an API as deprecated:

1. update imports and examples to the replacement surface;
2. run `cd ts && npm run check` in this repository or the consuming app's equivalent gate;
3. verify representative SSR/SSG/ISR/SPA pages hydrate without warnings; and
4. keep the prior pinned GitHub Release tarball available until the migration is verified.

Breaking removals are never smuggled into non-breaking commit subjects. If a downstream Theory Cloud consumer such as Autheory or Pay Theory depends on a deprecated surface, coordinate through the user before the removal release.
