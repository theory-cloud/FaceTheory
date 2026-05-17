#!/usr/bin/env bash
set -euo pipefail

tag="${1:-}"
gh_bin="${GH_BIN:-gh}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
git_remote="${GIT_REMOTE:-origin}"

resolve_draft_target() {
  local target="$1"
  local branch=""
  local resolved=""

  if [[ "${target}" =~ ^[0-9a-f]{40}$ ]]; then
    printf '%s\n' "${target}"
    return 0
  fi

  case "${target}" in
    refs/heads/*)
      branch="${target#refs/heads/}"
      ;;
    refs/*)
      echo "release-source-ref: FAIL (draft target ${target} is not a branch or immutable commit)" >&2
      return 1
      ;;
    *)
      branch="${target}"
      ;;
  esac

  if [[ -z "${branch}" ]]; then
    echo "release-source-ref: FAIL (draft target branch is empty)" >&2
    return 1
  fi
  if ! git check-ref-format "refs/heads/${branch}" >/dev/null 2>&1; then
    echo "release-source-ref: FAIL (draft target ${target} is not a valid branch ref)" >&2
    return 1
  fi

  resolved="$(
    git ls-remote --exit-code "${git_remote}" "refs/heads/${branch}" 2>/dev/null |
      awk 'NR == 1 { print $1 }'
  )"
  if [[ -z "${resolved}" ]]; then
    echo "release-source-ref: FAIL (draft target ${target} did not resolve on ${git_remote})" >&2
    return 1
  fi
  if [[ ! "${resolved}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "release-source-ref: FAIL (draft target ${target} resolved to non-commit ${resolved})" >&2
    return 1
  fi

  echo "release-source-ref: draft target ${target} resolved to immutable commit ${resolved}" >&2
  printf '%s\n' "${resolved}"
}

if [[ -z "${tag}" ]]; then
  echo "source_ref=${GITHUB_REF:-}"
  echo "release_is_draft=false"
  exit 0
fi

if ! command -v "${gh_bin}" >/dev/null 2>&1; then
  echo "release-source-ref: FAIL (${gh_bin} not found)" >&2
  exit 1
fi

release_json="$(GH_BIN="${gh_bin}" "${script_dir}/release-json-by-tag.sh" "${tag}" || true)"

if [[ -z "${release_json}" ]]; then
  echo "source_ref=${tag}"
  echo "release_is_draft=false"
  exit 0
fi

mapfile -t release_fields < <(
  RELEASE_JSON="${release_json}" python3 - <<'PY'
import json
import os

data = json.loads(os.environ["RELEASE_JSON"])
print(data.get("tagName") or data.get("tag_name") or "")
print(data.get("targetCommitish") or data.get("target_commitish") or "")
print("true" if data.get("isDraft", data.get("draft")) is True else "false")
print("true" if data.get("isPrerelease", data.get("prerelease")) is True else "false")
print(data.get("url") or data.get("html_url") or "")
print(str(data.get("id") or data.get("databaseId") or ""))
PY
)

release_tag="${release_fields[0]:-}"
target_commitish="${release_fields[1]:-}"
is_draft="${release_fields[2]:-false}"
is_prerelease="${release_fields[3]:-false}"
release_url="${release_fields[4]:-}"
release_id="${release_fields[5]:-}"

if [[ "${release_tag}" != "${tag}" ]]; then
  echo "release-source-ref: FAIL (release tag ${release_tag:-<empty>} != ${tag})" >&2
  exit 1
fi
if [[ -z "${target_commitish}" ]]; then
  echo "release-source-ref: FAIL (${tag} missing targetCommitish)" >&2
  exit 1
fi
if [[ "${is_draft}" == "true" ]]; then
  if [[ "${tag}" =~ -rc(\.|$) && "${is_prerelease}" != "true" ]]; then
    echo "release-source-ref: FAIL (${tag} draft must be marked prerelease)" >&2
    exit 1
  fi
  if [[ ! "${tag}" =~ -rc(\.|$) && "${is_prerelease}" == "true" ]]; then
    echo "release-source-ref: FAIL (${tag} stable draft must not be marked prerelease)" >&2
    exit 1
  fi
  source_ref="$(resolve_draft_target "${target_commitish}")"
  echo "release-source-ref: draft ${tag} targets ${target_commitish} as ${source_ref} (${release_url})" >&2
else
  source_ref="${target_commitish}"
fi

echo "source_ref=${source_ref}"
echo "release_is_draft=${is_draft}"
echo "release_target=${target_commitish}"
echo "release_source_commit=${source_ref}"
echo "release_id=${release_id}"
