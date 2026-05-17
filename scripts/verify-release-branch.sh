#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="${REPO_ROOT:-$(cd "${script_dir}/.." && pwd)}"
cd "${repo_root}"

tag="${1:-${GITHUB_REF_NAME:-}}"
if [[ -z "${tag}" ]]; then
  echo "release-branch: FAIL (missing tag name)"
  exit 1
fi

if [[ ! -f "VERSION" ]]; then
  echo "release-branch: FAIL (missing VERSION)"
  exit 1
fi

expected_version="$(
  python3 - <<'PY'
from pathlib import Path

line = Path("VERSION").read_text(encoding="utf-8").splitlines()[0]
version = line.split("#", 1)[0].strip()
if not version:
    raise SystemExit("version: FAIL (empty VERSION)")
print(version)
PY
)"
expected_tag="v${expected_version}"

if [[ "${tag}" != "${expected_tag}" ]]; then
  echo "release-branch: FAIL (tag ${tag} != ${expected_tag})"
  exit 1
fi

remote="${GIT_REMOTE:-origin}"
main_branch="${MAIN_BRANCH:-main}"
premain_branch="${PREMAIN_BRANCH:-premain}"

main_ref="refs/remotes/${remote}/${main_branch}"
premain_ref="refs/remotes/${remote}/${premain_branch}"

if ! git show-ref --verify --quiet "${main_ref}"; then
  echo "release-branch: FAIL (missing ${main_ref}; run: git fetch ${remote} ${main_branch})"
  exit 1
fi

commit="$(git rev-parse HEAD)"

if [[ "${expected_version}" =~ -rc(\.|$) ]]; then
  if ! git show-ref --verify --quiet "${premain_ref}"; then
    echo "release-branch: FAIL (missing ${premain_ref}; run: git fetch ${remote} ${premain_branch})"
    exit 1
  fi
  if ! git merge-base --is-ancestor "${commit}" "${premain_ref}"; then
    echo "release-branch: FAIL (${expected_tag} must be tagged from ${premain_branch})"
    exit 1
  fi
else
  if ! git merge-base --is-ancestor "${commit}" "${main_ref}"; then
    echo "release-branch: FAIL (${expected_tag} must be tagged from ${main_branch})"
    exit 1
  fi
fi

echo "release-branch: PASS (${expected_tag})"
