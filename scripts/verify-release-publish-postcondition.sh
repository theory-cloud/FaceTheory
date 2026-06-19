#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

releasable_subject_re='^(feat|fix|perf)(\([^)]+\))?(!)?: '

is_rc_tag() {
  [[ "${1:-}" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+-rc(\.[0-9]+)?$ ]]
}

is_stable_tag() {
  [[ "${1:-}" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]
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

is_published_stable_release() {
  local tag="$1"
  local repository="${GITHUB_REPOSITORY:-}"
  local release_state

  if command -v gh >/dev/null 2>&1; then
    local gh_args=()
    if [[ -n "${repository}" ]]; then
      gh_args=(--repo "${repository}")
    fi
    if release_state="$(
      gh release view "${tag}" \
        "${gh_args[@]}" \
        --json isDraft,isPrerelease \
        --jq 'if (.isDraft == false and .isPrerelease == false) then "published-stable" else "" end' \
        2>/dev/null
    )" && [[ "${release_state}" == "published-stable" ]]; then
      return 0
    fi
  fi

  [[ -n "${repository}" ]] || return 1

  python3 - "${repository}" "${tag}" <<'PY'
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

repository = sys.argv[1]
tag = sys.argv[2]
parts = repository.split("/", 1)
if len(parts) != 2 or not all(parts):
    raise SystemExit(1)
owner, name = parts
api_base = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
url = (
    f"{api_base}/repos/"
    f"{urllib.parse.quote(owner, safe='')}/"
    f"{urllib.parse.quote(name, safe='')}/"
    f"releases/tags/{urllib.parse.quote(tag, safe='')}"
)
headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "facetheory-release-publish-postcondition",
    "X-GitHub-Api-Version": "2022-11-28",
}
token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
if token:
    headers["Authorization"] = f"Bearer {token}"
request = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError):
    raise SystemExit(1)

if payload.get("draft") is False and payload.get("prerelease") is False:
    raise SystemExit(0)
raise SystemExit(1)
PY
}

stable_already_published_noop_is_legitimate() {
  local baseline
  local base_ref

  if ! baseline="$(baseline_tag_from_manifest "${stable_manifest_path:-.release-please-manifest.json}")"; then
    return 1
  fi

  if [[ "${baseline}" != "${expected_tag}" ]]; then
    return 1
  fi

  if ! is_stable_tag "${baseline}"; then
    return 1
  fi

  if ! is_published_stable_release "${baseline}"; then
    return 1
  fi

  if ! fetch_base_branch_and_tags "main"; then
    return 1
  fi

  if ! git rev-parse --verify --quiet "${baseline}^{commit}" >/dev/null; then
    return 1
  fi

  if ! base_ref="$(resolve_base_ref "main")"; then
    return 1
  fi

  if has_releasable_commits_since "${baseline}" "${base_ref}"; then
    return 1
  fi

  echo "release-publish-postcondition: PASS (already published ${baseline}; legitimate no-op)"
}

require_created_tag() {
  local expected_shape="$1"

  if [[ "${release_created}" != "true" ]]; then
    if [[ "${expected_shape}" == "stable" ]] && stable_already_published_noop_is_legitimate; then
      return 0
    fi

    echo "release-publish-postcondition: FAIL (release-please no-op is a failed ${expected_shape} publish gate; release_created=${release_created:-<empty>})" >&2
    return 1
  fi

  if [[ -z "${tag_name}" ]]; then
    echo "release-publish-postcondition: FAIL (${expected_shape} publish gate created a release without tag_name)" >&2
    return 1
  fi

  if [[ "${tag_name}" != "${expected_tag}" ]]; then
    echo "release-publish-postcondition: FAIL (${expected_shape} tag ${tag_name} != expected ${expected_tag})" >&2
    return 1
  fi
}

