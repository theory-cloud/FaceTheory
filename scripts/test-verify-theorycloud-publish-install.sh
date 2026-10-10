#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guard="${repo_root}/scripts/verify-theorycloud-publish-install.sh"
workflow_rel=".github/workflows/theorycloud-facetheory-subtree-publish.yml"
requirements_rel=".github/requirements/theorycloud-publish-awscurl.txt"

fail() {
  echo "test-verify-theorycloud-publish-install: FAIL ($*)"
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

seed() {
  local target="$1"
  mkdir -p "${target}/.github/workflows" "${target}/.github/requirements"
  cp "${repo_root}/${workflow_rel}" "${target}/${workflow_rel}"
  cp "${repo_root}/${requirements_rel}" "${target}/${requirements_rel}"
}

run_guard() {
  REPO_ROOT="$1" bash "${guard}"
}

expect_pass() {
  local label="$1" target="$2"
  if ! run_guard "${target}" >/dev/null 2>&1; then
    fail "${label} unexpectedly failed the guard"
  fi
}

expect_fail() {
  local label="$1" target="$2"
  if run_guard "${target}" >/dev/null 2>&1; then
    fail "${label} unexpectedly passed the guard"
  fi
}

# Positive: the committed publisher satisfies every invariant.
seed "${tmpdir}/positive"
expect_pass "committed publisher" "${tmpdir}/positive"

# Negative: a requirements file whose install drops --require-hashes.
seed "${tmpdir}/unhashed-install"
python3 - "${tmpdir}/unhashed-install/${workflow_rel}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
path.write_text(text.replace("--require-hashes --no-deps", "--no-deps"), encoding="utf-8")
PY
expect_fail "install without --require-hashes" "${tmpdir}/unhashed-install"

# Negative: a floating pip upgrade re-appears.
seed "${tmpdir}/pip-upgrade"
python3 - "${tmpdir}/pip-upgrade/${workflow_rel}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
needle = "          python3 -m pip install --user --require-hashes --no-deps \\\n"
replacement = "          python3 -m pip install --user --upgrade pip\n" + needle
path.write_text(text.replace(needle, replacement, 1), encoding="utf-8")
PY
expect_fail "floating pip upgrade" "${tmpdir}/pip-upgrade"

# Negative: credentials acquired before the mutable install (the original defect
# ordering). Swap the install and role-assumption steps.
seed "${tmpdir}/creds-first"
python3 - "${tmpdir}/creds-first/${workflow_rel}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
install_start = next(i for i, line in enumerate(lines) if line.strip() == "- name: Install hash-locked awscurl publisher toolchain")
assume_start = next(i for i, line in enumerate(lines) if line.strip() == "- name: Assume stage-scoped theorycloud publish role")
assume_end = next((i for i in range(assume_start + 1, len(lines)) if lines[i].startswith("      - name:")), len(lines))
install_block = lines[install_start:assume_start]
assume_block = lines[assume_start:assume_end]
lines = lines[:install_start] + assume_block + install_block + lines[assume_end:]
path.write_text("".join(lines), encoding="utf-8")
PY
expect_fail "credentials before install" "${tmpdir}/creds-first"

# Negative: an unpinned requirement.
seed "${tmpdir}/unpinned"
python3 - "${tmpdir}/unpinned/${requirements_rel}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
path.write_text(text.replace("awscurl==0.44", "awscurl", 1), encoding="utf-8")
PY
expect_fail "unpinned requirement" "${tmpdir}/unpinned"

# Negative: a requirement with no artifact hash.
seed "${tmpdir}/nohash"
python3 - "${tmpdir}/nohash/${requirements_rel}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()
first_hash = next(i for i, line in enumerate(lines) if line.strip().startswith("--hash=sha256:"))
requirement_index = first_hash - 1
lines[requirement_index] = lines[requirement_index].rstrip().rstrip("\\").rstrip()
while requirement_index + 1 < len(lines) and lines[requirement_index + 1].strip().startswith("--hash=sha256:"):
    del lines[requirement_index + 1]
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
expect_fail "requirement without hash" "${tmpdir}/nohash"

# Negative: the workflow installs a requirements file that does not exist.
seed "${tmpdir}/missing-requirements"
rm -f "${tmpdir}/missing-requirements/${requirements_rel}"
expect_fail "missing requirements file" "${tmpdir}/missing-requirements"

echo "test-verify-theorycloud-publish-install: PASS"
