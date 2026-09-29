#!/usr/bin/env bash
# Purpose: prove the trigger-parity guard fails closed on the bypass forms
# reproduced in review (SAN-FW503-F1: a negated PR base-ref predicate read as
# compliant) and encodes the operator ruling of 2026-09-28 -- the rubric and
# deterministic-build jobs are staging-PR-only, so regaining push or promotion
# coverage must fail the guard.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guard="${repo_root}/scripts/verify-ci-trigger-parity.sh"

fail() {
  echo "test-verify-ci-trigger-parity: FAIL ($*)" >&2
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

root="${tmpdir}/root"
mkdir -p "${root}/.github/workflows" "${root}/scripts"
cp "${guard}" "${root}/scripts/verify-ci-trigger-parity.sh"
for workflow in ci.yml pages.yml theorycloud-facetheory-subtree-publish.yml release-branch-bootstrap.yml; do
  cp "${repo_root}/.github/workflows/${workflow}" "${root}/.github/workflows/${workflow}"
done

reset_ci() {
  cp "${repo_root}/.github/workflows/ci.yml" "${root}/.github/workflows/ci.yml"
}

run_guard() {
  set +e
  bash "${root}/scripts/verify-ci-trigger-parity.sh" > "${tmpdir}/out" 2>&1
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
    cat "${tmpdir}/out" >&2
    fail "${label}: guard must FAIL on the injected wiring"
  fi
}

append_job() {
  cat >> "${root}/.github/workflows/ci.yml" <<YAML

${1}
YAML
}

replace_job_if() {
  python3 - "${root}/.github/workflows/ci.yml" "$1" "$2" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
needle, replacement = sys.argv[2], sys.argv[3]
lines = path.read_text(encoding="utf-8").splitlines()
for index, line in enumerate(lines):
    if line.startswith("    if:") and needle in line:
        lines[index] = "    if: " + replacement
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        break
else:
    raise SystemExit(f"job-level if: for {needle!r} not found")
PY
}

add_pull_request_branch_filter() {
  python3 - "${root}/.github/workflows/ci.yml" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()
for index, line in enumerate(lines):
    if line.startswith("on:"):
        lines[index + 1:index + 1] = [
            "  pull_request:",
            "    branches:",
            "      - main",
        ]
        break
else:
    raise SystemExit("on: block not found")
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
}

replace_ci_job_text() { # <job-id> <old-text> <new-text>
  python3 - "${root}/.github/workflows/ci.yml" "$1" "$2" "$3" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
job, old, new = sys.argv[2], sys.argv[3], sys.argv[4]
lines = path.read_text(encoding="utf-8").split("\n")

start = None
for index, line in enumerate(lines):
    if line == f"  {job}:":
        start = index
        break
if start is None:
    raise SystemExit(f"job {job!r} not found")

end = len(lines)
for index in range(start + 1, len(lines)):
    if re.match(r"^  [A-Za-z0-9_-]+:\s*$", lines[index]):
        end = index
        break

block = "\n".join(lines[start:end])
if old not in block:
    raise SystemExit(f"fixture text not found in job {job!r}: {old!r}")
lines[start:end] = block.replace(old, new, 1).split("\n")
path.write_text("\n".join(lines), encoding="utf-8")
PY
}

# Baseline: the shipped wiring (rubric/deterministic staging-PR-only) is clean.
reset_ci
expect_pass "baseline"

# A negated base-ref predicate must not read as compliant: a promotion-only job
# with no staging counterpart is exactly the gap this checker exists to catch.
reset_ci
append_job "$(cat <<'YAML'
  sneaky:
    name: Sneaky promotion job
    if: github.event_name == 'pull_request' && github.event.pull_request.base.ref != 'staging'
    runs-on: ubuntu-latest
    steps:
      - run: echo sneaky
YAML
)"
expect_fail "negated base-ref predicate (base.ref != 'staging')"

reset_ci
append_job "$(cat <<'YAML'
  sneaky:
    name: Sneaky promotion job
    if: github.event_name == 'pull_request' && !(github.event.pull_request.base.ref == 'staging')
    runs-on: ubuntu-latest
    steps:
      - run: echo sneaky
YAML
)"
expect_fail "negated base-ref predicate (!(base.ref == 'staging'))"

# The ruling: the rubric and deterministic-build jobs may not regain push or
# all-base PR coverage.
reset_ci
replace_job_if run_full_rubric "(github.event_name == 'workflow_dispatch' && (inputs.run_full_rubric == true || inputs.run_full_rubric == 'true')) || github.event_name == 'push' || github.event_name == 'pull_request'"
expect_fail "rubric regained push and all-base PR coverage"

reset_ci
replace_job_if run_deterministic_builds "(github.event_name == 'workflow_dispatch' && (inputs.run_deterministic_builds == true || inputs.run_deterministic_builds == 'true')) || github.event_name == 'push' || github.event_name == 'pull_request'"
expect_fail "deterministic builds regained push and all-base PR coverage"

reset_ci
replace_job_if run_full_rubric "github.event_name == 'pull_request' && github.event.pull_request.base.ref == 'premain'"
expect_fail "rubric scoped to promotion base premain"

# A pull_request branch filter can silently remove the rubric from the staging
# pull request, which is the only place it runs.
reset_ci
add_pull_request_branch_filter
expect_fail "pull_request trigger gained a branches filter"

# The post-release main back-merge exemption must stay narrow: only the staging
# readiness lane may opt in, and only against the pull-request head ref and head
# repository. The promotion-edge readiness lanes must never opt in.
reset_ci
replace_ci_job_text staging-readiness '--allow-main-backmerge ' ''
expect_fail "staging readiness lost the post-release main back-merge opt-in"

reset_ci
replace_ci_job_text staging-readiness \
  'PR_HEAD_REF: ${{ github.event.pull_request.head.ref }}' \
  'PR_HEAD_REF: ${{ github.ref_name }}'
expect_fail "the exemption head-ref binding was widened to a non-pull-request expression"

reset_ci
replace_ci_job_text staging-readiness \
  'PR_HEAD_REPOSITORY: ${{ github.event.pull_request.head.repo.full_name }}' \
  'PR_HEAD_REPOSITORY: ${{ github.repository }}'
expect_fail "the exemption head-repository binding was widened to this repository"

reset_ci
replace_ci_job_text prerelease-readiness \
  'scripts/verify-release-readiness.sh origin/premain origin/staging prerelease' \
  'scripts/verify-release-readiness.sh origin/premain origin/staging prerelease --allow-main-backmerge'
expect_fail "the promotion-edge readiness lane took the post-release main back-merge exemption"

# Positive control: restore the shipped wiring and confirm the guard is green.
reset_ci
expect_pass "restored baseline"

echo "test-verify-ci-trigger-parity: PASS"
