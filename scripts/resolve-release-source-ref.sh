#!/usr/bin/env bash
set -euo pipefail

tag="${1:-}"
gh_bin="${GH_BIN:-gh}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
  echo "release-source-ref: draft ${tag} targets ${target_commitish} (${release_url})" >&2
fi

echo "source_ref=${target_commitish}"
echo "release_is_draft=${is_draft}"
echo "release_target=${target_commitish}"
echo "release_id=${release_id}"
