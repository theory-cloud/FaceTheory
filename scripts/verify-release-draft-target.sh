#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="${REPO_ROOT:-$(cd "${script_dir}/.." && pwd)}"
cd "${repo_root}"

tag="${1:-${GITHUB_REF_NAME:-}}"
expected_ref="${2:-HEAD}"

if [[ -z "${tag}" ]]; then
  echo "release-draft-target: FAIL (missing tag name)"
  exit 1
fi

if [[ ! -f "VERSION" ]]; then
  echo "release-draft-target: FAIL (missing VERSION)"
  exit 1
fi

expected_version="$(./scripts/read-version.sh)"
expected_tag="v${expected_version}"
if [[ "${tag}" != "${expected_tag}" ]]; then
  echo "release-draft-target: FAIL (tag ${tag} != ${expected_tag})"
  exit 1
fi

expected_commit="$(git rev-parse "${expected_ref}^{commit}")"

gh_bin="${GH_BIN:-gh}"
if ! command -v "${gh_bin}" >/dev/null 2>&1; then
  echo "release-draft-target: FAIL (${gh_bin} not found)"
  exit 1
fi

release_json="$(GH_BIN="${gh_bin}" "${script_dir}/release-json-by-tag.sh" "${tag}" 2>/dev/null || true)"
if [[ -z "${release_json}" ]]; then
  echo "release-draft-target: FAIL (draft release ${tag} not found)"
  exit 1
fi

export RELEASE_JSON="${release_json}"
mapfile -t release_fields < <(
  python3 - <<'PY'
import json
import os

data = json.loads(os.environ["RELEASE_JSON"])
print(data.get("tagName") or data.get("tag_name") or "")
print(data.get("targetCommitish") or data.get("target_commitish") or "")
print("true" if data.get("isDraft", data.get("draft")) is True else "false")
print("true" if data.get("isPrerelease", data.get("prerelease")) is True else "false")
print(data.get("url") or data.get("html_url") or "")
PY
)

release_tag="${release_fields[0]:-}"
target_commitish="${release_fields[1]:-}"
is_draft="${release_fields[2]:-false}"
is_prerelease="${release_fields[3]:-false}"
release_url="${release_fields[4]:-}"

if [[ "${release_tag}" != "${tag}" ]]; then
  echo "release-draft-target: FAIL (release tag ${release_tag:-<empty>} != ${tag})"
  exit 1
fi

if [[ "${is_draft}" != "true" ]]; then
  echo "release-draft-target: FAIL (${tag} must still be a draft before asset upload)"
  exit 1
fi

if [[ "${expected_version}" =~ -rc(\.|$) ]]; then
  if [[ "${is_prerelease}" != "true" ]]; then
    echo "release-draft-target: FAIL (${tag} must be marked prerelease)"
    exit 1
  fi
elif [[ "${is_prerelease}" == "true" ]]; then
  echo "release-draft-target: FAIL (${tag} stable release must not be marked prerelease)"
  exit 1
fi

if [[ -z "${target_commitish}" ]]; then
  echo "release-draft-target: FAIL (${tag} missing targetCommitish)"
  exit 1
fi

resolve_target_commit() {
  local ref="$1"

  git rev-parse --verify --quiet "${ref}^{commit}" 2>/dev/null && return 0
  git rev-parse --verify --quiet "refs/remotes/origin/${ref}^{commit}" 2>/dev/null && return 0

  local remote="${GIT_REMOTE:-origin}"
  local resolved=""
  resolved="$(git ls-remote "${remote}" "refs/heads/${ref}" 2>/dev/null | awk 'NR == 1 { print $1 }' || true)"
  if [[ -n "${resolved}" ]]; then
    printf '%s\n' "${resolved}"
    return 0
  fi

  resolved="$(git ls-remote "${remote}" "refs/tags/${ref}" 2>/dev/null | awk 'NR == 1 { print $1 }' || true)"
  if [[ -n "${resolved}" ]]; then
    printf '%s\n' "${resolved}"
    return 0
  fi

  return 1
}

target_commit="$(resolve_target_commit "${target_commitish}" || true)"
if [[ -z "${target_commit}" ]]; then
  echo "release-draft-target: FAIL (could not resolve ${tag} targetCommitish ${target_commitish})"
  exit 1
fi

if [[ "${target_commit}" != "${expected_commit}" ]]; then
  echo "release-draft-target: FAIL (${tag} targets ${target_commit}, expected ${expected_commit})"
  [[ -n "${release_url}" ]] && echo "release-draft-target: release ${release_url}"
  exit 1
fi

echo "release-draft-target: PASS (${tag} -> ${expected_commit})"
