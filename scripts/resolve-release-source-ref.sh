#!/usr/bin/env bash
set -euo pipefail

tag="${1:-}"
gh_bin="${GH_BIN:-gh}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
git_remote="${GIT_REMOTE:-origin}"

resolve_release_target() {
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
      echo "release-source-ref: FAIL (release target ${target} is not a branch or immutable commit)" >&2
      return 1
      ;;
    *)
      branch="${target}"
      ;;
  esac

  if [[ -z "${branch}" ]]; then
    echo "release-source-ref: FAIL (release target branch is empty)" >&2
    return 1
  fi
  if ! git check-ref-format "refs/heads/${branch}" >/dev/null 2>&1; then
    echo "release-source-ref: FAIL (release target ${target} is not a valid branch ref)" >&2
    return 1
  fi

  resolved="$(
    git ls-remote --exit-code "${git_remote}" "refs/heads/${branch}" 2>/dev/null |
      awk 'NR == 1 { print $1 }'
  )"
  if [[ -z "${resolved}" ]]; then
    echo "release-source-ref: FAIL (release target ${target} did not resolve on ${git_remote})" >&2
    return 1
  fi
  if [[ ! "${resolved}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "release-source-ref: FAIL (release target ${target} resolved to non-commit ${resolved})" >&2
    return 1
  fi

  echo "release-source-ref: release target ${target} resolved to immutable commit ${resolved}" >&2
  printf '%s\n' "${resolved}"
}

resolve_tag_commit() {
  local tag_name="$1"
  local refs=""
  local direct=""
  local peeled=""
  local sha=""
  local ref=""

  if [[ -z "${tag_name}" ]]; then
    return 1
  fi
  if ! git check-ref-format "refs/tags/${tag_name}" >/dev/null 2>&1; then
    return 1
  fi

  refs="$(
    git ls-remote --exit-code "${git_remote}" \
      "refs/tags/${tag_name}" \
      "refs/tags/${tag_name}^{}" 2>/dev/null || true
  )"
  if [[ -z "${refs}" ]]; then
    return 1
  fi

  while read -r sha ref; do
    case "${ref}" in
      "refs/tags/${tag_name}^{}")
        peeled="${sha}"
        ;;
      "refs/tags/${tag_name}")
        direct="${sha}"
        ;;
    esac
  done <<<"${refs}"

  sha="${peeled:-${direct}}"
  if [[ ! "${sha}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "release-source-ref: FAIL (tag ${tag_name} resolved to non-commit ${sha:-<empty>})" >&2
    return 1
  fi

  printf '%s\n' "${sha}"
}

if [[ -z "${tag}" ]]; then
  echo "source_ref=${GITHUB_REF:-}"
  echo "release_is_draft=false"
  exit 0
fi

release_json="${RELEASE_JSON:-}"
if [[ -z "${release_json}" ]] && command -v "${gh_bin}" >/dev/null 2>&1; then
  release_json="$(GH_BIN="${gh_bin}" "${script_dir}/release-json-by-tag.sh" "${tag}" || true)"
fi

tag_commit="$(resolve_tag_commit "${tag}" || true)"

if [[ -z "${release_json}" ]]; then
  if [[ -n "${tag_commit}" ]]; then
    echo "source_ref=refs/tags/${tag}"
    echo "release_is_draft=false"
    echo "release_source_commit=${tag_commit}"
    echo "release_tag_commit=${tag_commit}"
  else
    echo "source_ref=${tag}"
    echo "release_is_draft=false"
  fi
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

release_target_commit="$(resolve_release_target "${target_commitish}")"
source_ref="${release_target_commit}"
source_commit="${release_target_commit}"

if [[ "${is_draft}" == "true" ]]; then
  if [[ "${tag}" =~ -rc(\.|$) && "${is_prerelease}" != "true" ]]; then
    echo "release-source-ref: FAIL (${tag} draft must be marked prerelease)" >&2
    exit 1
  fi
  if [[ ! "${tag}" =~ -rc(\.|$) && "${is_prerelease}" == "true" ]]; then
    echo "release-source-ref: FAIL (${tag} stable draft must not be marked prerelease)" >&2
    exit 1
  fi
fi

if [[ -n "${tag_commit}" ]]; then
  source_ref="refs/tags/${tag}"
  source_commit="${tag_commit}"
  if [[ "${release_target_commit}" != "${tag_commit}" ]]; then
    echo "release-source-ref: FAIL (${tag} tag resolves to ${tag_commit}, release target resolves to ${release_target_commit})" >&2
    [[ -n "${release_url}" ]] && echo "release-source-ref: release ${release_url}" >&2
    exit 1
  fi
  echo "release-source-ref: existing tag ${tag} resolves to immutable commit ${tag_commit}" >&2
  echo "release-source-ref: release target ${target_commitish} matches tag commit ${tag_commit}${release_url:+ (${release_url})}" >&2
elif [[ "${is_draft}" == "true" ]]; then
  echo "release-source-ref: draft ${tag} targets ${target_commitish} as ${release_target_commit}${release_url:+ (${release_url})}" >&2
fi

echo "source_ref=${source_ref}"
echo "release_is_draft=${is_draft}"
echo "release_target=${target_commitish}"
echo "release_target_commit=${release_target_commit}"
echo "release_source_commit=${source_commit}"
if [[ -n "${tag_commit}" ]]; then
  echo "release_tag_commit=${tag_commit}"
fi
echo "release_id=${release_id}"
