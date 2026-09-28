#!/usr/bin/env bash
# Purpose: fail closed when a committed CI, release, or governance surface
# installs packages from a lockfile without disabling install scripts (npm) or
# without pinning to the lockfile (pnpm / yarn), and when the Ruby docs build is
# not lockfile-frozen.
#
# Scan surface: the surfaces that provision a toolchain in CI or in a governance
# verifier -- .github/workflows/*.yml, Makefile, scripts/*.sh, and
# gov-infra/verifiers/*.sh.
#
# A lockfile install counts only in command position (start of line, after a
# shell separator, or after a workflow `run:` key). `scripts/render-release-notes.sh`
# embeds an `npm install` usage line inside rendered release-note prose; matching
# on command position keeps that documentation text from tripping the gate
# without weakening the rule for real invocations.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v python3 >/dev/null 2>&1; then
  echo "ci-install-hardening: BLOCKED (python3 not found)" >&2
  exit 2
fi

python3 <<'PY'
import glob
import re
import sys
from pathlib import Path

surface = (
    sorted(glob.glob(".github/workflows/*.y*ml"))
    + ["Makefile"]
    + sorted(glob.glob("scripts/*.sh"))
    + sorted(glob.glob("gov-infra/verifiers/*.sh"))
)

PREFIX = r"(?:^|[;&|()]|&&|\|\||run:[ \t]+)[ \t]*"

# (matcher, required flags on the invocation, human label)
INSTALL_RULES = [
    (
        re.compile(PREFIX + r"npm[ \t]+ci(?=[ \t]|$)"),
        ("--ignore-scripts",),
        "npm ci",
    ),
    (
        re.compile(PREFIX + r"npm[ \t]+(?:install|i)(?=[ \t]|$)"),
        ("--ignore-scripts",),
        "npm install",
    ),
    (
        re.compile(PREFIX + r"pnpm[ \t]+(?:install|i|add)(?=[ \t]|$)"),
        ("--frozen-lockfile", "--ignore-scripts"),
        "pnpm install",
    ),
    (
        re.compile(PREFIX + r"yarn(?:\.js)?[ \t]+(?:install|add)(?=[ \t]|$)"),
        ("--frozen-lockfile", "--ignore-scripts"),
        "yarn install",
    ),
]

BUNDLE = re.compile(PREFIX + r"bundle[ \t]+install(?=[ \t]|$)")

failures = []

for path in surface:
    target = Path(path)
    if not target.is_file():
        failures.append(f"missing scan surface file: {path}")
        continue
    lines = target.read_text(encoding="utf-8").splitlines()
    index = 0
    while index < len(lines):
        start_line = index + 1
        logical = lines[index]
        while logical.rstrip().endswith("\\") and index + 1 < len(lines):
            index += 1
            logical = logical.rstrip()[:-1] + " " + lines[index]
        for matcher, required, label in INSTALL_RULES:
            if not matcher.search(logical):
                continue
            missing = [flag for flag in required if flag not in logical]
            if missing:
                failures.append(
                    f"{path}:{start_line}: {label} must run with scripts disabled and the "
                    f"lockfile enforced (missing {' '.join(missing)}): {logical.strip()}"
                )
        if BUNDLE.search(logical) and "--frozen" not in logical and "--deployment" not in logical:
            failures.append(
                f"{path}:{start_line}: bundle install must pin Gemfile.lock "
                f"(pass --frozen or --deployment): {logical.strip()}"
            )
        index += 1

pages = Path(".github/workflows/pages.yml")
if not pages.is_file():
    failures.append("missing .github/workflows/pages.yml")
elif not BUNDLE.search(pages.read_text(encoding="utf-8")):
    failures.append(".github/workflows/pages.yml: expected a bundle install step")

if failures:
    print("ci-install-hardening: FAIL")
    for failure in failures:
        print(f"- {failure}")
    sys.exit(1)

print(f"ci-install-hardening: PASS ({len(surface)} surfaces)")
PY
