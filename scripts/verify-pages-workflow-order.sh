#!/usr/bin/env bash
# Purpose: fail closed when pages.yml runs its deploy-tag provenance verifier
# before any checkout has provided that verifier, or from an unverified tree.
#
# Finding FAC-FACE532-1 (round 1 of the FACESEC45-M1 release-trust milestone):
# the provenance guard `scripts/verify-pages-deploy-tag.sh` executed before this
# build job's first checkout, so on a fresh runner the script did not exist and
# the ordinary authorized Pages deploy failed before the build. Required CI
# never runs pages.yml, so a green pull request could not catch it — which is
# why this is a static workspace-order check, not a CI-exercised runtime.
#
# Invariants enforced on the pages.yml `build` job, in step order:
#   A. the step that runs the provenance verifier is preceded by a checkout step
#      that sources the verifier from a protected, constant branch ref — never
#      the unverified run/tag tree (github.sha), never an event/input-derived
#      ref — into a subdirectory whose path prefixes the verifier invocation;
#   B. the verifier is invoked from that checked-out subdirectory, never from a
#      bare repo-root path (which would run an unverified tree's own verifier);
#   C. a later checkout supplies the immutable run SHA (github.sha) as the build
#      tree, so the graded site is exactly the verified run ref.
set -euo pipefail

repo_root="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

python3 - "${repo_root}" <<'PY'
import re
import sys
from pathlib import Path

repo_root = Path(sys.argv[1])
workflow_path = repo_root / ".github/workflows/pages.yml"
verifier_name = "verify-pages-deploy-tag.sh"
errors = []

if not workflow_path.is_file():
    print(f"pages-workflow-order: FAIL (missing {workflow_path})")
    sys.exit(1)

lines = workflow_path.read_text(encoding="utf-8").splitlines()

job_start = None
for index, line in enumerate(lines):
    if line == "  build:":
        job_start = index
        break
if job_start is None:
    print("pages-workflow-order: FAIL (pages.yml has no build job)")
    sys.exit(1)

job_header_re = re.compile(r"^  [A-Za-z0-9_-]+:$")
job_end = len(lines)
for index in range(job_start + 1, len(lines)):
    if job_header_re.match(lines[index]):
        job_end = index
        break
job = lines[job_start:job_end]

steps = []
current = None
for line in job:
    if re.match(r"^      - ", line):
        if current is not None:
            steps.append(current)
        current = [line]
    elif current is not None:
        current.append(line)
if current is not None:
    steps.append(current)
step_texts = ["\n".join(step) for step in steps]

checkout_re = re.compile(r"^\s+uses:\s*actions/checkout@", re.MULTILINE)


def field(text, name):
    match = re.search(rf"^          {re.escape(name)}:\s*(.*\S)\s*$", text, re.MULTILINE)
    return match.group(1).strip() if match else None


verify_indexes = [i for i, text in enumerate(step_texts) if verifier_name in text]
verify_index = verify_indexes[0] if len(verify_indexes) == 1 else None
if len(verify_indexes) != 1:
    errors.append(
        f"expected exactly one step invoking {verifier_name}; found {len(verify_indexes)}"
    )

if verify_index is not None:
    verify_text = step_texts[verify_index]

    # B. never a bare repo-root invocation of the verifier.
    if re.search(rf"(?<![\w./-])scripts/{re.escape(verifier_name)}", verify_text):
        errors.append(
            "provenance verifier must not be invoked from the repo root "
            "(that executes the unverified run tree's own copy)"
        )

    # A. a preceding checkout sources the verifier from a constant protected ref.
    # `refs/heads/main` is the current binding; any constant refs/heads/* ref
    # (never github.sha, never an event/input expression) is accepted.
    trusted_predecessor = None
    for i in range(verify_index):
        text = step_texts[i]
        if not checkout_re.search(text):
            continue
        ref = field(text, "ref")
        path = field(text, "path")
        persist = field(text, "persist-credentials")
        if not ref or not re.match(r"^refs/heads/[A-Za-z0-9._/-]+$", ref):
            continue
        if not path or path in {".", "./"}:
            continue
        if persist != "false":
            continue
        if f"{path.rstrip('/')}/scripts/{verifier_name}" not in verify_text:
            continue
        trusted_predecessor = (ref, path)
        break
    if trusted_predecessor is None:
        errors.append(
            "provenance verifier has no preceding checkout sourcing it from a "
            "constant protected branch ref into the path it invokes "
            "(fresh-runner failure)"
        )

    # C. a later checkout supplies the immutable run SHA as the build tree.
    later_run_sha = False
    for i in range(verify_index + 1, len(step_texts)):
        text = step_texts[i]
        if not checkout_re.search(text):
            continue
        ref = field(text, "ref")
        if ref is not None and "${{ github.sha }}" in ref:
            later_run_sha = True
            break
    if not later_run_sha:
        errors.append(
            "no checkout after the verification supplies the immutable run SHA "
            "(${{ github.sha }}) as the build tree"
        )

if errors:
    print("pages-workflow-order: FAIL")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("pages-workflow-order: PASS")
PY
