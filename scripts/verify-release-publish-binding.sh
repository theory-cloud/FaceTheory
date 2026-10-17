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
#      draft is published (`-F draft=false`);
#   D. the final `draft=false` publish PATCH re-asserts the verified full SHA,
#      so the asset-upload window cannot repoint the release tag;
#   E. EVERY draft release PATCH re-asserts `tag_name`, so GitHub cannot
#      replace the draft's tag with its `untagged-<hex>` placeholder (the
#      2026-10-17 FACESEC45-M1 regression);
#   F. the job runs scripts/verify-published-release-tag.sh AFTER publishing,
#      with the release id exported by the publish step.
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

    patch_indexes = [i for i, line in enumerate(block) if "--method PATCH" in line]
    if not patch_indexes:
        errors.append(f"{relative}:{job_id}: missing a release publish PATCH")
    else:
        final_publish = "\n".join(block[patch_indexes[-1] :])
        if "-F draft=false" not in final_publish:
            errors.append(
                f"{relative}:{job_id}: final PATCH must publish the draft (draft=false)"
            )
        if "target_commitish=${expected_source_commit}" not in final_publish:
            errors.append(
                f"{relative}:{job_id}: final publish PATCH must re-assert the pinned target_commitish"
            )

    patch_statements = []
    index = 0
    while index < len(block):
        if "--method PATCH" not in block[index]:
            index += 1
            continue
        end = index
        while end < len(block) and ">/dev/null" not in block[end]:
            end += 1
        patch_statements.append((index, "\n".join(block[index : end + 1])))
        index = end + 1
    if not patch_statements:
        errors.append(f"{relative}:{job_id}: missing a release publish PATCH statement")
    for _, statement in patch_statements:
        if "releases/${release_id}" not in statement:
            continue
        if "tag_name=${TAG_NAME}" not in statement:
            errors.append(
                f"{relative}:{job_id}: every draft release PATCH must re-assert tag_name"
            )
            break

    post_index = next(
        (i for i, line in enumerate(block) if "scripts/verify-published-release-tag.sh" in line),
        None,
    )
    if post_index is None:
        errors.append(
            f"{relative}:{job_id}: publish step must verify the published release tag"
        )
    else:
        if publish_index is not None and post_index < publish_index:
            errors.append(
                f"{relative}:{job_id}: published release tag must be verified after the draft is published"
            )
        post_window = "\n".join(block[max(0, post_index - 8) : post_index + 1])
        if "steps.publish.outputs.release_id" not in post_window:
            errors.append(
                f"{relative}:{job_id}: published release tag check must read the publish step release id"
            )
        if 'echo "release_id=${release_id}" >> "${GITHUB_OUTPUT}"' not in "\n".join(block):
            errors.append(
                f"{relative}:{job_id}: publish step must export the release id for the tag postcondition"
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
