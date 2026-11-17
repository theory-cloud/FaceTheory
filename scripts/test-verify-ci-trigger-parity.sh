#!/usr/bin/env bash
# Purpose: prove the CI-shape guards fail closed on the old shape and on the
# bypass forms this wave had to close.
#
# For verify-ci-trigger-parity.sh (MAI-4 / REL-1): a push trigger regained by
# ci.yml, a gate re-executed in CI, the verify job widened past staging or given
# a toolchain, a head-branch check without the head-repository equality
# condition, a head check that checks out the pull request or reads the pull
# request outside its dispatch binding, a head check that asks for write access
# or loses the dispatch path a generated release pull request needs, a `run:`
# body that interpolates a workflow expression, an unlisted push-triggered
# workflow, and a registry whose catch-all scope was dropped.
#
# For verify-ci-rubric-enforced.sh: the executing rubric restored, the pack or
# deterministic-build gate restored to CI, and the verify job given a toolchain.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  echo "test-verify-ci-trigger-parity: FAIL ($*)" >&2
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

root="${tmpdir}/root"
mkdir -p "${root}"
tar -C "${repo_root}" -cf - .github scripts gov-infra Makefile \
  CHANGELOG.md CHANGELOG.prerelease.md \
  .release-please-manifest.json .release-please-manifest.premain.json \
  release-please-config.json release-please-config.premain.json \
  | tar -C "${root}" -xf -

reset() {
  rm -rf "${root}/.github" "${root}/scripts" "${root}/gov-infra" "${root}/Makefile"
  tar -C "${repo_root}" -cf - .github scripts gov-infra Makefile \
    CHANGELOG.md CHANGELOG.prerelease.md \
    .release-please-manifest.json .release-please-manifest.premain.json \
    release-please-config.json release-please-config.premain.json \
    | tar -C "${root}" -xf -
  cp "${repo_root}/scripts/verify-ci-trigger-parity.sh" "${root}/scripts/verify-ci-trigger-parity.sh"
  cp "${repo_root}/scripts/verify-ci-rubric-enforced.sh" "${root}/scripts/verify-ci-rubric-enforced.sh"
}

run_guard() {
  set +e
  bash "${root}/scripts/verify-ci-trigger-parity.sh" >"${tmpdir}/out" 2>&1
  local status=$?
  set -e
  printf '%s' "${status}"
}

run_rubric_guard() {
  set +e
  bash "${root}/scripts/verify-ci-rubric-enforced.sh" >"${tmpdir}/rubric-out" 2>&1
  local status=$?
  set -e
  printf '%s' "${status}"
}

expect_pass() {
  local label="$1"
  local status
  status="$(run_guard)"
  if [[ "${status}" != "0" ]]; then
    cat "${tmpdir}/out" >&2
    fail "${label}: guard must PASS on the canonical wiring"
  fi
}

expect_fail() {
  local label="$1"
  local status
  status="$(run_guard)"
  if [[ "${status}" == "0" ]]; then
    fail "${label}: guard must FAIL on the injected wiring"
  fi
}

expect_rubric_pass() {
  local label="$1"
  local status
  status="$(run_rubric_guard)"
  if [[ "${status}" != "0" ]]; then
    cat "${tmpdir}/rubric-out" >&2
    fail "${label}: ci-rubric guard must PASS on the canonical wiring"
  fi
}

expect_rubric_fail() {
  local label="$1"
  local status
  status="$(run_rubric_guard)"
  if [[ "${status}" == "0" ]]; then
    fail "${label}: ci-rubric guard must FAIL on the injected wiring"
  fi
}

replace_line() {
  python3 - "${root}/$1" "$2" "$3" <<'PY'
import sys
from pathlib import Path

path, needle, replacement = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
lines = path.read_text(encoding="utf-8").splitlines()
for index, line in enumerate(lines):
    if needle in line:
        lines[index] = line.replace(needle, replacement)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        break
else:
    raise SystemExit(f"needle {needle!r} not found in {path}")
PY
}

replace_job_if() {
  python3 - "${root}/.github/workflows/ci.yml" "$1" "$2" <<'PY'
import re
import sys
from pathlib import Path

path, job_id, replacement = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
lines = path.read_text(encoding="utf-8").splitlines()
start = None
for index, line in enumerate(lines):
    if line == f"  {job_id}:":
        start = index
        break
if start is None:
    raise SystemExit(f"job {job_id!r} not found")
for index in range(start + 1, len(lines)):
    if re.match(r"^  [A-Za-z0-9_-]+:\s*$", lines[index]):
        break
    if lines[index].startswith("    if:"):
        lines[index] = f"    if: {replacement}"
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        raise SystemExit(0)
raise SystemExit(f"job {job_id!r} has no job-level if:")

PY
}

insert_line() {
  python3 - "${root}/$1" "$2" "$3" <<'PY'
import sys
from pathlib import Path

path, anchor, inserted = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
lines = path.read_text(encoding="utf-8").splitlines()
for index, line in enumerate(lines):
    if line.strip() == anchor.strip():
        lines.insert(index + 1, inserted)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        break
else:
    raise SystemExit(f"anchor {anchor!r} not found in {path}")
PY
}

# --- baseline --------------------------------------------------------------
reset
expect_pass "baseline"
reset
expect_rubric_pass "ci-rubric baseline"

