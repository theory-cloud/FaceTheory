#!/usr/bin/env bash
# Purpose: fail closed when the committed CI shape stops matching the
# verified-once standard (TMS served MAI-4 / REL-1).
#
# What is enforced, in the served definitions' terms:
#   MAI-4  the repository has an evidence registry and a verify entry point; CI
#          verifies the record on pull requests to the integration branch; no
#          workflow executes a gate; no workflow has a gate-class push trigger;
#          no gate runs on a release-branch pull request.
#   REL-1  release-branch pull requests carry the head-branch check, which needs
#          only the pull request context: no checkout, no credential, and a
#          head-repository equality condition so a fork branch cannot pass by
#          name. Its accepted heads name the integration branch and the release
#          automation branches this repository actually generates. It also runs
#          on the eligible `pull_request_review` event, because a dispatched
#          check run never satisfies a required status check; the per-base
#          eligible path is proved by scripts/verify-release-pr-check-lane.sh.
#
# A shape this checker does not model fails closed rather than passing by
# omission: an unlisted push-triggered workflow, an unknown verify entry point,
# a workflow that runs a gate command, or a `run:` body that interpolates
# `${{ }}` is a failure.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v python3 >/dev/null 2>&1; then
  echo "ci-trigger-parity: BLOCKED (python3 not found)" >&2
  exit 2
fi

python3 <<'PY'
import json
import re
import sys
from pathlib import Path

CI_PATH = ".github/workflows/ci.yml"
HYGIENE_PATH = ".github/workflows/promotion-hygiene.yml"
REGISTRY_PATH = "scripts/evidence/validation-gates.json"
VERIFY_ALL = "scripts/evidence/verify-all.sh"
VERIFY_GATE = "scripts/evidence/verify-gate.sh"
STAGING = "staging"
RELEASE_BRANCH = "premain"
MAIN_BRANCH = "main"
RELEASE_PLEASE_PREMAIN = "release-please--branches--premain"
RELEASE_PLEASE_MAIN = "release-please--branches--main"

# Workflows allowed to keep a push trigger: publish, release-please and release
# mechanics. None of them may run a gate, which the gate-command scan enforces
# for every workflow below.
PUSH_ALLOWED = {
    ".github/workflows/pages.yml",
    ".github/workflows/prerelease-pr.yml",
    ".github/workflows/prerelease.yml",
    ".github/workflows/release-pr.yml",
    ".github/workflows/release.yml",
    ".github/workflows/release-branch-bootstrap.yml",
    ".github/workflows/theorycloud-facetheory-subtree-publish.yml",
}

# The command set that belongs to the evidence record. A workflow that runs one
# of these is executing a gate in CI.
GATE_COMMANDS = (
    "make rubric",
    "gov-verify-rubric.sh",
    "scripts/evidence/collect.sh",
    "scripts/evidence/collect-all.sh",
    "scripts/evidence/collect-in-container.sh",
    "scripts/verify-ts-suite.sh",
    "scripts/verify-ts-pack.sh",
    "scripts/verify-deterministic-builds.sh",
    "scripts/verify-examples-local.sh",
    "scripts/verify-theorycloud-subtree-path.sh",
    "scripts/verify-node-engines-floor.sh",
    "scripts/verify-lambda-runtime-deprecations.sh",
    "scripts/local/run-examples-local.mjs",
    "make ts-typecheck",
    "make ts-lint",
    "make ts-test",
    "make ts-coverage",
    "make examples-local",
    "make infra-snapshot-test",
)

# Release mechanics keep their own build steps (`npm ci`, asset assembly). Those
# are not gates: a gate is a proof of the candidate, not the construction of the
# artifact that ships from it.

failures = []


def fail(message):
    failures.append(message)


def parse_workflow(path):
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    events = []
    push_branches = []
    event_branches = {}
    section = None
    current_event = None
    jobs = {}
    job_name = None
    buffer = []
    in_jobs = False

    def flush_job():
        nonlocal job_name, buffer
        if job_name is not None:
            jobs[job_name] = "\n".join(buffer)
        job_name = None
        buffer = []

    for line in lines:
        if re.match(r"^on:\s*$", line):
            section = "on"
            current_event = None
            flush_job() if in_jobs else None
            in_jobs = False
            continue
        if re.match(r"^jobs:\s*$", line):
            section = "jobs"
            in_jobs = True
            continue
        if re.match(r"^[A-Za-z0-9_.-]+:\s*", line) and not line.startswith((" ", "\t")):
            if section == "jobs":
                flush_job()
            section = None
            in_jobs = False
            continue
        if section == "on":
            match = re.match(r"^  ([A-Za-z0-9_-]+):", line)
            if match:
                current_event = match.group(1)
                events.append(current_event)
                continue
            inline = re.match(r'^    branches:\s*\[(.*)\]\s*$', line)
            if inline and current_event:
                for item in inline.group(1).split(","):
                    value = item.strip().strip("'\"")
                    if value:
                        event_branches.setdefault(current_event, []).append(value)
                continue
            branch = re.match(r'^\s+-\s*"?([A-Za-z0-9_.*-]+)"?\s*$', line)
            if branch and current_event:
                event_branches.setdefault(current_event, []).append(branch.group(1))
                if current_event == "push":
                    push_branches.append(branch.group(1))
            continue
        if in_jobs:
            match = re.match(r"^  ([A-Za-z0-9_-]+):\s*$", line)
            if match:
                flush_job()
                job_name = match.group(1)
                buffer = []
                continue
            if job_name is not None:
                buffer.append(line)
    if in_jobs:
        flush_job()

    return {
        "path": path,
        "text": text,
        "events": events,
        "push_branches": push_branches,
        "event_branches": event_branches,
        "jobs": jobs,
    }


