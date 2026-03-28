#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ ! -f "VERSION" ]]; then
  echo "version-alignment: FAIL (missing VERSION)"
  exit 1
fi

expected_version="$(./scripts/read-version.sh)"
if [[ -z "${expected_version}" ]]; then
  echo "version-alignment: FAIL (empty VERSION)"
  exit 1
fi

if [[ ! "${expected_version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-rc(\.[0-9]+)?)?$ ]]; then
  echo "version-alignment: FAIL (VERSION '${expected_version}' must match X.Y.Z, X.Y.Z-rc, or X.Y.Z-rc.N)"
  exit 1
fi

if [[ ! -f "ts/package.json" ]]; then
  echo "version-alignment: FAIL (missing ts/package.json)"
  exit 1
fi

ts_version="$(
  python3 - <<'PY'
import json
from pathlib import Path

data = json.loads(Path("ts/package.json").read_text(encoding="utf-8"))
print(data.get("version", ""))
PY
)"

if [[ -z "${ts_version}" ]]; then
  echo "version-alignment: FAIL (ts/package.json missing version)"
  exit 1
fi

if [[ "${ts_version}" != "${expected_version}" ]]; then
  echo "version-alignment: FAIL (ts/package.json ${ts_version} != ${expected_version})"
  exit 1
fi

if [[ -f "ts/package-lock.json" ]]; then
  lock_version="$(
    python3 - <<'PY'
import json
from pathlib import Path

data = json.loads(Path("ts/package-lock.json").read_text(encoding="utf-8"))
print(data.get("version", ""))
PY
  )"

  pkg_lock_version="$(
    python3 - <<'PY'
import json
from pathlib import Path

data = json.loads(Path("ts/package-lock.json").read_text(encoding="utf-8"))
packages = data.get("packages", {})
root = packages.get("", {}) if isinstance(packages, dict) else {}
print(root.get("version", ""))
PY
  )"

  if [[ "${lock_version}" != "${expected_version}" ]]; then
    echo "version-alignment: FAIL (ts/package-lock.json ${lock_version} != ${expected_version})"
    exit 1
  fi

  if [[ "${pkg_lock_version}" != "${expected_version}" ]]; then
    echo "version-alignment: FAIL (ts/package-lock.json packages[''].version ${pkg_lock_version} != ${expected_version})"
    exit 1
  fi
fi

EXPECTED_VERSION="${expected_version}" python3 - <<'PY'
import os
from pathlib import Path

version = os.environ["EXPECTED_VERSION"]
version_tag = f"v{version}"
docs_base = f"https://github.com/theory-cloud/FaceTheory/blob/{version_tag}/docs"
release_url = (
    "https://github.com/theory-cloud/FaceTheory/releases/download/"
    f"{version_tag}/theory-cloud-facetheory-{version}.tgz"
)

checks = {
    "README.md": [
        f"## Install {version_tag}",
        release_url,
        f"The `{version_tag}` GitHub release also ships `facetheory-reference-{version}.tar.gz`",
    ],
    "docs/README.md": [
        f"The `{version_tag}` GitHub release ships the runtime tarball, a reference bundle with docs plus examples, and `SHA256SUMS.txt`",
    ],
    "docs/api-reference.md": [
        release_url,
    ],
    "docs/getting-started.md": [
        release_url,
        f"The `{version_tag}` GitHub release includes `facetheory-reference-{version}.tar.gz`",
    ],
    "ts/README.md": [
        f"## Install {version_tag}",
        release_url,
        f"{docs_base}/getting-started.md",
        f"{docs_base}/api-reference.md",
        f"{docs_base}/core-patterns.md",
        f"{docs_base}/testing-guide.md",
        f"{docs_base}/cdk/README.md",
        f"The `{version_tag}` release also includes `facetheory-reference-{version}.tar.gz`",
    ],
}

failures: list[str] = []
for path_str, expected_snippets in checks.items():
    path = Path(path_str)
    if not path.is_file():
        failures.append(f"missing {path_str}")
        continue
    text = path.read_text(encoding="utf-8")
    for snippet in expected_snippets:
        if snippet not in text:
            failures.append(f"{path_str} missing {snippet}")

if failures:
    print("version-alignment: FAIL")
    for failure in failures:
        print(f"- {failure}")
    raise SystemExit(1)
PY

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  expected_tag="v${expected_version}"
  mapfile -t vtags < <(git tag --points-at HEAD | grep -E '^v' || true)
  for vtag in "${vtags[@]}"; do
    if [[ "${vtag}" != "${expected_tag}" ]]; then
      echo "version-alignment: FAIL (tag ${vtag} != ${expected_tag})"
      exit 1
    fi
  done
fi

echo "version-alignment: PASS (${expected_version})"
