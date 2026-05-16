#!/usr/bin/env bash
set -euo pipefail

repo_root="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "${repo_root}"

manifest_path="${1:-.release-please-manifest.json}"

if [[ ! -f "${manifest_path}" ]]; then
  echo "release-baseline-ready: FAIL (missing ${manifest_path})"
  exit 1
fi

version="$(
  MANIFEST_PATH="${manifest_path}" python3 - <<'PYJSON'
import json
import os
import re
from pathlib import Path

manifest = Path(os.environ["MANIFEST_PATH"])
data = json.loads(manifest.read_text(encoding="utf-8"))
version = str(data.get(".", "")).strip()
if not version:
    raise SystemExit(f"{manifest} missing package version for '.'")
if not re.match(r"^\d+\.\d+\.\d+(?:-rc(?:\.\d+)?)?$", version):
    raise SystemExit(
        f"{manifest} version {version!r} is not X.Y.Z, X.Y.Z-rc, or X.Y.Z-rc.N"
    )
print(version)
PYJSON
)"

tag="v${version}"
ready="false"
tag_ready="false"
release_ready="false"
release_state="missing"
repo="${GITHUB_REPOSITORY:-}"
api_url="${GITHUB_API_URL:-https://api.github.com}"
git_remote="${GIT_REMOTE:-origin}"
gh_bin="${GH_BIN:-gh}"
curl_bin="${CURL_BIN:-curl}"

if [[ -z "${repo}" ]]; then
  remote_url="$(git config --get remote.origin.url || true)"
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

if git ls-remote --exit-code --tags "${git_remote}" "refs/tags/${tag}" >/dev/null 2>&1; then
  tag_ready="true"
fi

release_json=""
if command -v "${gh_bin}" >/dev/null 2>&1; then
  if [[ -n "${repo}" ]]; then
    release_json="$("${gh_bin}" release view "${tag}" --repo "${repo}" --json tagName,isDraft,url 2>/dev/null || true)"
  else
    release_json="$("${gh_bin}" release view "${tag}" --json tagName,isDraft,url 2>/dev/null || true)"
  fi
fi

if [[ -z "${release_json}" && -n "${repo}" ]] && command -v "${curl_bin}" >/dev/null 2>&1; then
  tmp_release="$(mktemp)"
  trap 'rm -f "${tmp_release:-}"' EXIT
  auth_headers=()
  api_token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  if [[ -n "${api_token}" ]]; then
    auth_headers+=(--header "Authorization: Bearer ${api_token}")
  fi

  if "${curl_bin}" \
    --fail \
    --silent \
    --location \
    --output "${tmp_release}" \
    --header "Accept: application/vnd.github+json" \
    --header "X-GitHub-Api-Version: 2022-11-28" \
    "${auth_headers[@]}" \
    "${api_url%/}/repos/${repo}/releases/tags/${tag}"; then
    release_json="$(cat "${tmp_release}")"
  fi
fi

if [[ -n "${release_json}" ]]; then
  mapfile -t release_fields < <(
    RELEASE_JSON="${release_json}" python3 - <<'PYJSON'
import json
import os

data = json.loads(os.environ["RELEASE_JSON"])
print(data.get("tagName") or data.get("tag_name") or "")
print("true" if data.get("isDraft", data.get("draft")) is True else "false")
print(data.get("url") or data.get("html_url") or "")
PYJSON
  )

  release_tag="${release_fields[0]:-}"
  is_draft="${release_fields[1]:-false}"
  release_url="${release_fields[2]:-}"

  if [[ "${release_tag}" == "${tag}" ]]; then
    if [[ "${is_draft}" == "true" ]]; then
      release_state="draft"
    else
      release_ready="true"
      release_state="published"
    fi
  else
    release_state="tag-mismatch:${release_tag:-<empty>}"
  fi
fi

if [[ "${tag_ready}" == "true" && "${release_ready}" == "true" ]]; then
  ready="true"
fi

if [[ "${ready}" == "true" ]]; then
  echo "release-baseline-ready: PASS (${tag} tag and published GitHub Release exist)"
else
  echo "release-baseline-ready: SKIP (${tag} is not fully published; refusing to synthesize a stale changelist)"
  echo "release-baseline-ready: tag=${tag_ready} release=${release_state} repo=${repo:-unknown}"
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "ready=${ready}" >> "${GITHUB_OUTPUT}"
  echo "tag=${tag}" >> "${GITHUB_OUTPUT}"
  echo "version=${version}" >> "${GITHUB_OUTPUT}"
  echo "release_state=${release_state}" >> "${GITHUB_OUTPUT}"
fi