def job_field(body, field):
    match = re.search(r"^    " + field + r":\s*(.+?)\s*$", body, re.MULTILINE)
    if match is None:
        return None
    value = match.group(1).strip()
    if value.startswith("${{") and value.endswith("}}"):
        value = value[3:-2].strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        value = value[1:-1]
    return value


def run_bodies(body):
    """Every `run:` scalar in a job body, including block scalars."""
    bodies = []
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        match = re.match(r"^\s*(-\s+)?run:\s*(.*)$", line)
        if match is None:
            index += 1
            continue
        inline = match.group(2).strip()
        indent = len(line) - len(line.lstrip(" "))
        collected = []
        if inline in ("|", ">", "|-", ">-", "|+", ">+"):
            index += 1
            while index < len(lines):
                candidate = lines[index]
                if candidate.strip() == "":
                    collected.append("")
                    index += 1
                    continue
                candidate_indent = len(candidate) - len(candidate.lstrip(" "))
                if candidate_indent <= indent:
                    break
                collected.append(candidate)
                index += 1
        else:
            collected.append(inline)
            index += 1
        bodies.append("\n".join(collected))
    return bodies


def check_no_interpolation_in_run(workflow, job_id, body):
    for run in run_bodies(body):
        if "${{" in run:
            fail(
                f"{workflow['path']}: job {job_id!r} interpolates a workflow expression "
                "inside a run body; pass it through env: instead"
            )


def check_no_gate_execution(workflow):
    for job_id, body in workflow["jobs"].items():
        for run in run_bodies(body):
            for command in GATE_COMMANDS:
                if command in run:
                    fail(
                        f"{workflow['path']}: job {job_id!r} executes a gate command "
                        f"({command!r}); gates are produced locally and CI verifies the record"
                    )


def load_workflow(path_text):
    path = Path(path_text)
    if not path.is_file():
        return None
    return parse_workflow(path)


# --- registry and verify entry point (MAI-4 step 1) -------------------------
registry_path = Path(REGISTRY_PATH)
if not registry_path.is_file():
    fail(f"missing evidence registry at {REGISTRY_PATH}; the rubric gate's input scope and profiles are declared there")
    registry = None
else:
    try:
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"{REGISTRY_PATH} is not valid JSON ({error})")
        registry = None

for entry_point in (VERIFY_ALL, VERIFY_GATE):
    if not Path(entry_point).is_file():
        fail(f"missing evidence verify entry point at {entry_point}")

if registry is not None:
    rubric = (registry.get("gates") or {}).get("rubric")
    if rubric is None:
        fail(f"{REGISTRY_PATH}: the catch-all 'rubric' gate is missing")
    else:
        if "**" not in (rubric.get("paths") or []):
            fail(
                f"{REGISTRY_PATH}: the 'rubric' gate must keep a '**' input scope, so a tooling, "
                "workflow or guard edit stales it"
            )
        if not (rubric.get("profiles") or []):
            fail(f"{REGISTRY_PATH}: the 'rubric' gate must declare at least one proof profile")
    profiles = registry.get("proofProfiles") or {}
    for gate_id, gate in (registry.get("gates") or {}).items():
        for profile in gate.get("profiles") or []:
            declaration = profiles.get(profile)
            if declaration is None:
                fail(f"{REGISTRY_PATH}: gate {gate_id!r} names undeclared proof profile {profile!r}")
                continue
            image = str(declaration.get("image") or "")
            environment = declaration.get("environment") or {}
            platform = (environment.get("platform") or {}).get("os")
            if platform == "linux":
                if "@sha256:" not in image:
                    fail(
                        f"{REGISTRY_PATH}: Linux proof profile {profile!r} must pin its container image "
                        "by digest"
                    )
                if not declaration.get("containerPlatform"):
                    fail(f"{REGISTRY_PATH}: Linux proof profile {profile!r} must declare containerPlatform")

