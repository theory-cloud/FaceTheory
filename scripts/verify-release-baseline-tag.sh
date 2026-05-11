#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

manifest_path="${1:-.release-please-manifest.json}"

if [[ ! -f "${manifest_path}" ]]; then
  echo "release-baseline: FAIL (missing ${manifest_path})"
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
    raise SystemExit(f"{manifest} version {version!r} is not X.Y.Z, X.Y.Z-rc, or X.Y.Z-rc.N")
print(version)
PY
)"

tag="v${version}"

# Ensure local tag data is present when the workflow checkout did not fetch tags.
if git remote get-url origin >/dev/null 2>&1; then
  git fetch --quiet origin "refs/tags/${tag}:refs/tags/${tag}" 2>/dev/null || true
fi

if ! git rev-parse -q --verify "refs/tags/${tag}^{commit}" >/dev/null; then
  echo "release-baseline: FAIL (${manifest_path} points to ${version}, but ${tag} is not a git tag)"
  exit 1
fi

if ! git merge-base --is-ancestor "${tag}" HEAD; then
  echo "release-baseline: FAIL (${tag} is not an ancestor of HEAD)"
  exit 1
fi

echo "release-baseline: PASS (${tag})"
