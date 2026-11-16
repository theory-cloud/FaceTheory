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
    if "uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1" not in step_text:
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

# --- the verified-once CI shape (MAI-4) ------------------------------------
#
# The rubric no longer executes in CI. The `rubric` job verifies the committed
# evidence record for every gate and every tracked proof profile, and a missing
# or stale record fails it. These assertions are what make the old executing
# shape fail here rather than only in review.

require_contains "${ci}" "  rubric:" "CI must define the rubric verify job"
require_contains "${ci}" "    name: rubric" "the rubric verify job must keep the required context name"
require_contains "${ci}" "    if: github.event.pull_request.base.ref == 'staging'" \
  "the rubric verify job must be scoped to pull requests targeting staging"
require_contains "${ci}" "run: bash scripts/evidence/verify-all.sh" \
  "the rubric job must verify the recorded evidence"
require_not_contains "${ci}" "run: bash gov-infra/verifiers/gov-verify-rubric.sh" \
  "the rubric must not execute in CI"
require_not_contains "${ci}" "run: scripts/verify-ts-pack.sh" "the pack gate must not execute in CI"
require_not_contains "${ci}" "run: scripts/verify-deterministic-builds.sh" \
  "deterministic builds must not execute in CI"
require_not_contains "${ci}" "actions/setup-node" "the verify job must provision no toolchain"
require_not_contains "${ci}" "actions/setup-go" "the verify job must provision no toolchain"
require_not_contains "${ci}" "actions/upload-artifact" "the verify job must upload no artifact"
require_not_contains "${ci}" "run: cd ts && npm ci --ignore-scripts" "CI must not install a package tree"

if grep -Eq '^  push:' "${ci}"; then
  fail "CI must not trigger on push; the merged tree is the tree the pull request verified"
fi
if grep -Eq '^  workflow_dispatch:' "${ci}"; then
  fail "CI must not offer a manual dispatch: it would be an execution path with no record"
fi
require_contains "${ci}" "  version-alignment:" "CI must keep the fast version-alignment job"
require_contains "${ci}" "run: scripts/verify-version-alignment.sh" \
  "version alignment must run the verifier"
require_contains "${ci}" "  staging-readiness:" "CI must keep the PR -> staging release readiness job"
require_contains "${ci}" "name: Release readiness (PR -> staging)" \
  "PR -> staging readiness job name must stay stable for branch protection visibility"
require_contains "${ci}" "scripts/verify-release-readiness.sh origin/staging HEAD staging" \
  "PR -> staging readiness must check the pull request's own commits"

registry="scripts/evidence/validation-gates.json"
require_contains "${registry}" '"paths": ["**"]' \
  "the rubric gate must keep a catch-all input scope so tooling edits stale the record"
require_contains "${registry}" '"argv": ["make", "rubric"]' \
  "the rubric gate must record the repository's one rubric entry point"
if ! python3 - "${registry}" <<'PY'
import json
import sys
from pathlib import Path

registry = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
gates = registry.get("gates") or {}
profiles = registry.get("proofProfiles") or {}
problems = []
rubric = gates.get("rubric") or {}
if "**" not in (rubric.get("paths") or []):
    problems.append("the rubric gate must keep a '**' input scope")
if not rubric.get("profiles"):
    problems.append("the rubric gate must declare a proof profile")
for gate_id, gate in gates.items():
    if not gate.get("commands"):
        problems.append(f"gate {gate_id!r} declares no approved command")
    for profile in gate.get("profiles") or []:
        declaration = profiles.get(profile)
        if declaration is None:
            problems.append(f"gate {gate_id!r} names undeclared profile {profile!r}")
            continue
        if not (declaration.get("environment") or {}):
            problems.append(f"profile {profile!r} declares no environment")
if not registry.get("evidenceDirectory"):
    problems.append("the registry must declare an evidence directory")
if problems:
    print("ci-rubric: FAIL (evidence registry shape)")
    for problem in problems:
        print(f"- {problem}")
    sys.exit(1)
PY
then
  fail "the evidence registry must declare its gates, profiles and catch-all scope"
fi

require_contains ".github/workflows/promotion-hygiene.yml" "name: promotion-hygiene" \
  "the head-branch check must report under the required context name"
require_contains ".github/workflows/promotion-hygiene.yml" \
  "github.event.pull_request.head.repo.full_name" \
  "the head-branch check must require the head repository to be this repository"
