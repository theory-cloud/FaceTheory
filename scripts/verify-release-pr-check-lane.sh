#!/usr/bin/env bash
set -euo pipefail

# REL guard: every generated release pull request has an automatic dispatch path
# for every required context of its base branch, bound to the pull request head.
#
# The failure this prevents is a release lane that looks wired but cannot gate
# itself. release-please creates its pull requests with the built-in
# `GITHUB_TOKEN`, and GitHub starts no `pull_request` workflow for events that
# token causes, so a required context never reports. Closing and reopening the
# pull request, or a human dispatching the workflow by hand, used to be the only
# repairs. Dispatch alone is also not enough: a required status check counts only
# for a run from an eligible event, so the lane pairs the dispatch with the
# code-owner review the release ruleset already requires. The declaration in
# `.github/release-lane.json` names, per base branch, the required contexts and
# the workflow that reports each one; this guard proves that:
#
#   1. every workflow that creates a generated release pull request declares the
#      permission to create pull requests and to dispatch workflows;
#   2. it invokes scripts/sync-release-pr-checks.sh for the exact head branch the
#      declaration names;
#   3. each required context is a job id in a workflow that has a
#      workflow_dispatch path taking the pull request number and binding the run
#      to that pull request's head, so a run can never certify a different tree;
#   4. each required context also has an eligible-event path for that base: the
#      code-owner review of the pull request starts the same workflow on the
#      reviewed head (`pull_request_review: [submitted]`), and the reporting job
#      carries no `if:` that could skip it. A dispatched run never satisfies a
#      required status check, so without this path the lane would look green and
#      gate nothing;
#   5. no workflow reintroduces a release-please token fallback: the lane runs on
#      the built-in token only.
#
# The self-test proves the guard is not vacuous: it mutates copies of the real
# workflows and declaration and requires each mutation to fail.
#
# Usage: bash scripts/verify-release-pr-check-lane.sh [--self-test] [--root DIR]

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
self_test=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test)
      self_test=true
      shift
      ;;
    --root)
      [[ $# -ge 2 ]] || { echo "release-pr-check-lane: FAIL (--root requires a value)" >&2; exit 2; }
      root="$2"
      shift 2
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: bash scripts/verify-release-pr-check-lane.sh [--self-test] [--root DIR]

Fails when a generated release pull request has no head-bound dispatch path for
one of its base branch's required contexts. --self-test additionally proves the
guard rejects hostile shapes.
USAGE
      exit 0
      ;;
    *)
      echo "release-pr-check-lane: FAIL (unknown argument: $1)" >&2
      exit 2
      ;;
  esac
done

failures=0
report() {
  echo "release-pr-check-lane: $1" >&2
  failures=$((failures + 1))
}

# A required status check counts only for a run from push, pull_request,
# pull_request_review, pull_request_target, deployment or deployment_status. A
# generated release pull request produces exactly one eligible run: the
# code-owner review its release ruleset already requires. The reporting workflow
# must therefore run on that event for the reviewed base, and the reporting job
# must not carry an `if:` that can skip it -- a skipped job reports no context.
eligible_event_checks() {
  local verifier_workflow="$1"
  local base="$2"
  local context="$3"
  local job="$4"
  local path="${workflows}/${verifier_workflow}"
  local output
  local status=0
  output="$(python3 - "${path}" "${base}" "${context}" "${job}" <<'PY' 2>&1
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
base = sys.argv[2]
context = sys.argv[3]
job = sys.argv[4]
lines = path.read_text(encoding="utf-8").splitlines()
problems: list[str] = []


def fail(message: str) -> None:
    problems.append(f"{path.name} {message}")


def event_block(name: str) -> list[str] | None:
    for index, line in enumerate(lines):
        if line.rstrip() == f"  {name}:":
            block: list[str] = []
            for candidate in lines[index + 1 :]:
                if candidate.strip() == "":
                    continue
                if not candidate.startswith("    "):
                    break
                block.append(candidate)
            return block
    return None


def values(block: list[str], key: str) -> list[str] | None:
    """The list under `key`, from an inline `[...]` or a block `- item` list."""
    for index, line in enumerate(block):
        match = re.match(rf"^    {re.escape(key)}:[ \t]*(.*)$", line)
        if match is None:
            continue
        inline = match.group(1).strip()
        if inline.startswith("[") and inline.endswith("]"):
            return [item.strip().strip("'\"") for item in inline[1:-1].split(",") if item.strip()]
        collected = []
        for candidate in block[index + 1 :]:
            item = re.match(r"^      -[ \t]+(.+?)[ \t]*$", candidate)
            if item is None:
                break
            collected.append(item.group(1).strip().strip("'\""))
        return collected
    return None


review = event_block("pull_request_review")
if review is None:
    fail(
        "has no pull_request_review trigger, so the code-owner review of a generated "
        f"release pull request cannot make {context} a required check"
    )
else:
    types = values(review, "types")
    if not types or "submitted" not in types:
        fail("does not subscribe its pull_request_review trigger to the submitted activity")
    branches = values(review, "branches")
    if branches is None:
        fail(
            "does not scope its pull_request_review trigger to a base branch, so every "
            "staging review would run it too"
        )
    elif base not in branches:
        fail(f"does not subscribe its pull_request_review trigger to base {base!r} (branches: {branches})")

job_block: list[str] | None = None
for index, line in enumerate(lines):
    if line.rstrip() == f"  {job}:":
        job_block = []
        for candidate in lines[index + 1 :]:
            if not candidate.startswith((" ", "\t")):
                break
            if re.match(r"^  [A-Za-z0-9_-]+:[ \t]*$", candidate):
                break
            job_block.append(candidate)
        break

if job_block is not None:
    for line in job_block:
        condition = re.match(r"^    if:[ \t]*(.+?)[ \t]*$", line)
        if condition is None:
            continue
        # A job-level condition is accepted only when it names the review event.
        # This is deliberately conservative: a negation-shaped condition that
        # happens to include the event is rejected too, and no workflow here is
        # written that way.
        if "pull_request_review" not in condition.group(1):
            fail(
                f"job {job} carries `if: {condition.group(1)}`, which can exclude "
                f"pull_request_review, so the code-owner review would never report {context}"
            )
        break

for problem in problems:
    print(problem)
if problems:
    raise SystemExit(1)
PY
)" || status=$?
  if (( status != 0 )); then
    while IFS= read -r line; do
      [[ -n "${line}" ]] && report "${line}"
    done <<<"${output}"
  fi
}

