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

require_contains "${ci}" "  release-train-promotion:" "CI must define the release train promotion gate"
require_contains "${ci}" "ref: refs/heads/staging" "release train gate must checkout trusted staging verifier code"
require_contains "${ci}" "scripts/verify-release-train-promotion.sh" "release train gate must use the verifier script"
require_contains "${ci}" "  rubric:" "CI must define the full rubric job"
require_contains "${ci}" "run: bash gov-infra/verifiers/gov-verify-rubric.sh" "CI rubric job must run the gov-infra verifier"
require_contains "${ci}" "run: bash scripts/verify-node-engines-floor.sh" "CI must run the node engines floor gate at PR time"
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
require_contains "${ci}" "run: bash scripts/verify-lambda-runtime-deprecations.sh" "CI must gate deprecated Lambda runtimes at PR time"
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
if ! python3 - "${ci}" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()

job_starts = []
for index, line in enumerate(lines):
    match = re.match(r"^  ([A-Za-z0-9_-]+):\s*$", line)
    if match:
        job_starts.append((index, match.group(1)))

jobs = {}
for position, (index, name) in enumerate(job_starts):
    end = job_starts[position + 1][0] if position + 1 < len(job_starts) else len(lines)
    jobs[name] = lines[index:end]


def steps_of(job_lines):
    starts = [index for index, line in enumerate(job_lines) if re.match(r"^      - ", line)]
    steps = []
    for position, start in enumerate(starts):
        end = starts[position + 1] if position + 1 < len(starts) else len(job_lines)
        steps.append("\n".join(job_lines[start:end]))
    return steps


# Row 22: bind the trusted release-train gate to the exact job it validates. The
# job must still exist, must run on pull_request via the exact canonical
# predicate (a `&& false` conjunct or any other drift must fail here, not only in
# the parity checker), and must carry its trusted checkout and verifier
# invocation inside that job rather than anywhere in the file.
release_job = jobs.get("release-train-promotion")
if release_job is None:
    raise SystemExit("ci-rubric: FAIL (missing release-train-promotion job)")

release_if = [line for line in release_job if re.match(r"^    if:", line)]
if len(release_if) != 1:
    raise SystemExit("ci-rubric: FAIL (release-train-promotion must declare exactly one job-level if:)")
release_condition = release_if[0].split("if:", 1)[1].strip()
if release_condition.startswith("${{") and release_condition.endswith("}}"):
    release_condition = release_condition[3:-2].strip()
if release_condition != "github.event_name == 'pull_request'":
    raise SystemExit(
        "ci-rubric: FAIL (release-train-promotion if: must be exactly "
        "github.event_name == 'pull_request'; got " + repr(release_condition) + ")"
    )

release_steps = steps_of(release_job)
if not any("ref: refs/heads/staging" in step for step in release_steps):
    raise SystemExit("ci-rubric: FAIL (release-train-promotion must checkout trusted staging code)")
if not any("scripts/verify-release-train-promotion.sh" in step for step in release_steps):
    raise SystemExit("ci-rubric: FAIL (release-train-promotion must run the verifier script)")

# Row 38: the governance-evidence upload must be a real step in the rubric job
# whose own `uses:` carries the pinned upload-artifact action and whose `with:`
# carries the evidence path and artifact name. Those keys are read at their
# property positions rather than as substrings, so the identical pin in the
# unrelated TypeScript coverage step -- or a `run:` block echoing the strings --
# can no longer stand in for the upload.
rubric_job = jobs.get("rubric")
if rubric_job is None:
    raise SystemExit("ci-rubric: FAIL (missing rubric job)")

PINNED_UPLOAD = "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"
PINNED_USES_RE = re.compile(r"^" + re.escape(PINNED_UPLOAD) + r"(\s+#.*)?$")