# --- workflows -------------------------------------------------------------
workflow_paths = sorted(str(path) for path in Path(".github/workflows").glob("*.y*ml"))
workflows = {}
for path_text in workflow_paths:
    workflow = load_workflow(path_text)
    if workflow is None:
        continue
    workflows[path_text] = workflow
    check_no_gate_execution(workflow)
    if path_text == HYGIENE_PATH:
        for job_id, body in workflow["jobs"].items():
            check_no_interpolation_in_run(workflow, job_id, body)
    if "push" in workflow["events"] and path_text not in PUSH_ALLOWED:
        fail(
            f"{path_text}: has a push trigger but is not an allowed publish/release workflow; "
            "a merge publishes, it does not re-run a gate"
        )

ci = workflows.get(CI_PATH)
if ci is None:
    fail(f"missing {CI_PATH}")
else:
    if "push" in ci["events"]:
        fail(f"{CI_PATH}: must not trigger on push; the merged tree is the tree the pull request verified")
    if "pull_request" not in ci["events"]:
        fail(f"{CI_PATH}: must trigger on pull_request")
    if "workflow_dispatch" in ci["events"]:
        fail(
            f"{CI_PATH}: a manual dispatch would offer an execution path with no record; "
            "remove it or model why it cannot run a gate"
        )

    rubric_body = ci["jobs"].get("rubric")
    if rubric_body is None:
        fail(f"{CI_PATH}: missing the 'rubric' verify job")
    else:
        condition = (job_field(rubric_body, "if") or "")
        if f"github.event.pull_request.base.ref == '{STAGING}'" not in condition:
            fail(
                f"{CI_PATH}: the 'rubric' job must be scoped to pull requests targeting {STAGING!r}; "
                f"got if: {condition!r}"
            )
        for release_base in (RELEASE_BRANCH, MAIN_BRANCH):
            if f"'{release_base}'" in condition:
                fail(f"{CI_PATH}: the 'rubric' job must not run on {release_base!r} pull requests")
        runs = "\n".join(run_bodies(rubric_body))
        if VERIFY_ALL not in runs and VERIFY_GATE not in runs:
            fail(
                f"{CI_PATH}: the 'rubric' job must run {VERIFY_ALL} (or {VERIFY_GATE}); "
                "it verifies the record and executes nothing"
            )
        for provisioning in ("actions/setup-node", "actions/setup-go", "npm ci", "actions/upload-artifact"):
            if provisioning in rubric_body:
                fail(
                    f"{CI_PATH}: the 'rubric' job must provision no toolchain and upload no artifact "
                    f"(found {provisioning!r}); it only verifies records"
                )

    alignment = ci["jobs"].get("version-alignment")
    if alignment is None:
        fail(f"{CI_PATH}: missing the fast 'Version alignment' job")
    else:
        if "scripts/verify-version-alignment.sh" not in alignment:
            fail(f"{CI_PATH}: 'Version alignment' must run scripts/verify-version-alignment.sh")
        condition = job_field(alignment, "if")
        if condition:
            fail(
                f"{CI_PATH}: 'Version alignment' must report on every pull request; it currently carries "
                f"if: {condition!r}"
            )

    train = ci["jobs"].get("release-train-promotion")
    if train is None:
        fail(f"{CI_PATH}: missing the trusted 'Release train promotion gate' job")
    elif "scripts/verify-release-train-promotion.sh" not in train:
        fail(f"{CI_PATH}: the release-train promotion gate must run scripts/verify-release-train-promotion.sh")

    for required_job, expected in (
        ("prerelease-readiness", f"github.event.pull_request.base.ref == '{RELEASE_BRANCH}'"),
        ("release-readiness", f"github.event.pull_request.base.ref == '{MAIN_BRANCH}'"),
        ("staging-readiness", f"github.event.pull_request.base.ref == '{STAGING}'"),
    ):
        body = ci["jobs"].get(required_job)
        if body is None:
            fail(f"{CI_PATH}: missing the release-hygiene job {required_job!r}")
            continue
        condition = job_field(body, "if") or ""
        if expected not in condition:
            fail(
                f"{CI_PATH}: release-hygiene job {required_job!r} must keep its branch scope; "
                f"got if: {condition!r}"
            )

# --- REL-1: promotion hygiene ---------------------------------------------
hygiene = workflows.get(HYGIENE_PATH)
if hygiene is None:
    fail(f"missing the head-branch check at {HYGIENE_PATH}")
