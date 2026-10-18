#!/usr/bin/env bash
# Purpose: fail closed when a manual Pages dispatch can publish the docs site
# from a ref that is not the production docs line or a stable release tag.
#
# Finding csf_5db2baddce88d542706a9a73: a bare `workflow_dispatch` (no `tag`
# input) validated the latest published stable release tag but built and
# deployed `github.sha` from the selected branch. Any branch could therefore
# publish its own docs stamped with an unrelated release tag. Release handoff
# always dispatches with `--ref <tag>` and `-f tag=<tag>`, and the resolve step
# binds that tag to the run ref; the only other reviewed deploy source is the
# production `main` line, which is also the push trigger.
#
# Invariants:
#   A. a dispatch from the production branch ref is allowed (a manual re-deploy
#      of the main docs line);
#   B. a dispatch from a stable `vX.Y.Z` tag ref is allowed (release handoff and
#      manual tag re-deploy); the deploy-tag verifier binds that tag's commit to
#      the run SHA;
#   C. every other ref is refused before any build work runs.
set -euo pipefail

ref="${1:-${GITHUB_REF:-}}"
main_branch="${MAIN_BRANCH:-main}"

fail() {
  echo "pages-dispatch-ref: FAIL ($*)" >&2
  exit 1
}

[[ -n "${ref}" ]] || fail "missing dispatch ref"

if [[ "${ref}" == "refs/heads/${main_branch}" ]]; then
  echo "pages-dispatch-ref: PASS (${ref})"
  exit 0
fi

if [[ "${ref}" =~ ^refs/tags/v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "pages-dispatch-ref: PASS (${ref})"
  exit 0
fi

fail "refusing workflow_dispatch from '${ref}'; dispatch from refs/heads/${main_branch} or a stable vX.Y.Z tag"
