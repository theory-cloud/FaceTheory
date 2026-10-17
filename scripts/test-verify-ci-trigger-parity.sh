#!/usr/bin/env bash
# Purpose: prove the ci.yml gate verifiers fail closed on the bypass forms
# reproduced in review. For verify-ci-trigger-parity.sh: a negated PR base-ref
# predicate read as compliant (SAN-FW503-F1), a false event conjunct, and the
# operator ruling of 2026-09-28 -- the rubric and deterministic-build jobs are
# staging-PR-only, so regaining push or promotion coverage must fail the guard.
# For verify-ci-rubric-enforced.sh: a governance evidence upload action swapped
# while the identical coverage pin remains, a governance upload replaced by a
# `run:` step that merely echoes the pinned action/path/name, and a false
# conjunct on the trusted release-train gate. The same-symbol controls prove the
# trigger-parity evaluator correlates predicates on one workflow symbol, so a
# self-contradictory head-ref or input conjunction cannot read as satisfiable.
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

# Row 22: a false conjunct on the trusted release-train gate must not read as a
# pull-request job, and an event disjunction that never selects pull_request is
# not push/PR parity.
reset_ci
replace_job_if "github.event_name == 'pull_request'" "github.event_name == 'pull_request' && false"
expect_fail "release-train gate predicate with a false conjunct"

reset_ci
append_job "$(cat <<'YAML'
  sneaky:
    name: Sneaky push or disabled-PR job
    if: github.event_name == 'push' || (github.event_name == 'pull_request' && false)
    runs-on: ubuntu-latest
    steps:
      - run: echo sneaky
YAML
)"
expect_fail "push-only event with a disabled pull_request branch"

# Row 22 R1: predicates on the same workflow symbol are correlated. A head ref
# holds one value and each input is one boolean, so a self-contradictory
# conjunction can never hold and must fail closed rather than read as a
# satisfiable pull-request condition.
reset_ci
append_job "$(cat <<'YAML'
  sneakyhead:
    name: Sneaky head contradiction
    if: github.event_name == 'pull_request' && github.event.pull_request.head.ref == 'staging' && github.event.pull_request.head.ref == 'main'
    runs-on: ubuntu-latest
    steps:
      - run: echo sneaky
YAML
)"
expect_fail "contradictory head.ref == 'staging' && head.ref == 'main'"

reset_ci
append_job "$(cat <<'YAML'
  sneakyinput:
    name: Sneaky input contradiction
    if: github.event_name == 'workflow_dispatch' && inputs.run_full_rubric == 'true' && inputs.run_full_rubric == 'false'
    runs-on: ubuntu-latest
    steps:
      - run: echo sneaky
YAML
)"
expect_fail "contradictory inputs.x == 'true' && inputs.x == 'false'"

# Canonical positive: a single-valued head predicate on a staging pull request is
# satisfiable, so symbol correlation must not over-reject the ordinary wiring.
reset_ci
append_job "$(cat <<'YAML'

  canonical-head:
    name: Canonical head-scoped staging job
    if: github.event_name == 'pull_request' && github.event.pull_request.base.ref == 'staging' && github.event.pull_request.head.ref == 'staging'
    runs-on: ubuntu-latest
    steps:
      - run: echo canonical
YAML
)"
expect_pass "canonical single-valued head predicate on a staging PR"

# The rubric-enforced verifier shares the same ci.yml surface, so it is exercised
# here too. Seed a temp root with the files it reads so its scoped checks run
# without touching the checkout.
seed_rubric_enforced_root() {
  mkdir -p "${root}/gov-infra/verifiers"
  for workflow in prerelease.yml release.yml prerelease-pr.yml release-pr.yml; do
    cp "${repo_root}/.github/workflows/${workflow}" "${root}/.github/workflows/${workflow}"
  done
  cp "${repo_root}/Makefile" "${root}/Makefile"
  cp "${repo_root}/gov-infra/verifiers/gov-verify-rubric.sh" "${root}/gov-infra/verifiers/gov-verify-rubric.sh"
  for script in \
    check-lambda-runtime-deprecations.mjs \
    check-node-engines-floor.mjs \
    verify-ci-rubric-enforced.sh \
    build-release-assets.sh \
    render-release-notes.sh; do
    cp "${repo_root}/scripts/${script}" "${root}/scripts/${script}"
  done
}

