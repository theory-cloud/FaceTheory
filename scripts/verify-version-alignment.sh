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

manifest_check_output="$(
  EXPECTED_VERSION="${expected_version}" python3 - <<'PY'
import json
import os
import re
from pathlib import Path

expected = os.environ["EXPECTED_VERSION"]
semver = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-rc(?:\.\d+)?)?$")


def base(value: str) -> str:
    value = value.strip()
    if value.startswith("v"):
        value = value[1:]
    value = value.split("+", 1)[0]
    return value.split("-", 1)[0]


def base_tuple(value: str) -> tuple[int, int, int]:
    return tuple(int(part) for part in base(value).split("."))


def is_rc(value: str) -> bool:
    return "-rc" in value.split("+", 1)[0]


def load_manifest(path: str) -> str:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"missing {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid {path}: {exc}")

    value = str(data.get(".", "")).strip()
    if not value:
        raise SystemExit(f"{path} missing package version for '.'")
    if not semver.match(value):
        raise SystemExit(
            f"{path} version {value!r} is not X.Y.Z, X.Y.Z-rc, or X.Y.Z-rc.N"
        )
    return value


stable = load_manifest(".release-please-manifest.json")
premain = load_manifest(".release-please-manifest.premain.json")

if not semver.match(expected):
    raise SystemExit(f"VERSION {expected!r} is not X.Y.Z, X.Y.Z-rc, or X.Y.Z-rc.N")

if is_rc(expected):
    if premain != expected:
        raise SystemExit(
            f".release-please-manifest.premain.json {premain} != prerelease VERSION {expected}"
        )
    if base_tuple(stable) > base_tuple(expected):
        raise SystemExit(
            f".release-please-manifest.json {stable} is ahead of prerelease VERSION {expected}"
        )
else:
    if stable != expected:
        raise SystemExit(
            f".release-please-manifest.json {stable} != stable VERSION {expected}"
        )
    if base(premain) != expected:
        raise SystemExit(
            f".release-please-manifest.premain.json {premain} must align to release-candidate base {expected}"
        )
PY
)" || {
  echo "version-alignment: FAIL (${manifest_check_output})"
  exit 1
}

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

checks = {
    "README.md": [
        f"## Install {version_tag}",
        f"export FACETHEORY_VERSION={version}",
        "theory-cloud-facetheory-${FACETHEORY_VERSION}.tgz",
        f"The `{version_tag}` GitHub release also ships the matching `facetheory-reference-${{FACETHEORY_VERSION}}.tar.gz` bundle",
    ],
    "docs/README.md": [
        f"The `{version_tag}` GitHub release ships the runtime tarball, a reference bundle with docs plus examples, and `SHA256SUMS.txt`",
    ],
    "docs/api-reference.md": [
        f"export FACETHEORY_VERSION={version}",
        "theory-cloud-facetheory-${FACETHEORY_VERSION}.tgz",
    ],
    "docs/getting-started.md": [
        f"export FACETHEORY_VERSION={version}",
        "theory-cloud-facetheory-${FACETHEORY_VERSION}.tgz",
        f"The `{version_tag}` GitHub release includes the matching `facetheory-reference-${{FACETHEORY_VERSION}}.tar.gz` bundle",
    ],
    "ts/README.md": [
        f"## Install {version_tag}",
        f"export FACETHEORY_VERSION={version}",
        "theory-cloud-facetheory-${FACETHEORY_VERSION}.tgz",
        f"{docs_base}/getting-started.md",
        f"{docs_base}/api-reference.md",
        f"{docs_base}/core-patterns.md",
        f"{docs_base}/testing-guide.md",
        f"{docs_base}/cdk/README.md",
        f"The `{version_tag}` release also includes the matching `facetheory-reference-${{FACETHEORY_VERSION}}.tar.gz` bundle",
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
