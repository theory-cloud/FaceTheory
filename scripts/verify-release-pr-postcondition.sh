#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

version_line_re='^[[:space:]]*([0-9]+\.[0-9]+\.[0-9]+(-rc(\.[0-9]+)?)?)[[:space:]]*(#.*)?$'
rc_version_re='^[0-9]+\.[0-9]+\.[0-9]+-rc(\.[0-9]+)?$'
stable_version_re='^[0-9]+\.[0-9]+\.[0-9]+$'
releasable_subject_re='^(feat|fix|perf)(\([^)]+\))?(!)?: '

parse_version_value() {
  local raw="$1"

  raw="${raw//$'\r'/}"
  raw="${raw//$'\n'/}"
  if [[ "${raw}" =~ ${version_line_re} ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return 0
  fi

  return 1
}

is_rc_version() {
  [[ "$1" =~ ${rc_version_re} ]]
}

is_stable_version() {
  [[ "$1" =~ ${stable_version_re} ]]
}

manifest_version() {
  local manifest_path="$1"

  python3 - "${manifest_path}" <<'PY'
import json
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1])
version = json.loads(manifest_path.read_text(encoding="utf-8")).get(".", "")
if not version:
    raise SystemExit(f"missing release-please version in {manifest_path}")
print(version)
PY
}

baseline_tag_from_manifest() {
  local manifest_path="$1"
  local version

  version="$(manifest_version "${manifest_path}")"
  printf 'v%s\n' "${version#v}"
}

fetch_base_branch_and_tags() {
  local base_branch="$1"

  if git remote get-url origin >/dev/null 2>&1; then
    git fetch --force --tags origin "+refs/heads/${base_branch}:refs/remotes/origin/${base_branch}" >/dev/null 2>&1
  fi
}

resolve_base_ref() {
  local base_branch="$1"

  if git rev-parse --verify --quiet "origin/${base_branch}^{commit}" >/dev/null; then
    printf 'origin/%s\n' "${base_branch}"
    return 0
  fi

  if git rev-parse --verify --quiet "${base_branch}^{commit}" >/dev/null; then
    printf '%s\n' "${base_branch}"
    return 0
  fi

  return 1
}

has_releasable_commits_since() {
  local baseline="$1"
  local base_ref="$2"
  local commit_subjects

  # Same user-facing predicate as prerelease/readiness CI, anchored on the
  # manifest-recorded tag and excluding merges:
  # git log --no-merges --format=%s <baseline>..<base_branch> |
  #   grep -Eq '^(feat|fix|perf)(\([^)]+\))?(!)?: '
  commit_subjects="$(git log --no-merges --format=%s "${baseline}..${base_ref}")"
  grep -Eq "${releasable_subject_re}" <<<"${commit_subjects}"
}

verify_no_open_release_pr_is_legitimate_noop() {
  local base_branch="$1"
  local release_branch="$2"
  local expected_shape="$3"
  local noop_message="$4"
  local manifest_path="$5"
  local baseline
  local base_ref

  if ! baseline="$(baseline_tag_from_manifest "${manifest_path}")"; then
    echo "release-pr-postcondition: FAIL (${noop_message}; could not read ${manifest_path} to derive the ${base_branch} release baseline)" >&2
    return 1
  fi

  if ! fetch_base_branch_and_tags "${base_branch}"; then
    echo "release-pr-postcondition: FAIL (${noop_message}; could not fetch ${base_branch} and tags to check commits since ${baseline})" >&2
    return 1
  fi

  if ! git rev-parse --verify --quiet "${baseline}^{commit}" >/dev/null; then
    echo "release-pr-postcondition: FAIL (${noop_message}; recorded ${base_branch} manifest baseline tag ${baseline} is missing, so no-op cannot be proven)" >&2
    return 1
  fi

  if ! base_ref="$(resolve_base_ref "${base_branch}")"; then
    echo "release-pr-postcondition: FAIL (${noop_message}; could not resolve ${base_branch} to check commits since ${baseline})" >&2
    return 1
  fi

  if has_releasable_commits_since "${baseline}" "${base_ref}"; then
    echo "release-pr-postcondition: FAIL (${noop_message}; expected an open generated ${expected_shape} Release Please PR ${release_branch} -> ${base_branch})" >&2
    return 1
  fi

  echo "release-pr-postcondition: PASS (legitimate no-op; nothing user-facing to release on ${base_branch} since ${baseline})"
}

