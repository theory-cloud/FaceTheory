#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guard="${repo_root}/scripts/verify-release-python-isolation.sh"

fail() {
  echo "test-verify-release-python-isolation: FAIL ($*)"
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

# Positive: the committed release workflows and publish helper are isolated.
mkdir -p "${tmpdir}/positive/.github/workflows" "${tmpdir}/positive/scripts"
cp "${repo_root}/.github/workflows/prerelease.yml" "${tmpdir}/positive/.github/workflows/"
cp "${repo_root}/.github/workflows/release.yml" "${tmpdir}/positive/.github/workflows/"
cp "${repo_root}/scripts/trigger_theorycloud_publish.sh" "${tmpdir}/positive/scripts/"
REPO_ROOT="${tmpdir}/positive" bash "${guard}" >/dev/null ||
  fail "committed workflows unexpectedly failed the isolation guard"

# Negative static: dropping -I from a token-bearing step must fail the guard.
mkdir -p "${tmpdir}/negative/.github/workflows" "${tmpdir}/negative/scripts"
cp "${repo_root}/.github/workflows/prerelease.yml" "${tmpdir}/negative/.github/workflows/"
cp "${repo_root}/.github/workflows/release.yml" "${tmpdir}/negative/.github/workflows/"
cp "${repo_root}/scripts/trigger_theorycloud_publish.sh" "${tmpdir}/negative/scripts/"
python3 - "${tmpdir}/negative/.github/workflows/prerelease.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
path.write_text(path.read_text(encoding="utf-8").replace("python3 -I -", "python3 -", 1), encoding="utf-8")
PY
if REPO_ROOT="${tmpdir}/negative" bash "${guard}" >/dev/null 2>&1; then
  fail "workflow step without -I unexpectedly passed the isolation guard"
fi

# Runtime: a repo-committed json.py must not run under `python3 -I`.
shadow_dir="${tmpdir}/shadow"
mkdir -p "${shadow_dir}"
cat > "${shadow_dir}/json.py" <<'PY'
import os

with open(os.environ["FAKE_JSON_MARKER"], "w", encoding="utf-8") as handle:
    handle.write(os.environ.get("RELEASE_PLEASE_TOKEN", ""))


def dumps(*_args, **_kwargs):
    return "SHADOW"
PY

isolated_output="$(
  cd "${shadow_dir}"
  FAKE_JSON_MARKER="${shadow_dir}/isolated-marker" \
    RELEASE_PLEASE_TOKEN="synthetic-token-not-real" \
    python3 -I - <<'PY'
import json

print(json.dumps({"release": "v1.2.3"}))
PY
)"
[[ ! -e "${shadow_dir}/isolated-marker" ]] ||
  fail "isolated python imported the repository json.py shadow"
[[ "${isolated_output}" == '{"release": "v1.2.3"}' ]] ||
  fail "isolated python did not parse valid JSON release metadata as before (got: ${isolated_output})"

# Control: without -I the same shadow DOES execute, proving the reproduced defect.
plain_output="$(
  cd "${shadow_dir}"
  FAKE_JSON_MARKER="${shadow_dir}/shadow-marker" \
    RELEASE_PLEASE_TOKEN="synthetic-token-not-real" \
    python3 - <<'PY'
import json

print(json.dumps({"release": "v1.2.3"}))
PY
)"
[[ -e "${shadow_dir}/shadow-marker" ]] ||
  fail "control run without -I did not reproduce the import-shadow mechanism"
[[ "$(cat "${shadow_dir}/shadow-marker")" == "synthetic-token-not-real" ]] ||
  fail "control run did not expose the synthetic token to the shadow"
[[ "${plain_output}" == "SHADOW" ]] ||
  fail "control run did not prove the shadow replaced the stdlib module"

echo "test-verify-release-python-isolation: PASS"
