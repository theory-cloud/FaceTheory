#!/usr/bin/env bash
# Purpose: fail closed when the CI job/trigger wiring lets a job run on a path
# that can promote code (push to a protected release branch, or a
# staging -> premain / premain -> main promotion pull request) without an
# equivalent job running on pull requests targeting staging -- the class of gap
# that lets a pull request merge green and then fail promotion.
#
# Requirements enforced (R-F1, as amended by the operator ruling 2026-09-28 --
# "rubric is only needed in staging; premain and main only ever come from staging
# and do not need to repeat the full rubric"):
#   A. the rubric job runs only for pull requests targeting staging, plus the
#      opt-in manual dispatch -- never on a protected-branch push and never on a
#      promotion pull request;
#   B. the deterministic-build job has the same staging-PR-only shape;
#   C. every other job in ci.yml that can run on push must also run on
#      pull_request (the #623 push-parity class);
#   D. the staging -> premain readiness gate still exists and stays premain-scoped;
#   E. the PR -> main readiness gate still exists and stays main-scoped;
#   F. a PR -> staging readiness counterpart exists and runs the readiness verifier;
#   G. any non-exempt job that can run on a promotion pull request must also run
#      on pull requests to staging, or appear in the exemption table with a reason;
#   H. every cross-workflow exemption still holds its stated mechanical reason.
#
# A job whose `if:` uses a predicate this checker does not model -- an unknown or
# absent event predicate, a negated event predicate, or a negated / unmodelled PR
# base-ref predicate -- is a failure, never a pass: unknown wiring must be made
# explicit here before it can ship. The `on:` block is modelled structurally too:
# a pull_request branch filter fails closed, because it can silently remove the
# rubric from the staging pull request that is the only place it runs.
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
# The rubric and deterministic-build jobs are staging-PR-only under the ruling.
STAGING_PR_ONLY_EVENTS = {"pull_request", "workflow_dispatch"}

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
    pr_branch_filters = []
    section = None
    trigger = None
    for line in lines:
        if re.match(r"^on:\s*$", line):
            section = "on"
            trigger = None
            continue
        if re.match(r"^[A-Za-z0-9_.-]+:\s*$", line) and not line.startswith((" ", "\t")):
            section = "jobs" if line.startswith("jobs:") else None
            trigger = None
            continue
        if section != "on":
            continue
        match = re.match(r"^  ([A-Za-z0-9_-]+):", line)
        if match:
            trigger = match.group(1)
            trigger_names.append(trigger)
            continue
        if trigger is None or trigger == "push":
            # The push branch list is validated directly below through
            # push_branches; only non-push triggers can carry a filter that hides
            # a job from the staging pull request.
            branch = re.match(r'^      -\s*"?([A-Za-z0-9_.-]+)"?\s*$', line)
            if branch and trigger == "push":
                push_branches.append(branch.group(1))
            continue
        key = re.match(r"^    (branches|branches-ignore):\s*([^\s].*)?$", line)
        if key and key.group(2):
            pr_branch_filters.append((trigger, key.group(1), key.group(2).strip()))
            continue
        if key:
            pr_branch_filters.append((trigger, key.group(1), None))
            continue
        branch = re.match(r'^      -\s*"?([A-Za-z0-9_.-]+)"?\s*$', line)
        if branch:
            pr_branch_filters.append((trigger, "branches", branch.group(1)))

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
    for trigger_name, key, value in pr_branch_filters:
        detail = f" ({key}: {value})" if value else f" ({key})"
        if trigger_name == "pull_request":
            fail(
                f"{CI_PATH}: pull_request trigger carries a branch filter{detail} this "
                "checker does not model; the staging pull request is the only place the "
                "rubric runs, so spell the coverage out here before it can ship"
            )
        else:
            fail(
                f"{CI_PATH}: {trigger_name!r} trigger carries a {key!r} filter{detail} "
                "this checker does not model; make the handled branches explicit before "
                "shipping"
            )

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
    base_ref_expr = r"github\.event\.pull_request\.base\.ref"
    if re.search(r"github\.event_name\s*!=", text):
        fail(
            f"{CI_PATH}: job {job_id!r} uses a negated event predicate this checker does "
            "not model; make the handled events explicit before shipping"
        )
        return None
    if re.search(base_ref_expr + r"\s*!=", text) or re.search(
        r"!\s*\(?\s*" + base_ref_expr, text
    ):
        fail(
            f"{CI_PATH}: job {job_id!r} uses a negated PR base-ref predicate this checker "
            "does not model; make the targeted bases explicit before shipping"
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
        base_matches = re.findall(base_ref_expr + r"\s*==\s*'([a-z]+)'", text)
        base_ref_occurrences = len(re.findall(base_ref_expr, text))
        if base_ref_occurrences != len(base_matches):
            fail(
                f"{CI_PATH}: job {job_id!r} references the PR base ref in a form this "
                f"checker does not model: {text.strip()}"
            )
            return None
        if len(base_matches) > 1:
            fail(
                f"{CI_PATH}: job {job_id!r} declares more than one PR base-ref predicate; "
                "make the targeted bases explicit before shipping"
            )
            return None
        pr_bases = {base_matches[0]} if base_matches else {"staging", "premain", "main"}
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

    # Ruling: the rubric and deterministic-build jobs are staging-PR-only; they
    # must not run on a protected-branch push or on a promotion pull request, so
    # a required promotion context can never depend on them.
    for required_job in (RUBRIC_JOB, DETERMINISTIC_JOB):
        if required_job not in wiring:
            fail(f"{CI_PATH}: missing job {required_job!r}")
            continue
        events, pr_bases = wiring[required_job]
        if events != STAGING_PR_ONLY_EVENTS:
            fail(
                f"{CI_PATH}: job {required_job!r} must run only for pull requests to "
                f"staging plus opted-in manual dispatch; got events={sorted(events)}"
            )
        if pr_bases != {STAGING}:
            fail(
                f"{CI_PATH}: job {required_job!r} must be scoped to pull requests "
                f"targeting {STAGING!r}; got bases={sorted(pr_bases)}"
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

    # Post-release main back-merge exemption: the staging-lane readiness gate is
    # the only lane that may opt in, and only with the pull-request head ref and
    # head repository the predicate compares -- never a widened expression such
    # as github.ref_name, which would exempt a pull request whose content has not
    # been released. The promotion-edge readiness lanes must never opt in: they
    # promote already-released content, so a range with no release-driving commit
    # there means the promotion would ship nothing.
    if PR_STAGING_READINESS in by_name:
        readiness_body = jobs[by_name[PR_STAGING_READINESS]]
        for needle, why in (
            ("--allow-main-backmerge", "opt in to the post-release main back-merge exemption"),
            (
                "PR_HEAD_REF: ${{ github.event.pull_request.head.ref }}",
                "bind the exemption's head ref to the pull-request head ref",
            ),
            (
                '--head-ref "${PR_HEAD_REF}"',
                "feed the exemption the bound pull-request head ref",
            ),
            (
                "PR_HEAD_REPOSITORY: ${{ github.event.pull_request.head.repo.full_name }}",
                "bind the exemption's head repository to the pull-request head repository",
            ),
            (
                '--github-head-repository "${PR_HEAD_REPOSITORY}"',
                "feed the exemption the bound pull-request head repository, so a fork branch named main cannot take it",
            ),
            (
                '--github-repository "${GITHUB_REPOSITORY}"',
                "name this repository for the exemption's trusted-repository comparison",
            ),
        ):
            if needle not in readiness_body:
                fail(
                    f"{CI_PATH}: {PR_STAGING_READINESS!r} must {why}; "
                    f"missing {needle!r}"
                )

    for promotion_name in (
        "Prerelease readiness (staging -> premain)",
        "Release readiness (PR -> main)",
    ):
        if (
            promotion_name in by_name
            and "--allow-main-backmerge" in jobs[by_name[promotion_name]]
        ):
            fail(
                f"{CI_PATH}: {promotion_name!r} must not take the post-release "
                "main back-merge exemption; it promotes already-released content"
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