self_test_commit() {
  local tree="$1"
  shift
  GIT_AUTHOR_NAME="FaceTheory Release Self Test" \
  GIT_AUTHOR_EMAIL="facetheory-release-self-test@example.invalid" \
  GIT_AUTHOR_DATE="2026-06-19T00:00:00Z" \
  GIT_COMMITTER_NAME="FaceTheory Release Self Test" \
  GIT_COMMITTER_EMAIL="facetheory-release-self-test@example.invalid" \
  GIT_COMMITTER_DATE="2026-06-19T00:00:00Z" \
    git commit-tree "${tree}" "$@"
}

self_test_tree() {
  local content="$1"
  local blob
  blob="$(printf '%s\n' "${content}" | git hash-object -w --stdin)"
  printf '100644 blob %s\tself-test.txt\n' "${blob}" | git mktree
}

self_test_version_parser() {
  local parsed

  parsed="$(parse_version_value '1.12.2-rc # x-release-please-version')"
  [[ "${parsed}" == "1.12.2-rc" ]] || {
    echo "release-pr-postcondition: FAIL (self-test annotated RC parsed as ${parsed})" >&2
    return 1
  }
  is_rc_version "${parsed}" || {
    echo "release-pr-postcondition: FAIL (self-test annotated RC was not accepted as RC)" >&2
    return 1
  }
  ! is_stable_version "${parsed}" || {
    echo "release-pr-postcondition: FAIL (self-test annotated RC was accepted as stable)" >&2
    return 1
  }

  parsed="$(parse_version_value '1.12.2-rc.7 # x-release-please-version')"
  [[ "${parsed}" == "1.12.2-rc.7" ]] || {
    echo "release-pr-postcondition: FAIL (self-test numbered annotated RC parsed as ${parsed})" >&2
    return 1
  }
  is_rc_version "${parsed}" || {
    echo "release-pr-postcondition: FAIL (self-test numbered annotated RC was not accepted as RC)" >&2
    return 1
  }

  parsed="$(parse_version_value '1.12.2 # x-release-please-version')"
  [[ "${parsed}" == "1.12.2" ]] || {
    echo "release-pr-postcondition: FAIL (self-test annotated stable parsed as ${parsed})" >&2
    return 1
  }
  is_stable_version "${parsed}" || {
    echo "release-pr-postcondition: FAIL (self-test annotated stable was not accepted as stable)" >&2
    return 1
  }
  ! is_rc_version "${parsed}" || {
    echo "release-pr-postcondition: FAIL (self-test annotated stable was accepted as RC)" >&2
    return 1
  }

  if parse_version_value '1.12.2-rcx # x-release-please-version' >/dev/null; then
    echo "release-pr-postcondition: FAIL (self-test malformed RC was parsed)" >&2
    return 1
  fi

  echo "release-pr-postcondition: PASS (self-test VERSION parser; annotated RC accepted and stable/RC mismatches rejected)"
}

