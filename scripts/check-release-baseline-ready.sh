#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

manifest_path="${1:-.release-please-manifest.json}"

if [[ ! -f "${manifest_path}" ]]; then
  echo "release-baseline-ready: FAIL (missing ${manifest_path})"
  exit 1
fi

version="$(
  MANIFEST_PATH="${manifest_path}" python3 - <<'PY'
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
PY
)"

tag="v${version}"
ready="false"
tag_ready="false"
release_ready="false"
repo="${GITHUB_REPOSITORY:-}"
api_url="${GITHUB_API_URL:-https://api.github.com}"

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

if git ls-remote --exit-code --tags origin "refs/tags/${tag}" >/dev/null 2>&1; then
  tag_ready="true"
fi

if [[ -n "${repo}" ]] && command -v curl >/dev/null 2>&1; then
  if curl \
    --fail \
    --silent \
    --location \
    --output /dev/null \
    --header "Accept: application/vnd.github+json" \
    --header "X-GitHub-Api-Version: 2022-11-28" \
    "${api_url%/}/repos/${repo}/releases/tags/${tag}"; then
    release_ready="true"
  fi
fi

if [[ "${tag_ready}" == "true" && "${release_ready}" == "true" ]]; then
  ready="true"
fi

if [[ "${ready}" == "true" ]]; then
  echo "release-baseline-ready: PASS (${tag} tag and GitHub Release exist)"
else
  echo "release-baseline-ready: SKIP (${tag} is not fully published; refusing to synthesize a stale changelist)"
  echo "release-baseline-ready: tag=${tag_ready} release=${release_ready} repo=${repo:-unknown}"
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "ready=${ready}" >> "${GITHUB_OUTPUT}"
  echo "tag=${tag}" >> "${GITHUB_OUTPUT}"
  echo "version=${version}" >> "${GITHUB_OUTPUT}"
fi
