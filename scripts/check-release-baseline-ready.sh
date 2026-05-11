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

if command -v gh >/dev/null 2>&1 && gh release view "${tag}" >/dev/null 2>&1; then
  ready="true"
elif git rev-parse -q --verify "refs/tags/${tag}^{commit}" >/dev/null 2>&1; then
  ready="true"
elif git ls-remote --exit-code --tags origin "refs/tags/${tag}" >/dev/null 2>&1; then
  ready="true"
fi

if [[ "${ready}" == "true" ]]; then
  echo "release-baseline-ready: PASS (${tag})"
else
  echo "release-baseline-ready: SKIP (${tag} is not published yet; refusing to synthesize a stale changelist)"
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "ready=${ready}" >> "${GITHUB_OUTPUT}"
  echo "tag=${tag}" >> "${GITHUB_OUTPUT}"
  echo "version=${version}" >> "${GITHUB_OUTPUT}"
fi