else:
    if sorted(hygiene["events"]) != ["pull_request", "pull_request_review", "workflow_dispatch"]:
        fail(
            f"{HYGIENE_PATH}: must trigger on pull_request, pull_request_review and workflow_dispatch; "
            f"got {hygiene['events']}. The dispatch path is the lane's early verdict; the code-owner "
            "review is the eligible event that makes the context a required check"
        )
    branches = hygiene["event_branches"].get("pull_request") or []
    if not branches:
        fail(f"{HYGIENE_PATH}: must restrict its pull_request trigger to {RELEASE_BRANCH}/{MAIN_BRANCH}")
    for branch in (RELEASE_BRANCH, MAIN_BRANCH):
        if branch not in branches:
            fail(f"{HYGIENE_PATH}: must report on pull requests into {branch!r}; got {branches}")
    if not re.search(r"^permissions:\n(?:  [a-z-]+: [a-z]+\n)+", hygiene["text"], re.MULTILINE):
        fail(f"{HYGIENE_PATH}: must declare its read-only permissions explicitly")
    for permission in re.findall(r"^  ([a-z-]+): ([a-z]+)$", hygiene["text"], re.MULTILINE):
        name, level = permission
        if level != "read":
            fail(
                f"{HYGIENE_PATH}: permission {name!r} is {level!r}; the head check needs read-only "
                "built-in access and must never hold a write credential"
            )
    if not re.search(r"^  pull-requests: read$", hygiene["text"], re.MULTILINE):
        fail(
            f"{HYGIENE_PATH}: must declare `pull-requests: read`; the dispatch path reads the generated "
            "pull request by number to bind the run to its head"
        )
    if "release_pr_number:" not in hygiene["text"]:
        fail(f"{HYGIENE_PATH}: the dispatch path must take the generated release pull request number")
    if "actions/checkout" in hygiene["text"]:
        fail(f"{HYGIENE_PATH}: must not check out the pull request; it needs only the pull request context")
    if "github.event.pull_request.head.repo.full_name" not in hygiene["text"]:
        fail(
            f"{HYGIENE_PATH}: must compare github.event.pull_request.head.repo.full_name with github.repository, "
            "so a fork branch named like an accepted head cannot pass by name"
        )
    if "PR_HEAD_REPOSITORY:" not in hygiene["text"] or "BASE_REPOSITORY:" not in hygiene["text"]:
        fail(f"{HYGIENE_PATH}: must pass the head and base repositories through env: to the run body")
    for head in (STAGING, RELEASE_PLEASE_PREMAIN, RELEASE_PLEASE_MAIN):
        if head not in hygiene["text"]:
            fail(
                f"{HYGIENE_PATH}: does not name the accepted head {head!r}. Accept exactly "
                f"{STAGING!r} into {RELEASE_BRANCH}, {RELEASE_BRANCH!r} into {MAIN_BRANCH}, plus the "
                "release-please branch each of them generates"
            )
    # A dispatched run must prove the pull request it names is the branch and
    # commit it is running on, or it would certify a different tree than the one
    # the ruleset gates.
    for marker in ("RELEASE_PR_NUMBER", "DISPATCHED_REF_NAME", "DISPATCHED_SHA", 'head.get("sha")'):
        if marker not in hygiene["text"]:
            fail(
                f"{HYGIENE_PATH}: the dispatch path must bind the run to the pull request head "
                f"(missing {marker})"
            )

    def hygiene_steps(text):
        steps = []
        current = None
        for line in text.splitlines():
            if re.match(r"^      - ", line):
                if current is not None:
                    steps.append(current)
                current = [line]
                continue
            if current is not None and (
                re.match(r"^  [A-Za-z0-9_-]+:\s*$", line) or re.match(r"^[A-Za-z0-9_.-]+:\s*", line)
            ):
                steps.append(current)
                current = None
                continue
            if current is not None:
                current.append(line)
        if current is not None:
            steps.append(current)
        return ["\n".join(step) for step in steps]

    dispatch_gate = "if: github.event_name == 'workflow_dispatch'"
    gh_steps = 0
    for step in hygiene_steps(hygiene["text"]):
        for run in run_bodies(step):
            if "git " in run:
                fail(
                    f"{HYGIENE_PATH}: a step runs a git command; the head check needs only the "
                    "pull request context"
                )
            if "gh " in run:
                gh_steps += 1
                if dispatch_gate not in step:
                    fail(
                        f"{HYGIENE_PATH}: a step outside the workflow_dispatch binding runs gh; the "
                        "pull_request path must stay context-only"
                    )
    if gh_steps != 1:
        fail(
            f"{HYGIENE_PATH}: exactly one step (the dispatch binding) may call gh, found {gh_steps}"
        )

if failures:
    print("ci-trigger-parity: FAIL")
    for failure in failures:
        print(f"- {failure}")
    sys.exit(1)

print("ci-trigger-parity: PASS (verify-only CI, no gate-class push trigger, release heads gated)")
PY
