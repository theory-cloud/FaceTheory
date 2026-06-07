Bootstrap: the FaceTheory steward is materialized from the published `facetheory` namespace agent into git-ignored host installs (`.codex/`, `.claude/`, `.agents/`, `.mcp.json`).

# FaceTheory agent notes

These repository-local notes supplement the FaceTheory stewardship instructions.

## FaceTheory Lab GitHub tooling

Prefer the routed `facetheory_lab` MCP GitHub tools whenever they cover the task. In particular, use the lab tools for agent-scoped branch creation, bounded file commits, opening PRs, issue/PR comments, and PR reviews before falling back to the generic GitHub plugin, `gh`, or raw GitHub API calls. If a needed read-only GitHub operation is not exposed through `facetheory_lab`, use the generic GitHub tooling or `gh` as the fallback, then return to `facetheory_lab` for supported writes.

The lab tooling is a convenience layer, not a release-process bypass: all FaceTheory branch, version-alignment, Release Please, signed-commit, and no-force-push rules still apply.

## Staging PR version alignment

Before opening or updating any PR into `staging`, verify version alignment for both the stable release path and the release-candidate path. In practice, confirm the root `VERSION`, `ts/package.json`, `ts/package-lock.json`, `.release-please-manifest.json`, and `.release-please-manifest.premain.json` remain consistent with the intended release / RC state, and run `scripts/verify-version-alignment.sh`; this check must fail if the stable manifest or the premain release-candidate manifest has drifted to an older release line.

## Release and branch reality checks

- Always include `main` when reasoning about branch ancestry, release promotion, or release recovery. Fetch first, then compare the candidate branch against `origin/main`, `origin/premain`, and `origin/staging`; do not answer "what branch did this come from?" from naming or upstream metadata alone.
- Normal feature work targets `staging`, but release/recovery branches may be cut from the branch that actually contains the correct lineage. Do not force a convention-compliant recovery branch back through `staging` solely for neatness when the user has authorized a direct release fix.
- Release Please owns version bumps, tags, GitHub Releases, generated changelogs, and release assets. Never hand-create or recreate the stable tag/release to "fix" automation; fix the workflow state and let Release Please publish.
- Before merging a Release Please PR, inspect the proposed version and changelog against the latest published stable release. An unexpected major version or stale historical changelog entries are a stop condition, not something to merge through.
- After a stable release PR merges, watch the `Release (main)` workflow and verify the published tag, GitHub Release, expected assets, package version, and AppTheory/TableTheory pins when dependency freshness is part of the release question. Then make sure `main` is back-merged so `staging` does not lag the released baseline.
