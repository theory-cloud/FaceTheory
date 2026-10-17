#!/usr/bin/env bash
# Purpose: fail closed when a token-bearing release workflow runs Python with the
# repository working directory on the module search path.
#
# Finding e9b5a4cb2d28819180cc7f148d8bd265: prerelease.yml/release.yml exported
# `secrets.RELEASE_PLEASE_TOKEN` (falling back to the write-capable job token)
# into an inline `python3 -` step whose cwd was the repository root. For programs
# read from standard input, Python puts the current directory on sys.path, so a
# checked-in `json.py` shadows the standard library and runs repository-controlled
# code with the release token in its environment.
#
# The fix is `python3 -I` (isolated mode), which drops both the script directory
# and the current working directory from sys.path and ignores PYTHON* env and the
# user site directory. Every stdin/file Python invocation in the token-bearing
# release workflows, and in the credential-bearing publish helper, must use it.
set -euo pipefail

repo_root="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

python3 - "${repo_root}" <<'PY'
import re
import sys
from pathlib import Path

repo_root = Path(sys.argv[1])
targets = [
    ".github/workflows/prerelease.yml",
    ".github/workflows/release.yml",
    "scripts/trigger_theorycloud_publish.sh",
]
errors = []
python_re = re.compile(r"\bpython3\b")

for relative in targets:
    path = repo_root / relative
    if not path.is_file():
        errors.append(f"missing scan surface file: {relative}")
        continue
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        for match in python_re.finditer(line):
            remainder = line[match.end():]
            if remainder.startswith(" -I"):
                continue
            errors.append(
                f"{relative}:{line_number}: python3 must run isolated (-I) so the repo cwd "
                f"cannot shadow stdlib imports: {line.strip()}"
            )

if errors:
    print("release-python-isolation: FAIL")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("release-python-isolation: PASS")
PY
