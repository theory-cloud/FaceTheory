#!/usr/bin/env bash
# Purpose: fail closed when the Pages deploy can execute code from an unverified
# release tag.
#
# Finding 4c790df24ed08191bc1d6de6fb6fd552: pages.yml validated only the tag's
# syntax and its release metadata (published, non-prerelease). A collaborator or
# compromised token able to publish a normal-looking stable release could point
# its tag at an unreviewed commit on an unprotected branch; the workflow would
# then check out that commit and run the Ruby generator and Jekyll build with it.
#
# This verifier binds the deploy to the immutable tag commit and requires that
# commit to be an approved `main` release commit:
#   A. the tag is a stable `vX.Y.Z` tag;
#   B. the tag resolves to an immutable 40-hex commit;
#   C. that commit is an ancestor of `main` (compare status ahead|identical);
#   D. when the run ref is the tag itself, the tag commit IS the run commit, so
#      the checked-out tree is exactly the verified tag commit.
set -euo pipefail

tag="${1:-}"
run_sha="${2:-}"
run_ref_type="${3:-${GITHUB_REF_TYPE:-}}"
repo="${GITHUB_REPOSITORY:-}"
gh_bin="${GH_BIN:-gh}"
main_branch="${MAIN_BRANCH:-main}"

fail() {
  echo "pages-deploy-tag: FAIL ($*)"
  exit 1
}

[[ -n "${tag}" ]] || fail "missing tag"
[[ "${tag}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "tag ${tag} is not a stable vX.Y.Z tag"
[[ -n "${repo}" ]] || fail "missing GITHUB_REPOSITORY"
command -v "${gh_bin}" >/dev/null 2>&1 || fail "${gh_bin} not found"

tag_commit="$("${gh_bin}" api "repos/${repo}/commits/${tag}" --jq .sha 2>/dev/null || true)"
[[ "${tag_commit}" =~ ^[0-9a-f]{40}$ ]] ||
  fail "could not resolve ${tag} to an immutable commit"

if [[ "${run_ref_type}" == "tag" ]]; then
  [[ "${run_sha}" =~ ^[0-9a-f]{40}$ ]] || fail "missing run commit for tag ref ${tag}"
  [[ "${tag_commit}" == "${run_sha}" ]] ||
    fail "${tag} resolves to ${tag_commit}, but the run ref commit is ${run_sha}"
fi

status="$("${gh_bin}" api "repos/${repo}/compare/${tag_commit}...${main_branch}" --jq .status 2>/dev/null || true)"
case "${status}" in
  ahead | identical) ;;
  *)
    fail "${tag} commit ${tag_commit} is not an approved ${main_branch} release commit (compare status: ${status:-<unresolved>})"
    ;;
esac

echo "pages-deploy-tag: PASS (${tag} -> ${tag_commit} on ${main_branch})"
