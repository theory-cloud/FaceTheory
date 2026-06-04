#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail() {
  echo "ci-rubric: FAIL ($1)" >&2
  exit 1
}

require_contains() {
  local path="$1"
  local needle="$2"
  local description="$3"

  grep -Fq -- "${needle}" "${path}" || fail "${description}; missing ${needle} in ${path}"
}

require_not_contains() {
  local path="$1"
  local needle="$2"
  local description="$3"

  if grep -Fq -- "${needle}" "${path}"; then
    fail "${description}; unexpected ${needle} in ${path}"
  fi
}

require_release_pr_postcondition_checkout() {
  local workflow="$1"
  local protected_branch="$2"
  local channel="$3"

  if ! python3 - "${workflow}" "${protected_branch}" "${channel}" <<'PY'
import re
import sys
from pathlib import Path

workflow = Path(sys.argv[1])
protected_branch = sys.argv[2]
channel = sys.argv[3]
lines = workflow.read_text(encoding="utf-8").splitlines()

job_start = None
for index, line in enumerate(lines):
    if line == "  release-please:":
        job_start = index
        break
if job_start is None:
    raise SystemExit(f"{workflow}: missing release-please job")

job_end = len(lines)
for index in range(job_start + 1, len(lines)):
    line = lines[index]
    if re.match(r"^  [A-Za-z0-9_-]+:\s*$", line):
        job_end = index
        break

job_lines = lines[job_start:job_end]
script = f"scripts/verify-release-pr-postcondition.sh {channel}"
postcondition_indexes = [
    index for index, line in enumerate(job_lines) if script in line
]
if not postcondition_indexes:
    raise SystemExit(f"{workflow}: missing postcondition run for {channel}")
postcondition_index = postcondition_indexes[0]

release_action_indexes = [
    index
    for index, line in enumerate(job_lines[:postcondition_index])
    if "googleapis/release-please-action@" in line
]
if not release_action_indexes:
    raise SystemExit(
        f"{workflow}: postcondition for {channel} does not follow release-please"
    )
last_release_action_index = max(release_action_indexes)

step_starts = [
    index
    for index, line in enumerate(job_lines)
    if re.match(r"^      - name:", line)
]

expected_ref = (
    "ref: ${{ github.event_name == 'workflow_dispatch' && '"
    + protected_branch
    + "' || github.sha }}"
)
for position, start in enumerate(step_starts):
    if start <= last_release_action_index or start >= postcondition_index:
        continue
    end = step_starts[position + 1] if position + 1 < len(step_starts) else len(job_lines)
    step_text = "\n".join(job_lines[start:end])
    if "uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2" not in step_text:
        continue
    missing = [
        needle
        for needle in (
            "persist-credentials: false",
            expected_ref,
        )
        if needle not in step_text
    ]
    if missing:
        raise SystemExit(
            f"{workflow}: trusted checkout before {channel} postcondition is missing "
            + ", ".join(missing)
        )
    break
else:
    raise SystemExit(
        f"{workflow}: {channel} postcondition can run without a trusted "
        f"{protected_branch}/github.sha checkout in the release-please job"
    )
PY
  then
    fail "${workflow} ${channel} postcondition must checkout trusted ${protected_branch} verifier code"
  fi
}

ci=".github/workflows/ci.yml"

require_contains "${ci}" "  release-train-promotion:" "CI must define the release train promotion gate"
require_contains "${ci}" "ref: refs/heads/staging" "release train gate must checkout trusted staging verifier code"
require_contains "${ci}" "scripts/verify-release-train-promotion.sh" "release train gate must use the verifier script"
require_contains "${ci}" "  rubric:" "CI must define the full rubric job"
require_contains "${ci}" "run: make rubric" "CI rubric job must run make rubric"
require_contains "${ci}" "run_full_rubric:" "manual CI dispatch must expose an explicit full-rubric toggle"
require_contains "${ci}" "default: true" "manual CI dispatch must continue to run the full rubric by default"
require_contains \
  "${ci}" \
  "if: (github.event_name == 'workflow_dispatch' && (inputs.run_full_rubric == true || inputs.run_full_rubric == 'true')) || (github.event_name == 'pull_request' && github.event.pull_request.base.ref == 'staging')" \
  "full rubric must run only for PRs targeting staging plus opted-in manual dispatch"
require_contains "${ci}" "  deterministic-builds:" "CI must define the standalone deterministic-build job"
require_contains "${ci}" "name: Verify deterministic builds" "CI must keep the deterministic-build job name stable for branch protection visibility"
require_contains "${ci}" "run: scripts/verify-deterministic-builds.sh" "deterministic-build job must run the verifier script"
require_contains \
  "${ci}" \
  "if: (github.event_name == 'workflow_dispatch' && (inputs.run_deterministic_builds == true || inputs.run_deterministic_builds == 'true')) || (github.event_name == 'pull_request' && github.event.pull_request.base.ref == 'staging')" \
  "deterministic builds must run only for PRs targeting staging plus opted-in manual dispatch"

for release_path in \
  ".github/workflows/prerelease.yml" \
  ".github/workflows/release.yml" \
  "scripts/build-release-assets.sh" \
  "scripts/render-release-notes.sh"; do
  require_not_contains "${release_path}" "make rubric" "full rubric must not run in release build/publish paths"
  require_not_contains "${release_path}" "Verify deterministic builds" "deterministic builds must not be a release build/publish path"
  require_not_contains "${release_path}" "scripts/verify-deterministic-builds.sh" "release build/publish paths must not run deterministic builds"
done

require_contains ".github/workflows/prerelease.yml" "scripts/verify-release-publish-postcondition.sh prerelease" \
  "prerelease publisher must fail closed on release-please no-op after generated RC release PR merges"
require_contains ".github/workflows/release.yml" "scripts/verify-release-publish-postcondition.sh stable" \
  "stable publisher must fail closed on release-please no-op after generated stable release PR merges"
require_contains ".github/workflows/prerelease-pr.yml" "scripts/verify-release-pr-postcondition.sh prerelease" \
  "premain release PR generation must fail closed on release-please no-op"
require_contains ".github/workflows/release-pr.yml" "scripts/verify-release-pr-postcondition.sh stable" \
  "main release PR generation must fail closed on release-please no-op"
require_release_pr_postcondition_checkout ".github/workflows/prerelease-pr.yml" "premain" "prerelease"
require_release_pr_postcondition_checkout ".github/workflows/release-pr.yml" "main" "stable"

if grep -R -Fq 'run: scripts/verify-deterministic-builds.sh' .github/workflows/prerelease.yml .github/workflows/release.yml; then
  fail "release workflows must not run deterministic builds"
fi

echo "ci-rubric: PASS"