self_test_no_open_release_pr_channel() {
  local channel="$1"
  local base_branch="$2"
  local manifest_path="$3"
  local expected_shape="$4"
  local noop_message="$5"
  local release_branch="$6"
  local version="999.999.$7"
  local ref_prefix="refs/facetheory-release-self-test/pr-postcondition/${channel}/$$"
  local baseline_tag="refs/tags/v${version}"
  local cleanup_refs=()
  local test_dir="$(git rev-parse --git-path facetheory-release-self-tests)"
  local empty_tree noop_tree miss_tree
  local baseline noop_head miss_head output

  cleanup_release_pr_self_test_refs() {
    local ref
    for ref in "${cleanup_refs[@]:-}"; do
      git update-ref -d "${ref}" >/dev/null 2>&1 || true
    done
    if [[ -n "${manifest_path:-}" ]]; then
      rm -f "${manifest_path}" >/dev/null 2>&1 || true
    fi
    trap - RETURN
  }
  trap cleanup_release_pr_self_test_refs RETURN

  if git rev-parse --verify --quiet "${baseline_tag}^{commit}" >/dev/null; then
    echo "release-pr-postcondition: FAIL (self-test baseline tag ${baseline_tag} already exists)" >&2
    return 1
  fi

  mkdir -p "${test_dir}"
  printf '{".": "%s"}\n' "${version}" >"${manifest_path}"

  empty_tree="$(git mktree </dev/null)"
  noop_tree="$(self_test_tree "${channel} noop docs")"
  miss_tree="$(self_test_tree "${channel} releasable fix")"
  baseline="$(self_test_commit "${empty_tree}" -m 'chore: seed release baseline')"
  noop_head="$(self_test_commit "${noop_tree}" -p "${baseline}" -m 'docs: internal release note')"
  miss_head="$(self_test_commit "${miss_tree}" -p "${noop_head}" -m 'fix: self-test releasable change')"

  git update-ref "${baseline_tag}" "${baseline}"
  git update-ref "${ref_prefix}/noop" "${noop_head}"
  git update-ref "${ref_prefix}/miss" "${miss_head}"
  cleanup_refs+=("${baseline_tag}" "${ref_prefix}/noop" "${ref_prefix}/miss")

  if ! output="$(
    (
      fetch_base_branch_and_tags() { return 0; }
      resolve_base_ref() { printf '%s\n' "${ref_prefix}/noop"; }
      verify_no_open_release_pr_is_legitimate_noop \
        "${base_branch}" \
        "${release_branch}" \
        "${expected_shape}" \
        "${noop_message}" \
        "${manifest_path}"
    ) 2>&1
  )"; then
    printf '%s\n' "${output}" >&2
    echo "release-pr-postcondition: FAIL (self-test ${channel} legitimate no-op was rejected)" >&2
    return 1
  fi
  if [[ "${output}" != *"legitimate no-op"* ]]; then
    printf '%s\n' "${output}" >&2
    echo "release-pr-postcondition: FAIL (self-test ${channel} no-op did not report legitimate no-op)" >&2
    return 1
  fi
  echo "release-pr-postcondition: PASS (self-test ${channel} empty release-please PR with zero user-facing commits passed)"

  if output="$(
    (
      fetch_base_branch_and_tags() { return 0; }
      resolve_base_ref() { printf '%s\n' "${ref_prefix}/miss"; }
      verify_no_open_release_pr_is_legitimate_noop \
        "${base_branch}" \
        "${release_branch}" \
        "${expected_shape}" \
        "${noop_message}" \
        "${manifest_path}"
    ) 2>&1
  )"; then
    printf '%s\n' "${output}" >&2
    echo "release-pr-postcondition: FAIL (self-test ${channel} genuine missed release PR was accepted)" >&2
    return 1
  fi
  if [[ "${output}" != *"expected an open generated ${expected_shape} Release Please PR ${release_branch} -> ${base_branch}"* ]]; then
    printf '%s\n' "${output}" >&2
    echo "release-pr-postcondition: FAIL (self-test ${channel} genuine miss did not preserve the fail-closed message)" >&2
    return 1
  fi
  echo "release-pr-postcondition: PASS (self-test ${channel} user-facing commit without release-please PR failed closed)"
}