config="${root}/.github/release-lane.json"
workflows="${root}/.github/workflows"

if [[ ! -f "${config}" ]]; then
  echo "release-pr-check-lane: FAIL (missing ${config})" >&2
  exit 1
fi

# Emit one line per (head, base, context, workflow, job) and one per producer.
# The parsing lives in one place so the guard and the lane script cannot read the
# declaration differently.
plan="$(python3 - "${config}" <<'PY'
import json
import sys

try:
    data = json.loads(open(sys.argv[1], encoding="utf-8").read())
except json.JSONDecodeError as exc:
    print(f"release-pr-check-lane: FAIL (declaration is not JSON: {exc})", file=sys.stderr)
    raise SystemExit(1)

if data.get("schemaVersion") != 1:
    print("release-pr-check-lane: FAIL (declaration schemaVersion must be 1)", file=sys.stderr)
    raise SystemExit(1)

contexts = data.get("requiredContexts") or {}
producers = data.get("generatedReleasePullRequests") or []
if not producers:
    print("release-pr-check-lane: FAIL (declaration names no generated release pull request)", file=sys.stderr)
    raise SystemExit(1)

for entry in producers:
    head = str(entry.get("head") or "")
    base = str(entry.get("base") or "")
    workflow = str(entry.get("workflow") or "")
    if not head or not base or not workflow:
        print("release-pr-check-lane: FAIL (a producer entry is missing head, base or workflow)", file=sys.stderr)
        raise SystemExit(1)
    print(f"producer\t{head}\t{base}\t{workflow}")
    required = [item for item in contexts.get(base) or [] if item.get("context")]
    if not required:
        print(
            f"release-pr-check-lane: FAIL ({base} declares no required context, so {head} has nothing to satisfy)",
            file=sys.stderr,
        )
        raise SystemExit(1)
    for item in required:
        print(
            f"context\t{base}\t{item['context']}\t{str(item.get('workflow') or '')}\t{str(item.get('job') or '')}"
        )