# --- MAI-4: no gate-class push trigger ------------------------------------
reset
insert_line .github/workflows/ci.yml "on:" "  push:"
expect_fail "ci.yml regained a push trigger"

reset
insert_line .github/workflows/ci.yml "on:" "  workflow_dispatch:"
expect_fail "ci.yml regained a manual dispatch"

reset
python3 - "${root}/.github/workflows/legacy-gates.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
path.write_text(
    "name: Legacy gates\n\n"
    "on:\n"
    "  pull_request:\n"
    "  push:\n"
    "    branches: [staging]\n\n"
    "permissions:\n"
    "  contents: read\n\n"
    "jobs:\n"
    "  rubric:\n"
    "    name: rubric\n"
    "    runs-on: ubuntu-latest\n"
    "    steps:\n"
    "      - run: bash scripts/evidence/verify-all.sh\n",
    encoding="utf-8",
)
PY
expect_fail "an unlisted push-triggered workflow appeared in the workflow directory"

# --- MAI-4: no gate executes in CI ----------------------------------------
reset
replace_line .github/workflows/ci.yml "run: bash scripts/evidence/verify-all.sh" \
  "run: bash gov-infra/verifiers/gov-verify-rubric.sh"
expect_fail "the rubric executed again in CI"

reset
python3 - "${root}/scripts/evidence/validation-gates.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
registry = json.loads(path.read_text(encoding="utf-8"))
registry["releaseNotes"]["exact"].append("VERSION")
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
expect_rubric_fail "ci-rubric: an unreviewed release-notes path entered the class"

reset
replace_line .github/workflows/ci.yml "run: bash scripts/evidence/verify-all.sh" \
  "run: bash scripts/verify-ts-pack.sh"
expect_fail "the pack gate executed in CI"

reset
insert_line .github/workflows/ci.yml "      - name: Verify the recorded evidence for every gate and proof profile" \
  "      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0"
expect_fail "the verify job provisioned a toolchain"

# --- MAI-4: no gate on a release-branch pull request ----------------------
reset
replace_job_if rubric "github.event.pull_request.base.ref == 'staging' || github.event.pull_request.base.ref == 'premain'"
expect_fail "the verify job widened onto a release branch"

# --- REL-1: the head-branch check ----------------------------------------
reset
replace_line .github/workflows/promotion-hygiene.yml \
  "HEAD_REPOSITORY: \${{ github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name || github.repository }}" \
  "HEAD_REPOSITORY: \${{ github.repository }}"
expect_fail "the head check stopped requiring the head repository"

reset
insert_line .github/workflows/promotion-hygiene.yml "    steps:" \
  "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1"
expect_fail "the head check checked out the pull request"

reset
replace_line .github/workflows/promotion-hygiene.yml "release_branch='premain'" \
  "release_branch='\${{ github.base_ref }}'"
expect_fail "the head check interpolated a workflow expression inside run"

reset
replace_line .github/workflows/promotion-hygiene.yml "  pull-requests: read" \
  "  pull-requests: write"
expect_fail "the head check asked for a write permission"

reset
replace_line .github/workflows/promotion-hygiene.yml "  pull-requests: read" \
  "  contents: read"
expect_fail "the head check lost its pull request read access"

reset
replace_line .github/workflows/promotion-hygiene.yml "  workflow_dispatch:" "  schedule:"
expect_fail "the head check lost the dispatch path a generated release PR needs"

reset
python3 - "${root}/.github/workflows/promotion-hygiene.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
path.write_text(
    text.replace(
        "    steps:\n",
        "    steps:\n"
        "      - name: Read the pull request on the pull_request path\n"
        "        run: |\n"
        "          gh api repos/example/example/pulls/1\n",
        1,
    ),
    encoding="utf-8",
)
PY
expect_fail "a gh read slipped onto the pull_request path"

reset
replace_line .github/workflows/promotion-hygiene.yml '    branches: ["premain", "main"]' \
  '    branches: ["premain"]'
expect_fail "the head check stopped reporting on main"

# --- the catch-all scope --------------------------------------------------
reset
python3 - "${root}/scripts/evidence/validation-gates.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
registry = json.loads(path.read_text(encoding="utf-8"))
registry["gates"]["rubric"]["paths"] = ["docs/"]
path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
PY
expect_fail "the rubric gate lost its catch-all scope"

# --- the ci-rubric guard --------------------------------------------------
reset
replace_line .github/workflows/ci.yml "run: bash scripts/evidence/verify-all.sh" \
  "run: bash gov-infra/verifiers/gov-verify-rubric.sh"
expect_rubric_fail "ci-rubric: the rubric executed again in CI"

reset
replace_line .github/workflows/ci.yml "run: bash scripts/evidence/verify-all.sh" \
  "run: scripts/verify-deterministic-builds.sh"
expect_rubric_fail "ci-rubric: deterministic builds executed in CI"

reset
insert_line .github/workflows/ci.yml "on:" "  push:"
expect_rubric_fail "ci-rubric: ci.yml regained a push trigger"

# --- restored baseline ----------------------------------------------------
reset
expect_pass "restored baseline"
reset
expect_rubric_pass "ci-rubric restored baseline"

echo "test-verify-ci-trigger-parity: PASS"
