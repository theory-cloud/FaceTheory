#!/usr/bin/env bash
# Purpose: fail closed when the privileged TheoryCloud subtree publisher can
# execute mutable PyPI code, or can resolve that code after the stage-scoped AWS
# role is assumed.
#
# Finding 47f6bea17384819184ee41b557730745: the workflow exported temporary AWS
# credentials and then ran a floating `pip install --upgrade pip` plus an
# unpinned `awscurl` install. Scanned invariants:
#   A. every `pip install` in the publisher is `--require-hashes` and installs
#      from a requirements file;
#   B. that requirements file pins every requirement to an exact version and
#      hash-pins every artifact (no ranges, no unhashed lines);
#   C. the install happens BEFORE the `.github/workflows` step that assumes the
#      stage-scoped AWS role;
#   D. no floating `pip install --upgrade` remains.
set -euo pipefail

repo_root="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

python3 - "${repo_root}" <<'PY'
import re
import sys
from pathlib import Path

repo_root = Path(sys.argv[1])
workflow_path = repo_root / ".github/workflows/theorycloud-facetheory-subtree-publish.yml"
errors = []

if not workflow_path.is_file():
    print(f"theorycloud-publish-install: FAIL (missing {workflow_path})")
    sys.exit(1)

raw_lines = workflow_path.read_text(encoding="utf-8").splitlines()


def logical_lines(lines):
    """Yield (start_line_number, joined_line) with backslash continuations joined."""
    index = 0
    while index < len(lines):
        start = index + 1
        joined = lines[index]
        while joined.rstrip().endswith("\\") and index + 1 < len(lines):
            index += 1
            joined = joined.rstrip()[:-1] + " " + lines[index]
        yield start, joined
        index += 1


install_re = re.compile(r"(?:python3\s+-m\s+)?pip3?\s+install\b")
requirement_re = re.compile(r"(?:--requirement|(?:^|\s)-r)(?:[=\s]+)(\S+)")
first_install_line = None
referenced_requirements = []

for line_number, line in logical_lines(raw_lines):
    if not install_re.search(line):
        continue
    if first_install_line is None:
        first_install_line = line_number
    if "--require-hashes" not in line:
        errors.append(
            f"{workflow_path}:{line_number}: pip install must pass --require-hashes: {line.strip()}"
        )
    requirement_match = requirement_re.search(line)
    if not requirement_match:
        errors.append(
            f"{workflow_path}:{line_number}: pip install must install from a requirements file: {line.strip()}"
        )
    else:
        referenced_requirements.append((line_number, requirement_match.group(1)))

for line_number, line in logical_lines(raw_lines):
    if re.search(r"pip3?\s+install\b", line) and "--upgrade" in line:
        errors.append(
            f"{workflow_path}:{line_number}: floating pip upgrade must be removed: {line.strip()}"
        )

assume_line = None
for index, line in enumerate(raw_lines):
    if "aws-actions/configure-aws-credentials@" in line:
        assume_line = index + 1
        break
if assume_line is None:
    errors.append(f"{workflow_path}: missing the stage-scoped AWS role assumption step")
elif first_install_line is None:
    errors.append(f"{workflow_path}: missing the hash-locked publisher install step")
elif first_install_line > assume_line:
    errors.append(
        f"{workflow_path}: publisher toolchain install (line {first_install_line}) must run "
        f"before the AWS role assumption (line {assume_line})"
    )

if not referenced_requirements:
    errors.append(f"{workflow_path}: no requirements file is installed by the publisher")

for line_number, reference in referenced_requirements:
    requirement_path = repo_root / reference
    if not requirement_path.is_file():
        errors.append(
            f"{workflow_path}:{line_number}: referenced requirements file {reference} does not exist"
        )
        continue
    pinned = 0
    for req_line_number, requirement in logical_lines(
        requirement_path.read_text(encoding="utf-8").splitlines()
    ):
        stripped = requirement.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if not re.match(r"^[A-Za-z0-9][A-Za-z0-9._-]*==[^\s\\]+", stripped):
            errors.append(
                f"{requirement_path}:{req_line_number}: requirement must be pinned with ==: {stripped}"
            )
        if "--hash=sha256:" not in requirement:
            errors.append(
                f"{requirement_path}:{req_line_number}: requirement must be hash-pinned: {stripped}"
            )
        pinned += 1
    if pinned == 0:
        errors.append(f"{requirement_path}: requirements file pins no packages")

if errors:
    print("theorycloud-publish-install: FAIL")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("theorycloud-publish-install: PASS")
PY