run_rubric_guard() {
  set +e
  bash "${root}/scripts/verify-ci-rubric-enforced.sh" > "${tmpdir}/rubric-out" 2>&1
  local status=$?
  set -e
  printf '%s' "${status}"
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
    cat "${tmpdir}/rubric-out" >&2
    fail "${label}: ci-rubric guard must FAIL on the injected wiring"
  fi
}

# Replace the governance evidence upload step's action pin while leaving the
# identical pin in the unrelated TypeScript coverage step intact.
mutate_governance_upload_action() {
  python3 - "${root}/.github/workflows/ci.yml" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()
step_starts = [index for index, line in enumerate(lines) if line.startswith("      - ")]
swapped = False
for position, start in enumerate(step_starts):
    end = step_starts[position + 1] if position + 1 < len(step_starts) else len(lines)
    step = lines[start:end]
    if not any("name: Upload governance evidence" in line for line in step):
        continue
    for offset, line in enumerate(step):
        if "uses: actions/upload-artifact@" in line:
            lines[start + offset] = "        uses: attacker/evidence@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            swapped = True
            break
    break
if not swapped:
    raise SystemExit("governance evidence upload step not found")
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
}

# Replace the whole governance upload step body with a `run:` block that echoes
# the pinned action/path/name strings, leaving the step name intact.
mutate_governance_upload_to_echo() {
  python3 - "${root}/.github/workflows/ci.yml" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()
step_starts = [index for index, line in enumerate(lines) if line.startswith("      - ")]
mutated = False
for position, start in enumerate(step_starts):
    end = step_starts[position + 1] if position + 1 < len(step_starts) else len(lines)
    step = lines[start:end]
    name_index = next(
        (index for index, line in enumerate(step) if "name: Upload governance evidence" in line),
        None,
    )
    if name_index is None:
        continue
    lines[start + name_index + 1:end] = [
        "        run: |",
        '          echo "uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2"',
        '          echo "path: gov-infra/evidence/"',
        '          echo "name: gov-infra-evidence"',
    ]
    mutated = True
    break
if not mutated:
    raise SystemExit("governance evidence upload step not found")
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
}

reset_ci
seed_rubric_enforced_root
expect_rubric_pass "ci-rubric canonical wiring"

# Row 38: changing only the governance upload action must fail even though the
# coverage step still carries the pinned action.
reset_ci
mutate_governance_upload_action
expect_rubric_fail "governance upload action replaced while the coverage pin remains"

# Row 38 R1: the pinned action/path/name must be real step properties, not text a
# `run:` step prints; an echoing step fails even though every string is present.
reset_ci
mutate_governance_upload_to_echo
expect_rubric_fail "governance upload replaced by a run step echoing the pinned strings"

# Canonical positive: the shipped governance upload step, with the pinned action
# and with.path/with.name at their property positions, still passes.
reset_ci
seed_rubric_enforced_root
expect_rubric_pass "ci-rubric canonical real governance upload"


# Row 22: a false conjunct on the trusted release-train gate must fail the scoped
# condition check.
reset_ci
replace_job_if "github.event_name == 'pull_request'" "github.event_name == 'pull_request' && false"
expect_rubric_fail "ci-rubric release-train gate predicate with a false conjunct"

reset_ci
expect_rubric_pass "ci-rubric restored canonical wiring"

# Positive control: restore the shipped wiring and confirm the guard is green.
reset_ci
expect_pass "restored baseline"

echo "test-verify-ci-trigger-parity: PASS"
