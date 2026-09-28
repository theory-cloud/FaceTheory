#!/usr/bin/env bash
# Purpose: fail closed when the CI job/trigger wiring lets a job run on a path
# that can promote code (push to a protected release branch, or a
# staging -> premain / premain -> main promotion pull request) without an
# equivalent job running on pull requests targeting staging -- the class of gap
# that lets a pull request merge green and then fail promotion.
#
# Requirements enforced (R-F1):
#   A. every job in ci.yml that can run on push must also run on pull_request;
#   B. the rubric job runs on push and on pull_request for every promotion base;
#   C. the deterministic-build job does the same;
#   D. the staging -> premain readiness gate still exists and stays premain-scoped;
#   E. the PR -> main readiness gate still exists and stays main-scoped;
#   F. a PR -> staging readiness counterpart exists and runs the readiness verifier;
#   G. any job that can run on a promotion pull request must either also run on
#      pull requests to staging or appear in the exemption table with a reason;
#   H. every cross-workflow exemption still holds its stated mechanical reason.
#
# A job whose `if:` uses a predicate this checker does not model is a failure,
# never a pass: unknown wiring must be made explicit here before it can ship.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v python3 >/dev/null 2>&1; then
  echo "ci-trigger-parity: BLOCKED (python3 not found)" >&2
  exit 2
fi

python3 <<'PY'
import re
import sys
from pathlib import Path

CI_PATH = ".github/workflows/ci.yml"
RUBRIC_JOB = "rubric"
DETERMINISTIC_JOB = "deterministic-builds"
PR_STAGING_READINESS = "Release readiness (PR -> staging)"
PROMOTION_BASES = {"premain", "main"}
STAGING = "staging"

# Jobs that may run on a promotion pull request without also running on pull
# requests to staging. Each entry must state why, and the reason must hold
# mechanically: the named counterpart job is what makes the promotion gate
# predictable from a staging pull request.
PROMOTION_EXEMPT = {
    "Prerelease readiness (staging -> premain)": (
        "promotion-edge readiness; its PR-time counterpart is "
        f"{PR_STAGING_READINESS!r}"
    ),
    "Release readiness (PR -> main)": (
        "promotion-edge readiness; its PR-time counterpart is "
        f"{PR_STAGING_READINESS!r}"
    ),
}

failures = []


def fail(message):
    failures.append(message)


def parse_ci():
    ci = Path(CI_PATH)
    if not ci.is_file():
        fail(f"missing {CI_PATH}")
        return None, {}
    lines = ci.read_text(encoding="utf-8").splitlines()

    trigger_names = []
    push_branches = []
    section = None
    for line in lines:
        if re.match(r"^on:\s*$", line):
            section = "on"
            continue
        if re.match(r"^[A-Za-z0-9_.-]+:\s*$", line) and not line.startswith((" ", "\t")):
            section = "jobs" if line.startswith("jobs:") else None
            continue
        if section == "on":
            match = re.match(r"^  ([A-Za-z0-9_-]+):", line)
            if match:
                trigger_names.append(match.group(1))
            branch = re.match(r'^      -\s*"?([A-Za-z0-9_.-]+)"?\s*$', line)
            if branch:
                push_branches.append(branch.group(1))

    jobs = {}
    job_name = None
    buffer = []

    def flush():
        if job_name is not None:
            jobs[job_name] = "\n".join(buffer)

    for line in lines:
        match = re.match(r"^  ([A-Za-z0-9_-]+):\s*$", line)
        if match:
            flush()
            job_name = match.group(1)
            buffer = []
            continue
        if job_name is not None:
            buffer.append(line)
    flush()

    if "pull_request" not in trigger_names:
        fail(f"{CI_PATH}: must trigger on pull_request")
    if "push" not in trigger_names:
        fail(f"{CI_PATH}: must trigger on push")
    for branch in (STAGING, "premain", "main"):
        if branch not in push_branches:
            fail(f"{CI_PATH}: push trigger must include {branch!r}")

    return lines, jobs


def classify(job_id, body):
    """Return (events, pr_bases) for a job, or None when the wiring is unmodelled."""
    lines = [line for line in body.splitlines() if line.strip()]
    if_lines = [line for line in lines if re.match(r"^    if:", line)]
    if len(if_lines) > 1:
        fail(f"{CI_PATH}: job {job_id!r} declares more than one job-level if:")
        return None
    if not if_lines:
        return {"push", "pull_request", "workflow_dispatch"}, {"staging", "premain", "main"}

    text = if_lines[0].split("if:", 1)[1]
    if re.search(r"github\.event_name\s*!=", text):
        fail(
            f"{CI_PATH}: job {job_id!r} uses a negated event predicate this checker does "
            "not model; make the handled events explicit before shipping"
        )
        return None

    events = set()
    for event in ("push", "pull_request", "workflow_dispatch"):
        if f"github.event_name == '{event}'" in text:
            events.add(event)
    if not events and "always()" in text:
        # Aggregator jobs gated only on needs-results run on every event that
        # triggers the workflow, so they carry no event restriction of their own.
        events = {"push", "pull_request", "workflow_dispatch"}
    if not events:
        fail(f"{CI_PATH}: job {job_id!r} if: names no handled event: {text.strip()}")
        return None

    pr_bases = set()
    if "pull_request" in events:
        base_match = re.search(r"github\.event\.pull_request\.base\.ref == '([a-z]+)'", text)
        pr_bases = {base_match.group(1)} if base_match else {"staging", "premain", "main"}
    return events, pr_bases


