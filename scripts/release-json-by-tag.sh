#!/usr/bin/env bash
set -euo pipefail

tag="${1:-}"
gh_bin="${GH_BIN:-gh}"
repo="${GITHUB_REPOSITORY:-}"
max_pages="${RELEASE_SEARCH_MAX_PAGES:-10}"

if [[ -z "${tag}" ]]; then
  echo "release-json-by-tag: FAIL (missing tag)" >&2
  exit 1
fi

if ! command -v "${gh_bin}" >/dev/null 2>&1; then
  echo "release-json-by-tag: FAIL (${gh_bin} not found)" >&2
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

if [[ -n "${repo}" ]]; then
  page=1
  while [[ "${page}" -le "${max_pages}" ]]; do
    releases_json="$("${gh_bin}" api "repos/${repo}/releases?per_page=100&page=${page}" 2>/dev/null || true)"
    [[ -z "${releases_json}" ]] && break

    match="$(
      printf '%s' "${releases_json}" | TAG_NAME="${tag}" python3 -c '''
import json
import os
import sys

tag = os.environ["TAG_NAME"]
try:
    data = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(0)
if not isinstance(data, list):
    sys.exit(0)
for release in data:
    if isinstance(release, dict) and release.get("tag_name") == tag:
        wanted = (
            "id",
            "tag_name",
            "target_commitish",
            "draft",
            "prerelease",
            "html_url",
            "upload_url",
        )
        print(json.dumps({key: release.get(key) for key in wanted if key in release}, separators=(",", ":")))
        break
'''
    )"
    if [[ -n "${match}" ]]; then
      printf '%s\n' "${match}"
      exit 0
    fi

    count="$(
      printf '%s' "${releases_json}" | python3 -c '''
import json
import sys
try:
    data = json.load(sys.stdin)
except json.JSONDecodeError:
    print(0)
else:
    print(len(data) if isinstance(data, list) else 0)
''' || printf '0'
    )"
    [[ "${count}" =~ ^[0-9]+$ ]] || count=0
    [[ "${count}" -lt 100 ]] && break
    page=$((page + 1))
  done
fi

if [[ -n "${repo}" ]]; then
  "${gh_bin}" release view "${tag}" \
    --repo "${repo}" \
    --json tagName,targetCommitish,isDraft,isPrerelease,url,databaseId,uploadUrl \
    2>/dev/null || true
else
  "${gh_bin}" release view "${tag}" \
    --json tagName,targetCommitish,isDraft,isPrerelease,url,databaseId,uploadUrl \
    2>/dev/null || true
fi
