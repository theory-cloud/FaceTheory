#!/usr/bin/env bash
set -euo pipefail

repo_root="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "${repo_root}"

base_ref="${1:-}"
head_ref="${2:-}"
base_branch="${3:-}"
head_branch="${4:-}"
remote="${GIT_REMOTE:-origin}"

usage() {
  echo "promotion-policy: FAIL (usage: scripts/verify-branch-promotion-policy.sh <base-ref> <head-ref> <base-branch> <head-branch>)"
  exit 1
}

fail() {
  echo "promotion-policy: FAIL ($*)"
  exit 1
}

pass() {
  echo "promotion-policy: PASS ($*)"
  exit 0
}

trim_version() {
  sed -E 's/[[:space:]]+#.*$//' | tr -d '[:space:]'
}

read_version_from_ref() {
  local ref="$1"
  local version_text

  version_text="$(git show "${ref}:VERSION" 2>/dev/null || true)"
  [[ -n "${version_text}" ]] || fail "missing VERSION in ${ref}"

  printf '%s\n' "${version_text}" | head -n 1 | trim_version
}

[[ -n "${base_ref}" && -n "${head_ref}" && -n "${base_branch}" && -n "${head_branch}" ]] || usage

git rev-parse --verify "${base_ref}^{commit}" >/dev/null 2>&1 || fail "missing base ref ${base_ref}"
git rev-parse --verify "${head_ref}^{commit}" >/dev/null 2>&1 || fail "missing head ref ${head_ref}"

main_ref="refs/remotes/${remote}/main"
premain_ref="refs/remotes/${remote}/premain"

case "${base_branch}" in
  staging)
    git show-ref --verify --quiet "${main_ref}" || fail "missing ${main_ref}; fetch ${remote}/main before checking staging"

    if git merge-base --is-ancestor "${main_ref}" "${base_ref}"; then
      pass "staging already contains current main"
    fi

    if [[ "${head_branch}" == "main" ]]; then
      pass "main -> staging back-merge is allowed"
    fi

    if git merge-base --is-ancestor "${main_ref}" "${head_ref}"; then
      pass "staging back-merge conflict-resolution branch contains current main"
    fi

    fail "staging is missing current main; merge main back into staging before any further work"
    ;;

  premain)
    case "${head_branch}" in
      staging)
        pass "staging -> premain is the allowed promotion path"
        ;;
      release-please--branches--premain)
        pass "release-please prerelease PR remains the current automation exception"
        ;;
      *)
        fail "premain only accepts PRs from staging (plus the current release-please prerelease exception)"
        ;;
    esac
    ;;

  main)
    case "${head_branch}" in
      staging)
        pass "staging -> main remains allowed"
        ;;
      premain)
        git show-ref --verify --quiet "${premain_ref}" || fail "missing ${premain_ref}; fetch ${remote}/premain before checking main promotions"

        version="$(read_version_from_ref "${head_ref}")"
        if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-rc(\.[0-9]+)?$ ]]; then
          fail "premain -> main requires the current premain VERSION to be an RC; found ${version}"
        fi

        tag_ref="refs/tags/v${version}"
        git show-ref --verify --quiet "${tag_ref}" || fail "premain -> main requires published RC tag v${version}"

        tag_commit="$(git rev-parse "${tag_ref}^{commit}")"
        head_commit="$(git rev-parse "${head_ref}^{commit}")"
        if [[ "${tag_commit}" != "${head_commit}" ]]; then
          fail "premain -> main requires current premain head ${head_commit} to match published RC tag v${version} (${tag_commit})"
        fi

        pass "premain -> main is pinned to published RC v${version}"
        ;;
      release-please--branches--main)
        pass "release-please stable PR remains the current automation exception"
        ;;
      *)
        fail "main only accepts PRs from staging or premain (plus the current release-please stable exception)"
        ;;
    esac
    ;;

  *)
    pass "no protected promotion policy for base branch ${base_branch}"
    ;;
esac