verify_stable_publish_postcondition() {
  if is_rc_tag "${expected_tag}"; then
    if [[ "${release_created}" == "true" ]]; then
      echo "release-publish-postcondition: FAIL (main must never create or advertise RC tag ${tag_name:-<empty>})" >&2
      return 1
    fi
    echo "release-publish-postcondition: PASS (pending stable PR generation from RC handoff ${expected_tag})"
    return 0
  fi

  if [[ "${release_created}" != "true" ]]; then
    require_created_tag "stable"
    return $?
  fi

  require_created_tag "stable" || return 1
  if ! is_stable_tag "${tag_name}"; then
    echo "release-publish-postcondition: FAIL (stable tag ${tag_name} is not stable-shaped)" >&2
    return 1
  fi
  echo "release-publish-postcondition: PASS (stable ${tag_name})"
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

self_test_stable_already_published_noop() {
  local version="999.999.201"
  local baseline_tag="refs/tags/v${version}"
  local ref_prefix="refs/facetheory-release-self-test/publish-postcondition/stable/$$"
  local manifest_path="$(git rev-parse --git-path facetheory-release-self-tests/publish-stable-manifest-$$.json)"
  local cleanup_refs=()
  local empty_tree noop_tree miss_tree
  local baseline noop_head miss_head output

  cleanup_release_publish_self_test_refs() {
    local ref
    for ref in "${cleanup_refs[@]:-}"; do
      git update-ref -d "${ref}" >/dev/null 2>&1 || true
    done
    if [[ -n "${manifest_path:-}" ]]; then
      rm -f "${manifest_path}" >/dev/null 2>&1 || true
    fi
    rmdir "$(git rev-parse --git-path facetheory-release-self-tests)" >/dev/null 2>&1 || true
    trap - RETURN
  }
  trap cleanup_release_publish_self_test_refs RETURN

  if git rev-parse --verify --quiet "${baseline_tag}^{commit}" >/dev/null; then
    echo "release-publish-postcondition: FAIL (self-test baseline tag ${baseline_tag} already exists)" >&2
    return 1
  fi

  mkdir -p "$(git rev-parse --git-path facetheory-release-self-tests)"
  printf '{".": "%s"}\n' "${version}" >"${manifest_path}"

  empty_tree="$(git mktree </dev/null)"
  noop_tree="$(self_test_tree 'stable publish noop docs')"
  miss_tree="$(self_test_tree 'stable publish releasable perf')"
  baseline="$(self_test_commit "${empty_tree}" -m 'chore: seed stable baseline')"
  noop_head="$(self_test_commit "${noop_tree}" -p "${baseline}" -m 'docs: internal release note')"
  miss_head="$(self_test_commit "${miss_tree}" -p "${noop_head}" -m 'perf: self-test releasable change')"

  git update-ref "${baseline_tag}" "${baseline}"
  git update-ref "${ref_prefix}/noop" "${noop_head}"
  git update-ref "${ref_prefix}/miss" "${miss_head}"
  cleanup_refs+=("${baseline_tag}" "${ref_prefix}/noop" "${ref_prefix}/miss")

  expected_tag="v${version}"
  release_created="false"
  tag_name=""

  if ! output="$(
    (
      stable_manifest_path="${manifest_path}"
      fetch_base_branch_and_tags() { return 0; }
      resolve_base_ref() { printf '%s\n' "${ref_prefix}/noop"; }
      is_published_stable_release() { [[ "${1:-}" == "v${version}" ]]; }
      verify_stable_publish_postcondition
    ) 2>&1
  )"; then
    printf '%s\n' "${output}" >&2
    echo "release-publish-postcondition: FAIL (self-test stable already-published no-op was rejected)" >&2
    return 1
  fi
  if [[ "${output}" != *"already published v${version}; legitimate no-op"* ]]; then
    printf '%s\n' "${output}" >&2
    echo "release-publish-postcondition: FAIL (self-test stable no-op did not report already-published tolerance)" >&2
    return 1
  fi
  echo "release-publish-postcondition: PASS (self-test stable already-published tag with zero user-facing commits passed)"

  if output="$(
    (
      stable_manifest_path="${manifest_path}"
      fetch_base_branch_and_tags() { return 0; }
      resolve_base_ref() { printf '%s\n' "${ref_prefix}/miss"; }
      is_published_stable_release() { [[ "${1:-}" == "v${version}" ]]; }
      verify_stable_publish_postcondition
    ) 2>&1
  )"; then
    printf '%s\n' "${output}" >&2
    echo "release-publish-postcondition: FAIL (self-test stable genuine miss was accepted)" >&2
    return 1
  fi
  if [[ "${output}" != *"release-publish-postcondition: FAIL (release-please no-op is a failed stable publish gate; release_created=false)"* ]]; then
    printf '%s\n' "${output}" >&2
    echo "release-publish-postcondition: FAIL (self-test stable genuine miss did not preserve the fail-closed message)" >&2
    return 1
  fi
  echo "release-publish-postcondition: PASS (self-test stable already-published tag with a user-facing commit failed closed)"
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test_stable_already_published_noop
  exit $?
fi

channel="${1:-}"
release_created="${2:-}"
tag_name="${3:-}"

case "${channel}" in
  prerelease|stable) ;;
  *)
    echo "release-publish-postcondition: FAIL (usage: $0 prerelease|stable <release_created> <tag_name>)" >&2
    exit 1
    ;;
esac

expected_tag="v$(./scripts/read-version.sh)"

case "${channel}" in
  prerelease)
    if is_rc_tag "${expected_tag}"; then
      require_created_tag "RC" || exit 1
      if ! is_rc_tag "${tag_name}"; then
        echo "release-publish-postcondition: FAIL (prerelease tag ${tag_name} is not RC-shaped)" >&2
        exit 1
      fi
      echo "release-publish-postcondition: PASS (RC ${tag_name})"
      exit 0
    fi

    if [[ "${release_created}" == "true" ]]; then
      echo "release-publish-postcondition: FAIL (premain must not publish stable-shaped tag ${tag_name:-<empty>})" >&2
      exit 1
    fi

    echo "release-publish-postcondition: PASS (pending RC PR generation for ${expected_tag})"
    ;;
  stable)
    verify_stable_publish_postcondition || exit 1
    ;;
esac
