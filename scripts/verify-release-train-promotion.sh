#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

base=""
head=""
base_ref=""
head_sha=""
github_repository="${GITHUB_REPOSITORY:-}"
github_head_repository=""
pr_title=""
remote="origin"

usage() {
  cat <<'USAGE'
usage: scripts/verify-release-train-promotion.sh --base <branch> --head <branch> [--base-ref <ref>] [--head-sha <sha>] [--github-repository owner/name] [--github-head-repository owner/name] [--pr-title <title>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) base="${2:-}"; shift 2 ;;
    --head) head="${2:-}"; shift 2 ;;
    --base-ref) base_ref="${2:-}"; shift 2 ;;
    --head-sha) head_sha="${2:-}"; shift 2 ;;
    --github-repository) github_repository="${2:-}"; shift 2 ;;
    --github-head-repository) github_head_repository="${2:-}"; shift 2 ;;
    --pr-title) pr_title="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "release-train-promotion: FAIL (unknown argument $1)" >&2; usage >&2; exit 1 ;;
  esac
done

fail() {
  echo "release-train-promotion: FAIL ($1)" >&2
  exit 1
}

pass() {
  echo "release-train-promotion: PASS ($1)"
}

normalize_branch() {
  local value="$1"
  value="${value#refs/heads/}"
  printf '%s\n' "${value}"
}

base="$(normalize_branch "${base}")"
head="$(normalize_branch "${head}")"

[[ -n "${base}" ]] || fail "missing PR base branch"
[[ -n "${head}" ]] || fail "missing PR head branch"

if [[ -z "${github_head_repository}" ]]; then
  github_head_repository="${github_repository}"
fi

case "${base}" in
  staging|premain|main) ;;
  *)
    pass "non-release target ${head} -> ${base}"
    exit 0
    ;;
esac

if [[ -z "${github_repository}" ]]; then
  if command -v gh >/dev/null 2>&1; then
    github_repository="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
  else
    fail "GITHUB_REPOSITORY is required"
  fi
fi

if [[ ! "${github_repository}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  fail "GitHub repository must be owner/name, got ${github_repository}"
fi

require_ref() {
  local ref="$1"
  git rev-parse --verify --quiet "${ref}^{commit}" >/dev/null || fail "missing ${ref}; fetch staging, premain, and main before running"
}

sha_for_ref() {
  local ref="$1"
  git rev-parse --verify "${ref}^{commit}"
}

release_ref() {
  local branch="$1"
  local ref="refs/remotes/${remote}/${branch}"
  require_ref "${ref}"
  printf '%s\n' "${ref}"
}

branch_sha() {
  sha_for_ref "$(release_ref "$1")"
}

is_ancestor_ref() {
  local ancestor="$1"
  local descendant="$2"
  git merge-base --is-ancestor "${ancestor}" "${descendant}"
}

require_protected_ancestor() {
  local ancestor_branch="$1"
  local descendant_branch="$2"
  local description="$3"
  local ancestor_ref descendant_ref
  ancestor_ref="$(release_ref "${ancestor_branch}")"
  descendant_ref="$(release_ref "${descendant_branch}")"
  if ! is_ancestor_ref "${ancestor_ref}" "${descendant_ref}"; then
    fail "${description}: ${ancestor_branch} is not an ancestor of ${descendant_branch}"
  fi
}

api_compare_status() {
  local ancestor_sha="$1"
  local descendant_sha="$2"
  local label="$3"

  if [[ "${ancestor_sha}" == "${descendant_sha}" ]]; then
    printf 'identical\n'
    return 0
  fi
  if [[ ! "${ancestor_sha}" =~ ^[0-9a-f]{40}$ || ! "${descendant_sha}" =~ ^[0-9a-f]{40}$ ]]; then
    fail "${label}: expected 40-character commit SHAs"
  fi
  if git cat-file -e "${descendant_sha}^{commit}" 2>/dev/null; then
    if git merge-base --is-ancestor "${ancestor_sha}" "${descendant_sha}"; then
      printf 'ahead\n'
    else
      printf 'diverged\n'
    fi
    return 0
  fi
  if ! command -v gh >/dev/null 2>&1; then
    fail "${label}: gh is required to verify PR head ancestry without fetching untrusted refs"
  fi

  local encoded_base encoded_head
  encoded_base="$(python3 - "${ancestor_sha}" <<'PY'
import sys, urllib.parse
print(urllib.parse.quote(sys.argv[1], safe=''))
PY
)"
  encoded_head="$(python3 - "${descendant_sha}" <<'PY'
import sys, urllib.parse
print(urllib.parse.quote(sys.argv[1], safe=''))
PY
)"

  gh api "repos/${github_repository}/compare/${encoded_base}...${encoded_head}" --jq '.status'
}