self_test_no_open_release_prs() {
  local test_dir="$(git rev-parse --git-path facetheory-release-self-tests)"
  mkdir -p "${test_dir}"
  self_test_no_open_release_pr_channel \
    "prerelease" \
    "premain" \
    "${test_dir}/prerelease-manifest-$$.json" \
    "RC" \
    "release-please no-op is a failed RC gate" \
    "release-please--branches--premain" \
    "101"
  self_test_no_open_release_pr_channel \
    "stable" \
    "main" \
    "${test_dir}/stable-manifest-$$.json" \
    "stable" \
    "release-please no-op is a failed stable gate" \
    "release-please--branches--main" \
    "102"
  rmdir "${test_dir}" >/dev/null 2>&1 || true
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test_version_parser
  self_test_no_open_release_prs
  exit $?
fi

channel="${1:-}"
case "${channel}" in
  prerelease)
    base_branch="premain"
    release_branch="release-please--branches--premain"
    expected_shape="RC"
    noop_message="release-please no-op is a failed RC gate"
    manifest_path=".release-please-manifest.premain.json"
    ;;
  stable)
    base_branch="main"
    release_branch="release-please--branches--main"
    expected_shape="stable"
    noop_message="release-please no-op is a failed stable gate"
    manifest_path=".release-please-manifest.json"
    ;;
  *)
    echo "release-pr-postcondition: FAIL (usage: $0 prerelease|stable)" >&2
    exit 1
    ;;
esac

if ! command -v gh >/dev/null 2>&1; then
  echo "release-pr-postcondition: FAIL (gh not found)" >&2
  exit 1
fi

repository="${GITHUB_REPOSITORY:-}"
if [[ -z "${repository}" ]]; then
  repository="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
fi

pr_number="$(
  gh pr list \
    --repo "${repository}" \
    --state open \
    --base "${base_branch}" \
    --head "${release_branch}" \
    --json number \
    --jq '.[0].number // ""'
)"

if [[ -z "${pr_number}" ]]; then
  verify_no_open_release_pr_is_legitimate_noop \
    "${base_branch}" \
    "${release_branch}" \
    "${expected_shape}" \
    "${noop_message}" \
    "${manifest_path}"
  exit $?
fi

title="$(gh pr view --repo "${repository}" "${pr_number}" --json title --jq '.title')"
encoded_ref="$(
  python3 - "${release_branch}" <<'PY'
import sys
import urllib.parse

print(urllib.parse.quote(sys.argv[1], safe=""))
PY
)"
version_b64="$(gh api "repos/${repository}/contents/VERSION?ref=${encoded_ref}" --jq '.content // ""' | tr -d '\n')"
version_raw="$(printf '%s' "${version_b64}" | base64 --decode | tr -d '\r\n')"
if ! version="$(parse_version_value "${version_raw}")"; then
  echo "release-pr-postcondition: FAIL (generated ${base_branch} release PR #${pr_number} VERSION ${version_raw} does not start with a supported stable/RC semver value)" >&2
  exit 1
fi

rc_re='(^|[^0-9A-Za-z.])v?[0-9]+\.[0-9]+\.[0-9]+-rc(\.[0-9]+)?([^0-9A-Za-z.]|$)'

case "${channel}" in
  prerelease)
    if ! is_rc_version "${version}"; then
      echo "release-pr-postcondition: FAIL (generated premain release PR #${pr_number} VERSION ${version} is not RC-shaped)" >&2
      exit 1
    fi
    if ! [[ "${title}" =~ ${rc_re} ]]; then
      echo "release-pr-postcondition: FAIL (generated premain release PR #${pr_number} title does not advertise an RC version: ${title})" >&2
      exit 1
    fi
    ;;
  stable)
    if [[ "${version}" =~ -rc(\.|$) ]]; then
      echo "release-pr-postcondition: FAIL (generated main release PR #${pr_number} VERSION ${version} is RC-shaped; main owns stable releases only)" >&2
      exit 1
    fi
    if ! is_stable_version "${version}"; then
      echo "release-pr-postcondition: FAIL (generated main release PR #${pr_number} VERSION ${version} is not stable semver)" >&2
      exit 1
    fi
    if [[ "${title}" =~ ${rc_re} ]]; then
      echo "release-pr-postcondition: FAIL (generated main release PR #${pr_number} title is RC-shaped; main owns stable releases only: ${title})" >&2
      exit 1
    fi
    ;;
esac

echo "release-pr-postcondition: PASS (${expected_shape} PR #${pr_number}, VERSION=${version})"