PY
)" || exit 1

while IFS=$'\t' read -r kind a b c d; do
  case "${kind}" in
    producer)
      head="${a}"
      producer_workflow="${c}"
      path="${workflows}/${producer_workflow}"
      if [[ ! -f "${path}" ]]; then
        report "declared producer ${producer_workflow} does not exist"
        continue
      fi
      if ! grep -Eq '^[[:space:]]+pull-requests:[[:space:]]*write[[:space:]]*$' "${path}"; then
        report "${producer_workflow} creates a pull request but does not declare pull-requests: write"
      fi
      if ! grep -Eq '^[[:space:]]+actions:[[:space:]]*write[[:space:]]*$' "${path}"; then
        report "${producer_workflow} dispatches the verifying workflow but does not declare actions: write"
      fi
      if ! grep -Fq -- "--head-branch ${head}" "${path}"; then
        report "${producer_workflow} does not run scripts/sync-release-pr-checks.sh for ${head}"
      fi
      if ! grep -Fq "scripts/sync-release-pr-checks.sh" "${path}"; then
        report "${producer_workflow} does not attach the required checks to its generated pull request"
      fi
      ;;
    context)
      context="${b}"
      verifier_workflow="${c}"
      job="${d}"
      path="${workflows}/${verifier_workflow}"
      if [[ ! -f "${path}" ]]; then
        report "required context ${context} names a missing workflow ${verifier_workflow}"
        continue
      fi
      if [[ -z "${job}" || "${job}" != "${context}" ]]; then
        report "required context ${context} must be the reporting job id, found ${job:-<empty>}"
      fi
      if ! grep -Eq '^[[:space:]]+workflow_dispatch:[[:space:]]*($|#)' "${path}"; then
        report "${verifier_workflow} reports ${context} but has no workflow_dispatch path"
      fi
      if ! grep -Eq '^[[:space:]]+release_pr_number:[[:space:]]*$' "${path}"; then
        report "${verifier_workflow} has no release_pr_number dispatch input to bind the head"
      fi
      if ! grep -Eq "^[[:space:]]{2}${job}:[[:space:]]*$" "${path}"; then
        report "${verifier_workflow} has no job named ${job}, so ${context} would never report"
      fi
      # The dispatched run must prove the pull request it was told to verify is
      # the one whose head it is running on. These markers are the binding: the
      # pull request read, the dispatched ref and SHA, and the head fields the
      # run compares them with.
      for marker in \
        'RELEASE_PR_NUMBER' \
        'DISPATCHED_REF_NAME' \
        'DISPATCHED_SHA' \
        'pulls/' \
        'head.get("sha")' \
        'base.get("ref")' \
        'head.get("repo")'; do
        if ! grep -Fq -- "${marker}" "${path}"; then
          report "${verifier_workflow} does not bind a dispatched run to the pull request head (missing ${marker})"
        fi
      done
      if grep -Eq '^[[:space:]]+(-[[:space:]]+)?uses:[[:space:]]+actions/checkout@' "${path}"; then
        report "${verifier_workflow} checks out code; the head check must need only the pull request context"
      fi
      if grep -Eq '^[[:space:]]+[a-z-]+:[[:space:]]*write[[:space:]]*$' "${path}"; then
        report "${verifier_workflow} asks for a write permission; the lane runs on read-only built-in access"
      fi
      eligible_event_checks "${verifier_workflow}" "${a}" "${context}" "${job}"
      ;;
  esac
done < <(printf '%s\n' "${plan}")