parsed = parse_ci()
if parsed is not None:
    _, jobs = parsed
    wiring = {}
    for job_id, body in jobs.items():
        result = classify(job_id, body)
        if result is not None:
            wiring[job_id] = result

    for job_id, (events, pr_bases) in wiring.items():
        if "push" in events and "pull_request" not in events:
            fail(
                f"{CI_PATH}: job {job_id!r} runs on push but never on pull_request "
                "(R-F1 push parity)"
            )

    for required_job in (RUBRIC_JOB, DETERMINISTIC_JOB):
        if required_job not in wiring:
            fail(f"{CI_PATH}: missing job {required_job!r}")
            continue
        events, pr_bases = wiring[required_job]
        missing_events = {"push", "pull_request"} - events
        if missing_events:
            fail(
                f"{CI_PATH}: job {required_job!r} must run on {sorted(missing_events)} "
                "so every protected-branch push and promotion path is gated"
            )
        missing_bases = {"staging", "premain", "main"} - pr_bases
        if missing_bases:
            fail(
                f"{CI_PATH}: job {required_job!r} must run for PRs to {sorted(missing_bases)}"
            )

    names = {}
    for job_id, body in jobs.items():
        match = re.search(r"^    name:\s*(.+?)\s*$", body, re.MULTILINE)
        names[job_id] = match.group(1).strip().strip('"\'') if match else job_id

    by_name = {name: job_id for job_id, name in names.items()}

    if PR_STAGING_READINESS not in by_name:
        fail(f"{CI_PATH}: missing the {PR_STAGING_READINESS!r} job (R-F1 PR parity)")
    else:
        job_id = by_name[PR_STAGING_READINESS]
        events, pr_bases = wiring.get(job_id, (set(), set()))
        if "pull_request" not in events or pr_bases != {STAGING}:
            fail(
                f"{CI_PATH}: {PR_STAGING_READINESS!r} must be scoped to pull_request "
                f"events targeting {STAGING!r}, got events={sorted(events)} bases={sorted(pr_bases)}"
            )
        if "scripts/verify-release-readiness.sh" not in jobs[job_id]:
            fail(
                f"{CI_PATH}: {PR_STAGING_READINESS!r} must run "
                "scripts/verify-release-readiness.sh"
            )

    for required_name, expected_base in (
        ("Prerelease readiness (staging -> premain)", "premain"),
        ("Release readiness (PR -> main)", "main"),
    ):
        if required_name not in by_name:
            fail(f"{CI_PATH}: missing the {required_name!r} promotion gate")
            continue
        events, pr_bases = wiring.get(by_name[required_name], (set(), set()))
        if events != {"pull_request"} or pr_bases != {expected_base}:
            fail(
                f"{CI_PATH}: {required_name!r} must stay scoped to pull_request events "
                f"targeting {expected_base!r}, got events={sorted(events)} bases={sorted(pr_bases)}"
            )

    for job_id, (events, pr_bases) in wiring.items():
        name = names[job_id]
        if not (pr_bases & PROMOTION_BASES):
            continue
        if pr_bases == {STAGING}:
            continue
        if name in PROMOTION_EXEMPT:
            if PR_STAGING_READINESS not in by_name:
                fail(
                    f"{CI_PATH}: {name!r} is exempt from PR parity but its counterpart "
                    f"{PR_STAGING_READINESS!r} is missing"
                )
            continue
        if pr_bases != {"staging", "premain", "main"}:
            fail(
                f"{CI_PATH}: job {job_id!r} runs on promotion PRs ({sorted(pr_bases)}) but "
                "not on PRs to staging; add a staging equivalent or an exemption with a reason"
            )

# Cross-workflow exemptions: surfaces outside ci.yml that carry post-merge or
# deploy jobs. Each reason is re-checked mechanically here.
cross_checks = [
    (
        ".github/workflows/pages.yml",
        lambda text: "pull_request" not in text,
        "docs deploy publisher; it gates nothing on a promotion path and never runs on PRs",
    ),
    (
        ".github/workflows/theorycloud-facetheory-subtree-publish.yml",
        lambda text: "pull_request" not in text,
        "deploy publisher; its dry-run equivalents run at PR time in ci.yml",
    ),
    (
        ".github/workflows/release-branch-bootstrap.yml",
        lambda text: "pull_request" not in text,
        "branch bootstrap; gates nothing and its script test runs in the rubric",
    ),
]

for path, predicate, reason in cross_checks:
    target = Path(path)
    if not target.is_file():
        fail(f"missing {path}")
        continue
    if not predicate(target.read_text(encoding="utf-8")):
        fail(f"{path}: cross-workflow exemption no longer holds ({reason})")

subtree_job = "TheoryCloud subtree publishing path"
if Path(CI_PATH).is_file():
    if subtree_job not in Path(CI_PATH).read_text(encoding="utf-8"):
        fail(
            f"{CI_PATH}: missing the {subtree_job!r} dry-run job that is the PR-time "
            "counterpart of the deploy-only TheoryCloud publisher"
        )

if failures:
    print("ci-trigger-parity: FAIL")
    for failure in failures:
        print(f"- {failure}")
    sys.exit(1)

print("ci-trigger-parity: PASS")
PY