require_contains ".github/workflows/promotion-hygiene.yml" "release-please--branches--premain" \
  "the head-branch check must accept the generated premain release-please branch"
require_contains ".github/workflows/promotion-hygiene.yml" "release-please--branches--main" \
  "the head-branch check must accept the generated main release-please branch"

# The gate commands keep their scanned surfaces. These are input-scope pins: if a
# surface drops out of the scanner, the recorded proof no longer covers it.
require_contains \
  "scripts/check-node-engines-floor.mjs" \
  "ts/package-lock.json" \
  "node engines floor gate must scan ts/package-lock.json"
require_contains \
  "scripts/check-node-engines-floor.mjs" \
  "infra/apptheory-ssr-site/package-lock.json" \
  "node engines floor gate must scan infra/apptheory-ssr-site/package-lock.json"
require_contains \
  "scripts/check-node-engines-floor.mjs" \
  "infra/apptheory-ssg-isr-site/package-lock.json" \
  "node engines floor gate must scan infra/apptheory-ssg-isr-site/package-lock.json"
# The scanned-surface pins are quote-anchored deliberately. The bare paths also
# appear in the checker's header comment, so an unanchored needle is satisfied
# by that prose even after both surface lists are emptied; anchoring on the
# quoted array element pins the constant instead of the comment.
require_contains \
  "scripts/check-lambda-runtime-deprecations.mjs" \
  '"infra/apptheory-ssr-site/src/stack.ts",' \
  "deprecated runtime gate must scan infra/apptheory-ssr-site/src/stack.ts"
require_contains \
  "scripts/check-lambda-runtime-deprecations.mjs" \
  '"infra/apptheory-ssg-isr-site/src/stack.ts",' \
  "deprecated runtime gate must scan infra/apptheory-ssg-isr-site/src/stack.ts"
require_contains \
  "scripts/check-lambda-runtime-deprecations.mjs" \
  '"ts/src/create-templates/index.ts",' \
  "deprecated runtime gate must scan ts/src/create-templates/index.ts"

for release_path in \
  ".github/workflows/prerelease.yml" \
  ".github/workflows/release.yml" \
  "scripts/build-release-assets.sh" \
  "scripts/render-release-notes.sh"; do
  require_not_contains "${release_path}" "make rubric" "full rubric must not run in release build/publish paths"
  require_not_contains "${release_path}" "gov-infra/verifiers/gov-verify-rubric.sh" "full rubric must not run in release build/publish paths"
  require_not_contains "${release_path}" "Verify deterministic builds" "deterministic builds must not be a release build/publish path"
  require_not_contains "${release_path}" "scripts/verify-deterministic-builds.sh" "release build/publish paths must not run deterministic builds"
done

python3 - <<'PY'
import re
from pathlib import Path

makefile = Path("Makefile").read_text(encoding="utf-8").splitlines()
recipe = []
inside = False
for line in makefile:
    if re.match(r"^rubric:\s*", line):
        inside = True
        continue
    if inside and line and not line.startswith(("\t", " ")) and re.match(r"^[A-Za-z0-9_.-]+:\s*", line):
        break
    if inside:
        recipe.append(line)

recipe_text = "\n".join(recipe)
if "bash gov-infra/verifiers/gov-verify-rubric.sh" not in recipe_text:
    raise SystemExit("ci-rubric: FAIL (Makefile rubric target must call the gov-infra verifier)")

verifier = Path("gov-infra/verifiers/gov-verify-rubric.sh")
if not verifier.is_file():
    raise SystemExit("ci-rubric: FAIL (missing gov-infra verifier)")

if re.search(r"(^|[^A-Za-z0-9_-])make\s+rubric([^A-Za-z0-9_-]|$)", verifier.read_text(encoding="utf-8")):
    raise SystemExit("ci-rubric: FAIL (gov-infra verifier must not call make rubric)")
PY

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

# CI installs nothing any more: the install happens where the gate runs, and the
# release workflows keep their own hardened install below.
require_contains \
  ".github/workflows/prerelease.yml" \
  "cd ts && npm ci --ignore-scripts" \
  "prerelease installs must disable npm install scripts"
require_contains \
  ".github/workflows/release.yml" \
  "cd ts && npm ci --ignore-scripts" \
  "release installs must disable npm install scripts"

echo "ci-rubric: PASS"
