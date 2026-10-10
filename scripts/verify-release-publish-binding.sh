#!/usr/bin/env bash
# Purpose: fail closed when a release publication step can create a release tag
# from a mutable branch that moved after the build-time provenance verification.
#
# Finding 80c49ded681c819182523b4651e6e3e4: the draft release's targetCommitish
# could still be a branch name (`main`/`premain`). Verification resolved that
# branch to the built commit, but the separate write-authorized publish job only
# re-checked `draft == true`; a branch push between verification and publication
# could then make GitHub create the tag from the newer commit while the assets
# were built from the earlier `github.sha`.
#
# Invariants enforced on every publication site (stable + existing-tag + RC):
#   A. the publish step receives the verified immutable source commit
#      (EXPECTED_SOURCE_COMMIT);
#   B. a release-publish-target-binding block is present, identical across
#      sites (parity), re-resolves the draft target and refuses drift;
#   C. the block PATCHes `target_commitish` to the verified full SHA BEFORE the
#      draft is published (`-F draft=false`).
set -euo pipefail

repo_root="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

python3 - "${repo_root}" <<'PY'
import re
import sys
from pathlib import Path

repo_root = Path(sys.argv[1])
sites = [
    (".github/workflows/release.yml", "publish-existing-tag-release"),
    (".github/workflows/release.yml", "publish-release"),
    (".github/workflows/prerelease.yml", "publish-prerelease"),
]
start_marker = "# --- release-publish-target-binding:start ---"
end_marker = "# --- release-publish-target-binding:end ---"
errors = []
blocks = {}

job_header_re = re.compile(r"^  [A-Za-z0-9_-]+:\s*$")


def job_block(text, job_id):
    lines = text.splitlines()
    start = None
    for index, line in enumerate(lines):
        if line == f"  {job_id}:":
            start = index
            break
    if start is None:
        return None
    end = len(lines)
    for index in range(start + 1, len(lines)):
        if job_header_re.match(lines[index]):
            end = index
            break
    return lines[start:end]


def binding_block(lines):
    starts = [i for i, line in enumerate(lines) if start_marker in line]
    ends = [i for i, line in enumerate(lines) if end_marker in line]
    if len(starts) != 1 or len(ends) != 1 or ends[0] < starts[0]:
        return None
    return [line.strip() for line in lines[starts[0] + 1 : ends[0]] if line.strip()]


for relative, job_id in sites:
    path = repo_root / relative
    if not path.is_file():
        errors.append(f"missing publication workflow: {relative}")
        continue
    block = job_block(path.read_text(encoding="utf-8"), job_id)
    if block is None:
        errors.append(f"{relative}: missing job {job_id!r}")
        continue
    if "EXPECTED_SOURCE_COMMIT:" not in "\n".join(block):
        errors.append(f"{relative}:{job_id}: publish step must receive EXPECTED_SOURCE_COMMIT")
    binding = binding_block(block)
    if binding is None:
        errors.append(
            f"{relative}:{job_id}: missing a single release-publish-target-binding block"
        )
        continue
    blocks[(relative, job_id)] = "\n".join(binding)
    joined = "\n".join(binding)
    if "repos/${repo}/branches/" not in joined:
        errors.append(
            f"{relative}:{job_id}: binding must re-resolve a mutable branch target before publish"
        )
    if "target_commitish=${expected_source_commit}" not in joined:
        errors.append(
            f"{relative}:{job_id}: binding must pin target_commitish to the verified full SHA"
        )
    if '-f "target_commitish=${expected_source_commit}"' not in joined:
        errors.append(
            f"{relative}:{job_id}: binding must PATCH the pinned target_commitish"
        )
    pin_index = next(
        (i for i, line in enumerate(block) if "-f \"target_commitish=${expected_source_commit}\"" in line),
        None,
    )
    publish_index = next((i for i, line in enumerate(block) if "-F draft=false" in line), None)
    if pin_index is None or publish_index is None or pin_index > publish_index:
        errors.append(
            f"{relative}:{job_id}: target must be pinned before the draft is published"
        )

distinct = set(blocks.values())
if len(blocks) == len(sites) and len(distinct) != 1:
    errors.append("release-publish-target-binding block must be identical across all publication sites")

if errors:
    print("release-publish-binding: FAIL")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print(f"release-publish-binding: PASS ({len(sites)} publication sites)")
PY