def split_step_entries(step_text):
    """Return (indent, key, value) for each mapping entry in a step block.

    The list marker is normalised to spaces so the step's own keys share one
    indent and nested keys (`with:` children) sit deeper. Block-scalar (`|`/`>`)
    bodies and comment lines are skipped so their literal text is never read as
    structure.
    """
    entries = []
    block_indent = None
    for raw in step_text.splitlines():
        indent = len(raw) - len(raw.lstrip(" "))
        if block_indent is not None:
            if raw.strip() == "" or indent > block_indent:
                continue
            block_indent = None
        if raw.strip() == "" or raw.lstrip().startswith("#"):
            continue
        without_marker = re.sub(r"^(\s*)- ", r"\1  ", raw, count=1)
        content = without_marker.strip()
        match = re.match(r"([A-Za-z0-9_.-]+):\s*(.*)$", content)
        if match is None:
            continue
        key, value = match.group(1), match.group(2).strip()
        entry_indent = len(without_marker) - len(without_marker.lstrip(" "))
        entries.append((entry_indent, key, value))
        if re.match(r"^[|>][+-]?\s*$", value):
            block_indent = entry_indent
    return entries


def step_property(step_text, key):
    entries = split_step_entries(step_text)
    if not entries:
        return None
    base = min(indent for indent, _, _ in entries)
    for indent, entry_key, value in entries:
        if indent == base and entry_key == key:
            return value
    return None


def step_with_children(step_text):
    entries = split_step_entries(step_text)
    if not entries:
        return {}
    base = min(indent for indent, _, _ in entries)
    children = {}
    in_with = False
    for indent, key, value in entries:
        if indent == base:
            in_with = key == "with"
            continue
        if in_with and indent > base:
            children[key] = value
    return children


governance_steps = [
    step
    for step in steps_of(rubric_job)
    if step_property(step, "name") == "Upload governance evidence"
]
if len(governance_steps) != 1:
    raise SystemExit("ci-rubric: FAIL (rubric job must have exactly one governance evidence upload step)")

governance_uses = step_property(governance_steps[0], "uses")
governance_with = step_with_children(governance_steps[0])
missing = []
if governance_uses is None or not PINNED_USES_RE.match(governance_uses):
    missing.append("uses: " + PINNED_UPLOAD)
if governance_with.get("path") != "gov-infra/evidence/":
    missing.append("path: gov-infra/evidence/")
if governance_with.get("name") != "gov-infra-evidence":
    missing.append("name: gov-infra-evidence")
if missing:
    raise SystemExit(
        "ci-rubric: FAIL (governance evidence upload step is missing " + ", ".join(missing) + ")"
    )
PY
then
  fail "CI release-train gate and governance evidence upload must stay bound to their canonical jobs"
fi
require_contains "${ci}" "run_full_rubric:" "manual CI dispatch must expose an explicit full-rubric toggle"
require_contains "${ci}" "default: true" "manual CI dispatch must continue to run the full rubric by default"
# Operator ruling 2026-09-28: the rubric is only needed in staging; premain and
# main only ever come from staging, so the full rubric must not run on a
# protected-branch push or on a promotion pull request.
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

# R-F1 promotion-path parity: the PR -> staging readiness job must exist and must
# check the pull request's own commits.
require_contains "${ci}" "  staging-readiness:" "CI must define the PR -> staging release readiness job"
require_contains \
  "${ci}" \
  "name: Release readiness (PR -> staging)" \
  "PR -> staging readiness job name must stay stable for branch protection visibility"
require_contains \
  "${ci}" \
  "scripts/verify-release-readiness.sh origin/staging HEAD staging" \
  "PR -> staging readiness must check the pull request's own commits"

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

require_contains \
  "${ci}" \
  "run: cd ts && npm ci --ignore-scripts" \
  "CI installs must disable npm install scripts"
require_contains \
  ".github/workflows/prerelease.yml" \
  "cd ts && npm ci --ignore-scripts" \
  "prerelease installs must disable npm install scripts"
require_contains \
  ".github/workflows/release.yml" \
  "cd ts && npm ci --ignore-scripts" \
  "release installs must disable npm install scripts"

echo "ci-rubric: PASS"