require_sha_contains_branch() {
  local ancestor_branch="$1"
  local descendant_sha="$2"
  local description="$3"
  local ancestor_sha status
  ancestor_sha="$(branch_sha "${ancestor_branch}")"
  status="$(api_compare_status "${ancestor_sha}" "${descendant_sha}" "${description}")" || fail "${description}: compare API failed"
  case "${status}" in
    ahead|identical) ;;
    *) fail "${description}: ${ancestor_branch} is not an ancestor of PR head (${status})" ;;
  esac
}

require_title_not_rc() {
  if [[ "${pr_title}" =~ (^|[^0-9A-Za-z.])v?[0-9]+\.[0-9]+\.[0-9]+-rc(\.[0-9]+)?([^0-9A-Za-z.]|$) ]]; then
    fail "main owns stable releases only; PR title advertises an RC: ${pr_title}"
  fi
}

require_title_rc() {
  if ! [[ "${pr_title}" =~ (^|[^0-9A-Za-z.])v?[0-9]+\.[0-9]+\.[0-9]+-rc(\.[0-9]+)?([^0-9A-Za-z.]|$) ]]; then
    fail "premain Release Please PR must advertise an RC: ${pr_title}"
  fi
}

if [[ "${base}" == "staging" ]]; then
  case "${head}" in
    premain|release-please--branches--premain|release-please--branches--main)
      fail "invalid PR edge ${head} -> staging; only feature integration or main -> staging back-merge is allowed"
      ;;
  esac

  if [[ "${head}" == "main" ]]; then
    require_protected_ancestor "staging" "main" "main -> staging back-merge must include staging"
    pass "main -> staging back-merge"
    exit 0
  fi

  [[ -n "${head_sha}" ]] || fail "staging integration requires --head-sha"
  if [[ "${github_head_repository}" != "${github_repository}" ]]; then
    fail "staging integration from forks is not release-train-verifiable without fetching untrusted refs"
  fi
  require_sha_contains_branch "staging" "${head_sha}" "staging integration must include current staging"
  require_sha_contains_branch "main" "${head_sha}" "staging integration must include current main baseline"
  pass "feature -> staging integration contains staging and main baselines"
  exit 0
fi

if [[ "${base}" == "premain" ]]; then
  case "${head}" in
    staging)
      require_protected_ancestor "premain" "staging" "staging -> premain prerelease promotion must include premain"
      require_protected_ancestor "main" "staging" "staging -> premain prerelease promotion must include main"
      pass "staging -> premain prerelease promotion"
      ;;
    release-please--branches--premain)
      [[ -n "${head_sha}" ]] || fail "generated premain release PR requires --head-sha"
      require_sha_contains_branch "premain" "${head_sha}" "generated premain Release Please PR must be based on premain"
      [[ -z "${pr_title}" ]] || require_title_rc
      pass "generated premain RC Release Please PR"
      ;;
    *)
      fail "invalid PR edge ${head} -> premain; only staging or release-please--branches--premain may target premain"
      ;;
  esac
  exit 0
fi

if [[ "${base}" == "main" ]]; then
  case "${head}" in
    premain)
      require_protected_ancestor "main" "premain" "premain -> main stable promotion must include main"
      pass "premain -> main stable promotion"
      ;;
    release-please--branches--main)
      [[ -n "${head_sha}" ]] || fail "generated main release PR requires --head-sha"
      require_sha_contains_branch "main" "${head_sha}" "generated main Release Please PR must be based on main"
      [[ -z "${pr_title}" ]] || require_title_not_rc
      pass "generated main stable Release Please PR"
      ;;
    *)
      fail "invalid PR edge ${head} -> main; only premain or release-please--branches--main may target main"
      ;;
  esac
  exit 0
fi
