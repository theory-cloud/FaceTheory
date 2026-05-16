#!/usr/bin/env bash
set -euo pipefail

tag="${1:-}"
dist_dir="${2:-dist}"
gh_bin="${GH_BIN:-gh}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="${GITHUB_REPOSITORY:-}"
if [[ -z "${tag}" ]]; then
  echo "release-assets: FAIL (missing tag name)"
  exit 1
fi
if [[ ! -d "${dist_dir}" ]]; then
  echo "release-assets: FAIL (missing asset directory ${dist_dir})"
  exit 1
fi
if ! command -v "${gh_bin}" >/dev/null 2>&1; then
  echo "release-assets: FAIL (${gh_bin} not found)"
  exit 1
fi

if [[ -z "${repo}" ]]; then
  remote_url="$(git config --get remote.origin.url 2>/dev/null || true)"
  case "${remote_url}" in
    https://github.com/*.git)
      repo="${remote_url#https://github.com/}"
      repo="${repo%.git}"
      ;;
    https://github.com/*)
      repo="${remote_url#https://github.com/}"
      ;;
    git@github.com:*.git)
      repo="${remote_url#git@github.com:}"
      repo="${repo%.git}"
      ;;
  esac
fi
if [[ -z "${repo}" ]]; then
  echo "release-assets: FAIL (missing GITHUB_REPOSITORY and could not infer repo)"
  exit 1
fi

release_json="$(GH_BIN="${gh_bin}" GITHUB_REPOSITORY="${repo}" "${script_dir}/release-json-by-tag.sh" "${tag}" || true)"
if [[ -z "${release_json}" ]]; then
  echo "release-assets: FAIL (draft release ${tag} not found)"
  exit 1
fi

mapfile -t release_fields < <(
  RELEASE_JSON="${release_json}" python3 - <<'PY'
import json
import os

data = json.loads(os.environ["RELEASE_JSON"])
print(data.get("tagName") or data.get("tag_name") or "")
print(str(data.get("id") or data.get("databaseId") or ""))
print("true" if data.get("isDraft", data.get("draft")) is True else "false")
print("true" if data.get("isPrerelease", data.get("prerelease")) is True else "false")
print(data.get("uploadUrl") or data.get("upload_url") or "")
print(data.get("url") or data.get("html_url") or "")
PY
)

release_tag="${release_fields[0]:-}"
release_id="${release_fields[1]:-}"
is_draft="${release_fields[2]:-false}"
is_prerelease="${release_fields[3]:-false}"
upload_url="${release_fields[4]:-}"
release_url="${release_fields[5]:-}"

if [[ "${release_tag}" != "${tag}" ]]; then
  echo "release-assets: FAIL (release tag ${release_tag:-<empty>} != ${tag})"
  exit 1
fi
if [[ "${is_draft}" != "true" ]]; then
  echo "release-assets: FAIL (release is already published; immutable releases prevent adding assets/notes)"
  exit 1
fi
if [[ "${tag}" =~ -rc(\.|$) && "${is_prerelease}" != "true" ]]; then
  echo "release-assets: FAIL (${tag} draft must be marked prerelease)"
  exit 1
fi
if [[ ! "${tag}" =~ -rc(\.|$) && "${is_prerelease}" == "true" ]]; then
  echo "release-assets: FAIL (${tag} stable draft must not be marked prerelease)"
  exit 1
fi

assets=(
  "${dist_dir}"/theory-cloud-facetheory*.tgz
  "${dist_dir}"/facetheory-reference-*.tar.gz
  "${dist_dir}"/SHA256SUMS.txt
)

shopt -s nullglob
asset_paths=()
for asset_glob in "${assets[@]}"; do
  for asset_path in ${asset_glob}; do
    asset_paths+=("${asset_path}")
  done
done
shopt -u nullglob

if [[ "${#asset_paths[@]}" -eq 0 ]]; then
  echo "release-assets: FAIL (no release assets found in ${dist_dir})"
  exit 1
fi

if [[ -n "${release_id}" ]]; then
  mapfile -t existing_assets < <("${gh_bin}" api "repos/${repo}/releases/${release_id}/assets" --jq '.[].name' 2>/dev/null || true)
  upload_base="${upload_url%%\{*}"
  if [[ -z "${upload_base}" ]]; then
    upload_base="https://uploads.github.com/repos/${repo}/releases/${release_id}/assets"
  fi

  for asset_path in "${asset_paths[@]}"; do
    asset_name="$(basename "${asset_path}")"
    if printf '%s\n' "${existing_assets[@]}" | grep -Fxq "${asset_name}"; then
      echo "release-assets: skip existing ${asset_name}"
      continue
    fi
    encoded_name="$(ASSET_NAME="${asset_name}" python3 - <<'PY'
import os
import urllib.parse
print(urllib.parse.quote(os.environ["ASSET_NAME"]))
PY
)"
    "${gh_bin}" api \
      --method POST \
      "${upload_base}?name=${encoded_name}" \
      --header "Content-Type: application/octet-stream" \
      --input "${asset_path}" \
      >/dev/null
  done

  prerelease_field="false"
  if [[ "${tag}" =~ -rc(\.|$) ]]; then
    prerelease_field="true"
  fi
  "${gh_bin}" api \
    --method PATCH \
    "repos/${repo}/releases/${release_id}" \
    -F draft=false \
    -F prerelease="${prerelease_field}" \
    >/dev/null
  echo "release-assets: published ${tag}${release_url:+ (${release_url})}"
  exit 0
fi

# Fallback for normal tagged drafts where the GitHub CLI can address the release by tag.
mapfile -t existing_assets < <("${gh_bin}" release view "${tag}" --repo "${repo}" --json assets --jq '.assets[].name' 2>/dev/null || true)
for asset_path in "${asset_paths[@]}"; do
  asset_name="$(basename "${asset_path}")"
  if printf '%s\n' "${existing_assets[@]}" | grep -Fxq "${asset_name}"; then
    echo "release-assets: skip existing ${asset_name}"
    continue
  fi
  "${gh_bin}" release upload "${tag}" "${asset_path}" --repo "${repo}"
done

prerelease_flag=""
if [[ "${tag}" =~ -rc(\.|$) ]]; then
  prerelease_flag="--prerelease"
fi
"${gh_bin}" release edit "${tag}" --repo "${repo}" --draft=false ${prerelease_flag}
echo "release-assets: published ${tag}"