# The lane must run on the built-in token. A release-please token fallback makes
# the lane depend on an identity that does not exist, and a token identity would
# let a generated pull request authenticate as a person.
for workflow in "${workflows}"/*.yml; do
  [[ -f "${workflow}" ]] || continue
  name="$(basename "${workflow}")"
  if grep -Fq "secrets.RELEASE_PLEASE_TOKEN" "${workflow}"; then
    report "${name} reintroduces the RELEASE_PLEASE_TOKEN identity"
  fi
done

for lane_workflow in prerelease-pr.yml release-pr.yml promotion-hygiene.yml; do
  path="${workflows}/${lane_workflow}"
  [[ -f "${path}" ]] || continue
  if grep -Fq "secrets\." "${path}"; then
    report "${lane_workflow} names a repository secret; the lane uses the built-in token only"
  fi
done
if grep -Fq "secrets\." "${root}/scripts/sync-release-pr-checks.sh" 2>/dev/null; then
  report "sync-release-pr-checks.sh names a repository secret; the lane uses the built-in token only"
fi

run_self_test() {
  local scratch
  scratch="$(mktemp -d "${TMPDIR:-/tmp}/facetheory-release-pr-check-lane.XXXXXX")"
  # shellcheck disable=SC2064 # the path is expanded now; the local is gone at EXIT
  trap "rm -rf '${scratch}'" EXIT

  local guard="${root}/scripts/verify-release-pr-check-lane.sh"
  local cases=0

  expect_fixture_failure() {
    local label="$1"
    local expected="$2"
    local fixture="$3"
    local output
    cases=$((cases + 1))
    if output="$(bash "${guard}" --root "${fixture}" 2>&1)"; then
      echo "release-pr-check-lane self-test: FAIL (${label}; guard accepted the mutation)" >&2
      printf '%s\n' "${output}" >&2
      exit 1
    fi
    if ! grep -Fq -- "${expected}" <<<"${output}"; then
      echo "release-pr-check-lane self-test: FAIL (${label}; missing ${expected})" >&2
      printf '%s\n' "${output}" >&2
      exit 1
    fi
    echo "release-pr-check-lane self-test: PASS ${label}"
  }

  new_fixture() {
    local name="$1"
    local dir="${scratch}/${name}"
    mkdir -p "${dir}/.github/workflows" "${dir}/scripts"
    cp "${config}" "${dir}/.github/release-lane.json"
    cp "${workflows}"/*.yml "${dir}/.github/workflows/"
    cp "${guard}" "${dir}/scripts/verify-release-pr-check-lane.sh"
    printf '%s\n' "${dir}"
  }

  # The unmodified copy passes: the guard reads only the declaration and the
  # workflows, so a faithful copy must be accepted before mutations mean anything.
  baseline="$(new_fixture baseline)"
  cases=$((cases + 1))
  if ! bash "${guard}" --root "${baseline}" >/dev/null 2>&1; then
    echo "release-pr-check-lane self-test: FAIL (the faithful copy of the real tree must pass)" >&2
    bash "${guard}" --root "${baseline}" >&2 || true
    exit 1
  fi
  echo "release-pr-check-lane self-test: PASS a faithful copy of the real tree passes"

  # 1. A producer that stops invoking the lane.
  fixture="$(new_fixture no-lane)"
  sed -i.bak '/scripts\/sync-release-pr-checks.sh/d' "${fixture}/.github/workflows/prerelease-pr.yml"
  rm -f "${fixture}/.github/workflows/prerelease-pr.yml.bak"
  expect_fixture_failure "a producer that stops attaching the lane fails" \
    "does not attach the required checks" "${fixture}"

  # 2. A producer that dispatches without the dispatch permission.
  fixture="$(new_fixture no-actions-write)"
  python3 - "${fixture}/.github/workflows/release-pr.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
path.write_text(text.replace("      actions: write\n", "", 1), encoding="utf-8")
PY
  expect_fixture_failure "a producer without actions: write fails" \
    "does not declare actions: write" "${fixture}"

  # 3. A verifying workflow that loses its dispatch input, so nothing can bind a
  #    dispatched run to the pull request.
  fixture="$(new_fixture no-dispatch-input)"
  python3 - "${fixture}/.github/workflows/promotion-hygiene.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
out = [line for line in lines if line.strip() != "release_pr_number:"]
path.write_text("".join(out), encoding="utf-8")
PY
  expect_fixture_failure "a verifying workflow without release_pr_number fails" \
    "has no release_pr_number dispatch input" "${fixture}"

  # 4. A verifying workflow that stops binding the dispatched ref to the pull
  #    request head.
  fixture="$(new_fixture no-head-binding)"
  sed -i.bak 's|head.get("sha")|head.get("ref")|g' \
    "${fixture}/.github/workflows/promotion-hygiene.yml"
  rm -f "${fixture}/.github/workflows/promotion-hygiene.yml.bak"
  expect_fixture_failure "a verifying workflow without the head binding fails" \
    "missing head.get(\"sha\")" "${fixture}"

  # 5. A required context whose job id no longer matches the context name would
  #    never report that context.
  fixture="$(new_fixture renamed-job)"
  sed -i.bak 's|^  promotion-hygiene:$|  release-hygiene:|' \
    "${fixture}/.github/workflows/promotion-hygiene.yml"
  rm -f "${fixture}/.github/workflows/promotion-hygiene.yml.bak"
  expect_fixture_failure "a verifying job renamed away from its context fails" \
    "has no job named promotion-hygiene" "${fixture}"

  # 6. A credential fallback reintroduced anywhere in the workflow set.
  fixture="$(new_fixture token-fallback)"
  printf '\n# fallback for the record\n# token: ${{ secrets.RELEASE_PLEASE_TOKEN }}\n' \
    >>"${fixture}/.github/workflows/release.yml"
  expect_fixture_failure "a reintroduced release-please token fails" \
    "reintroduces the RELEASE_PLEASE_TOKEN identity" "${fixture}"

  # 7. A verifying workflow that checks the pull request out would run
  #    pull-request content, which the head check must never need.
  fixture="$(new_fixture with-checkout)"
  python3 - "${fixture}/.github/workflows/promotion-hygiene.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
path.write_text(
    text.replace(
        "    steps:\n",
        "    steps:\n"
        "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n",
        1,
    ),
    encoding="utf-8",
)
PY
  expect_fixture_failure "a verifying workflow that checks out the pull request fails" \
    "checks out code" "${fixture}"

  # 8. A verifying workflow that asks for write access would turn the release
  #    gate into a credential.
  fixture="$(new_fixture write-permission)"
  python3 - "${fixture}/.github/workflows/promotion-hygiene.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
path.write_text(text.replace("  pull-requests: read\n", "  pull-requests: write\n", 1), encoding="utf-8")
PY
  expect_fixture_failure "a verifying workflow with a write permission fails" \
    "asks for a write permission" "${fixture}"

  # 9. The eligible-event path removed: the code-owner review can no longer make
  #    the context count, so the dispatched run would gate nothing.
  fixture="$(new_fixture no-review-trigger)"
  python3 - "${fixture}/.github/workflows/promotion-hygiene.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
out: list[str] = []
skipping = False
for line in lines:
    if line.rstrip("\n") == "  pull_request_review:":
        skipping = True
        continue
    if skipping:
        if line.startswith("    "):
            continue
        skipping = False
    out.append(line)
path.write_text("".join(out), encoding="utf-8")
PY
  expect_fixture_failure "a verifying workflow without the review trigger fails" \
    "has no pull_request_review trigger" "${fixture}"

  # 10. The review trigger subscribed to the wrong base: the review of a release
  #     pull request would not run the context that base requires.
  fixture="$(new_fixture review-without-base)"
  python3 - "${fixture}/.github/workflows/promotion-hygiene.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
path.write_text(
    text.replace("    branches: [premain, main]\n", "    branches: [main]\n", 1),
    encoding="utf-8",
)
PY
  expect_fixture_failure "a review trigger that skips a release base fails" \
    "does not subscribe its pull_request_review trigger to base 'premain'" "${fixture}"

  # 11. A reporting job whose condition excludes the review event would be
  #     skipped there, and a skipped job reports no context.
  fixture="$(new_fixture review-excluded-by-if)"
  python3 - "${fixture}/.github/workflows/promotion-hygiene.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
path.write_text(
    text.replace(
        "  promotion-hygiene:\n    name: promotion-hygiene\n",
        "  promotion-hygiene:\n    name: promotion-hygiene\n    if: github.event_name == 'pull_request'\n",
        1,
    ),
    encoding="utf-8",
)
PY
  expect_fixture_failure "a reporting job that excludes the review event fails" \
    "can exclude pull_request_review" "${fixture}"

  echo "release-pr-check-lane self-test: PASS (${cases} cases)"
}

if (( failures > 0 )); then
  echo "release-pr-check-lane: FAIL (${failures} problem(s))" >&2
  exit 1
fi

if [[ "${self_test}" == "true" ]]; then
  run_self_test
else
  echo "release-pr-check-lane: PASS (every generated release PR has a head-bound dispatch path for each required context)"
fi
