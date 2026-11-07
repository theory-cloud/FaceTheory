#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="${repo_root}/scripts/verify-release-readiness.sh"
current_case="startup"

fail() {
  echo "test-verify-release-readiness: FAIL ($*)"
  exit 1
}

trap 'fail "${current_case}: command failed at line ${LINENO}: ${BASH_COMMAND}"' ERR

commit_file() {
  local work_dir="$1"
  local message="$2"
  shift 2

  git -C "${work_dir}" add "$@"
  git -C "${work_dir}" \
    -c commit.gpgSign=false \
    -c tag.gpgSign=false \
    -c core.hooksPath=/dev/null \
    commit -m "${message}" >/dev/null
}

commit_empty() {
  local work_dir="$1"
  local message="$2"

  git -C "${work_dir}" \
    -c commit.gpgSign=false \
    -c tag.gpgSign=false \
    -c core.hooksPath=/dev/null \
    commit --allow-empty -m "${message}" >/dev/null
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local label="$3"

  if [[ "${haystack}" != *"${needle}"* ]]; then
    fail "${label} missing ${needle}; output was: ${haystack}"
  fi
}

assert_source_avoids_git_log_grep_pipe() {
  local implementation

  implementation="$(tr '\n' ' ' < "${script_path}")"
  if [[ "${implementation}" =~ git[[:space:]]+log.*\|.*grep ]]; then
    fail "verify-release-readiness must not pipe git log into grep; that reintroduces the pipefail/SIGPIPE regression"
  fi
  assert_contains "${implementation}" 'mapfile -t commit_subjects' "implementation source"
}

setup_repo() {
  local work_dir="$1"
  git init -b main "${work_dir}" >/dev/null
  git -C "${work_dir}" config user.name "FaceTheory Test"
  git -C "${work_dir}" config user.email "facetheory-test@example.com"
  printf '%s\n' seed > "${work_dir}/README.md"
  commit_file "${work_dir}" "chore: seed" README.md
  git -C "${work_dir}" branch base
}

copy_script() {
  local work_dir="$1"
  mkdir -p "${work_dir}/scripts"
  cp "${script_path}" "${work_dir}/scripts/verify-release-readiness.sh"
  chmod +x "${work_dir}/scripts/verify-release-readiness.sh"
  printf '%s\n' "${work_dir}/scripts/verify-release-readiness.sh"
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

current_case="source regression guard"
assert_source_avoids_git_log_grep_pipe

# Regression for a pipefail/SIGPIPE bug: the old implementation piped
# `git log` into `grep -q`; with `pipefail`, a conventional commit near the
# beginning of a long range could make grep exit before git log finished and
# incorrectly fail release readiness. The source guard above prevents that
# exact pipe shape from returning; this temp repo only verifies that the
# mapfile-based scanner still accepts conventional release commits.
work_dir="${tmpdir}/with-fix"
current_case="setup with conventional fix"
setup_repo "${work_dir}"
work_script="$(copy_script "${work_dir}")"
for i in $(seq 1 3); do
  commit_empty "${work_dir}" "docs: filler ${i}"
done
commit_empty "${work_dir}" "fix(release): exercise readiness scan"
current_case="range with conventional fix"
with_fix_out="$(cd "${work_dir}" && bash "${work_script}" base HEAD release)"
assert_contains "${with_fix_out}" 'release-readiness: OK' "range with conventional fix"

# Pure release-sync changes are allowed even without feat/fix/perf commits.
sync_dir="${tmpdir}/sync-only"
current_case="setup release sync-only"
setup_repo "${sync_dir}"
sync_script="$(copy_script "${sync_dir}")"
printf '%s\n' '4.2.1' > "${sync_dir}/VERSION"
commit_file "${sync_dir}" "chore(release): update release metadata" VERSION
current_case="release sync-only"
sync_out="$(cd "${sync_dir}" && bash "${sync_script}" base HEAD release)"
assert_contains "${sync_out}" 'release-readiness: OK (release sync only change)' "release sync-only"

# The post-release main -> staging back-merge carries release-please's
# CHANGELOG.prerelease.md alongside the other sync files; that range has no
# feat/fix/perf commit, so it must clear the allowlist just like CHANGELOG.md.
prerelease_dir="${tmpdir}/sync-only-prerelease"
current_case="setup release sync-only with prerelease changelog"
setup_repo "${prerelease_dir}"
prerelease_script="$(copy_script "${prerelease_dir}")"
mkdir -p "${prerelease_dir}/docs" "${prerelease_dir}/ts"
printf '%s\n' '4.2.1' > "${prerelease_dir}/VERSION"
printf '%s\n' '# 4.2.1-rc prerelease notes' >> "${prerelease_dir}/CHANGELOG.prerelease.md"
printf '%s\n' '# 4.2.1' >> "${prerelease_dir}/CHANGELOG.md"
printf '%s\n' '# release sync test change' >> "${prerelease_dir}/README.md"
printf '%s\n' '# docs release sync' >> "${prerelease_dir}/docs/README.md"
printf '%s\n' '{"version":"4.2.1"}' > "${prerelease_dir}/ts/package.json"
commit_file "${prerelease_dir}" "chore(release): sync release metadata files" \
  VERSION CHANGELOG.prerelease.md CHANGELOG.md README.md docs/README.md ts/package.json
current_case="release sync-only with prerelease changelog"
prerelease_out="$(cd "${prerelease_dir}" && bash "${prerelease_script}" base HEAD release)"
assert_contains "${prerelease_out}" 'release-readiness: OK (release sync only change)' "release sync-only with prerelease changelog"

# The same sync range plus one non-allowlisted path must still fail: adding
# CHANGELOG.prerelease.md must not open a hole in the gate.
prerelease_drift_dir="${tmpdir}/sync-only-prerelease-drift"
current_case="setup release sync-only with non-allowlisted drift"
setup_repo "${prerelease_drift_dir}"
prerelease_drift_script="$(copy_script "${prerelease_drift_dir}")"
mkdir -p "${prerelease_drift_dir}/docs" "${prerelease_drift_dir}/ts/src"
printf '%s\n' '4.2.1' > "${prerelease_drift_dir}/VERSION"
printf '%s\n' '# 4.2.1-rc prerelease notes' >> "${prerelease_drift_dir}/CHANGELOG.prerelease.md"
printf '%s\n' '# 4.2.1' >> "${prerelease_drift_dir}/CHANGELOG.md"
printf '%s\n' '# release sync test change' >> "${prerelease_drift_dir}/README.md"
printf '%s\n' '# docs release sync' >> "${prerelease_drift_dir}/docs/README.md"
printf '%s\n' '{"version":"4.2.1"}' > "${prerelease_drift_dir}/ts/package.json"
printf '%s\n' 'export const x = 1;' > "${prerelease_drift_dir}/ts/src/x.ts"
commit_file "${prerelease_drift_dir}" "chore(release): sync release metadata with drift" \
  VERSION CHANGELOG.prerelease.md CHANGELOG.md README.md docs/README.md ts/package.json ts/src/x.ts
prerelease_drift_out="${tmpdir}/readiness-prerelease-drift.out"
current_case="release sync-only with non-allowlisted drift fails"
if (cd "${prerelease_drift_dir}" && bash "${prerelease_drift_script}" base HEAD release >"${prerelease_drift_out}" 2>&1); then
  fail "sync range with a non-allowlisted path unexpectedly passed"
fi
assert_contains "$(cat "${prerelease_drift_out}")" 'release-readiness: FAIL' "release sync-only with non-allowlisted drift"

# Non-release-sync changes without a conventional release commit still fail.
fail_dir="${tmpdir}/no-release-signal"
current_case="setup failing release signal"
setup_repo "${fail_dir}"
fail_script="$(copy_script "${fail_dir}")"
printf '%s\n' note > "${fail_dir}/src.txt"
commit_file "${fail_dir}" "docs: not releasable" src.txt
fail_out="${tmpdir}/readiness-fail.out"
current_case="non-release signal fails"
if (cd "${fail_dir}" && bash "${fail_script}" base HEAD release >"${fail_out}" 2>&1); then
  fail "non-release change without conventional release commit unexpectedly passed"
fi
assert_contains "$(cat "${fail_out}")" 'release-readiness: FAIL' "non-release signal failure output"

# Row 29: the changed-file query must account for deletions and both endpoints
# of a rename, not only the allowlisted destination.

commit_staged() {
  local work_dir="$1"
  local message="$2"
  git -C "${work_dir}" \
    -c commit.gpgSign=false \
    -c tag.gpgSign=false \
    -c core.hooksPath=/dev/null \
    commit -m "${message}" >/dev/null
}

seed_release_repo() {
  local work_dir="$1"
  git init -b main "${work_dir}" >/dev/null
  git -C "${work_dir}" config user.name "FaceTheory Test"
  git -C "${work_dir}" config user.email "facetheory-test@example.com"
  printf '%s\n' seed > "${work_dir}/README.md"
  mkdir -p "${work_dir}/ts/src"
  printf '%s\n' 'export const x = 1;' > "${work_dir}/ts/src/user.ts"
  commit_file "${work_dir}" "chore: seed" README.md ts/src/user.ts
  git -C "${work_dir}" branch base
}

# Deleting a non-allowlisted path alongside an allowlisted change: the range is
# release-sync shaped, but the deleted user-facing path must fail it.
delete_dir="${tmpdir}/deletion-drift"
current_case="setup deletion of a non-allowlisted path"
seed_release_repo "${delete_dir}"
delete_script="$(copy_script "${delete_dir}")"
printf '%s\n' '# release sync change' >> "${delete_dir}/scripts/verify-release-readiness.sh"
git -C "${delete_dir}" rm -q ts/src/user.ts
git -C "${delete_dir}" add scripts/verify-release-readiness.sh
commit_staged "${delete_dir}" "chore(release): sync and delete user source"
delete_out="${tmpdir}/readiness-deletion.out"
current_case="deletion of a non-allowlisted path fails"
if (cd "${delete_dir}" && bash "${delete_script}" base HEAD release >"${delete_out}" 2>&1); then
  fail "a deleted non-allowlisted path unexpectedly passed release readiness"
fi
assert_contains "$(cat "${delete_out}")" 'release-readiness: FAIL' "deletion of non-allowlisted path"

# Renaming a non-allowlisted path into an allowlisted location must fail on the
# source endpoint even though the destination is allowlisted.
rename_dir="${tmpdir}/rename-drift"
current_case="setup rename out of a non-allowlisted path"
seed_release_repo "${rename_dir}"
rename_script="$(copy_script "${rename_dir}")"
git -C "${rename_dir}" mv ts/src/user.ts scripts/read-version.sh
commit_staged "${rename_dir}" "chore(release): rename user source into release helper"
rename_out="${tmpdir}/readiness-rename.out"
current_case="rename out of a non-allowlisted path fails"
if (cd "${rename_dir}" && bash "${rename_script}" base HEAD release >"${rename_out}" 2>&1); then
  fail "a rename out of a non-allowlisted path unexpectedly passed release readiness"
fi
assert_contains "$(cat "${rename_out}")" 'release-readiness: FAIL' "rename out of non-allowlisted path"

# Ordinary controls: a rename wholly inside the allowlist and a deletion of an
# allowlisted path are release-sync changes.
allow_rename_dir="${tmpdir}/rename-allowed"
current_case="setup rename wholly inside the allowlist"
git init -b main "${allow_rename_dir}" >/dev/null
git -C "${allow_rename_dir}" config user.name "FaceTheory Test"
git -C "${allow_rename_dir}" config user.email "facetheory-test@example.com"
printf '%s\n' seed > "${allow_rename_dir}/README.md"
mkdir -p "${allow_rename_dir}/scripts"
printf '%s\n' placeholder > "${allow_rename_dir}/scripts/read-version.sh"
commit_file "${allow_rename_dir}" "chore: seed" README.md scripts/read-version.sh
git -C "${allow_rename_dir}" branch base
allow_rename_script="$(copy_script "${allow_rename_dir}")"
git -C "${allow_rename_dir}" mv scripts/read-version.sh scripts/render-release-notes.sh
commit_staged "${allow_rename_dir}" "chore(release): rename release helper"
current_case="rename wholly inside the allowlist passes"
allow_rename_text="$(cd "${allow_rename_dir}" && bash "${allow_rename_script}" base HEAD release)"
assert_contains "${allow_rename_text}" 'release-readiness: OK (release sync only change)' "rename inside allowlist"

# Workflow files and verifier scripts (including their test harnesses) are
# user-facing changes: the fast path must not admit a range that only edits
# them, even with a chore commit. The lockfile control below puts non-lockfile
# content at the lockfile path, so it exercises the content inspection rather
# than the path allowlist.
assert_fast_path_rejects() {
  local label="$1"
  local relative_path="$2"

  local reject_dir="${tmpdir}/reject-${label// /-}"
  current_case="setup rejected fast path ${label}"
  setup_repo "${reject_dir}"
  local reject_script
  reject_script="$(copy_script "${reject_dir}")"
  mkdir -p "$(dirname "${reject_dir}/${relative_path}")"
  printf '%s\n' 'changed outside the fast path' >"${reject_dir}/${relative_path}"
  commit_file "${reject_dir}" "chore(release): touch ${relative_path}" "${relative_path}"
  local reject_out="${tmpdir}/readiness-reject-${label// /-}.out"
  current_case="rejected fast path ${label}"
  if (cd "${reject_dir}" && bash "${reject_script}" base HEAD release >"${reject_out}" 2>&1); then
    fail "a release-sync range that only changes ${relative_path} unexpectedly passed"
  fi
  assert_contains "$(cat "${reject_out}")" 'release-readiness: FAIL' "rejected fast path ${label}"
}

assert_fast_path_rejects "workflow" ".github/workflows/ci.yml"
assert_fast_path_rejects "verifier" "scripts/verify-release-train-promotion.sh"
assert_fast_path_rejects "verifier-test" "scripts/test-verify-release-readiness.sh"
assert_fast_path_rejects "lockfile" "ts/package-lock.json"

# The remaining release metadata and helper paths still clear the fast path.
remaining_dir="${tmpdir}/remaining-allowlist"
current_case="setup remaining fast path"
setup_repo "${remaining_dir}"
remaining_script="$(copy_script "${remaining_dir}")"
mkdir -p "${remaining_dir}/scripts" "${remaining_dir}/ts"
printf '%s\n' '4.2.1' > "${remaining_dir}/VERSION"
printf '%s\n' '# 4.2.1' > "${remaining_dir}/CHANGELOG.md"
printf '%s\n' 'helper' > "${remaining_dir}/scripts/read-version.sh"
printf '%s\n' '{"version":"4.2.1"}' > "${remaining_dir}/ts/package.json"
commit_file "${remaining_dir}" "chore(release): sync remaining release metadata" \
  VERSION CHANGELOG.md scripts/read-version.sh ts/package.json
current_case="remaining fast path"
remaining_out="$(cd "${remaining_dir}" && bash "${remaining_script}" base HEAD release)"
assert_contains "${remaining_out}" 'release-readiness: OK (release sync only change)' "remaining fast path"

delete_allowed_dir="${tmpdir}/deletion-allowed"
current_case="setup deletion of an allowlisted path"
git init -b main "${delete_allowed_dir}" >/dev/null
git -C "${delete_allowed_dir}" config user.name "FaceTheory Test"
git -C "${delete_allowed_dir}" config user.email "facetheory-test@example.com"
printf '%s\n' seed > "${delete_allowed_dir}/README.md"
mkdir -p "${delete_allowed_dir}/docs"
printf '%s\n' '# docs' > "${delete_allowed_dir}/docs/README.md"
commit_file "${delete_allowed_dir}" "chore: seed" README.md docs/README.md
git -C "${delete_allowed_dir}" branch base
delete_allowed_script="$(copy_script "${delete_allowed_dir}")"
git -C "${delete_allowed_dir}" rm -q docs/README.md
commit_staged "${delete_allowed_dir}" "chore(release): drop docs readme"
current_case="deletion of an allowlisted path passes"
delete_allowed_text="$(cd "${delete_allowed_dir}" && bash "${delete_allowed_script}" base HEAD release)"
assert_contains "${delete_allowed_text}" 'release-readiness: OK (release sync only change)' "deletion of allowlisted path"

# The installed dependency lockfile is admitted on its two npm project version
# fields alone. Release Please rewrites exactly those fields on every release,
# so a release PR would otherwise be blocked by the gate that exists to keep
# dependency-resolution diffs out of a chore-only range.
write_lockfile_variant() {
  local path="$1"
  local variant="$2"

  LOCK_VARIANT="${variant}" python3 - "${path}" <<'PY'
import json
import os
import sys

VARIANT = os.environ["LOCK_VARIANT"]
PATH = sys.argv[1]
BASE_VERSION = "5.0.1-rc"
NEXT_VERSION = "5.0.1"


def base_document():
    return {
        "name": "@theory-cloud/facetheory",
        "version": BASE_VERSION,
        "lockfileVersion": 3,
        "requires": True,
        "packages": {
            "": {
                "name": "@theory-cloud/facetheory",
                "version": BASE_VERSION,
                "license": "Apache-2.0",
                "dependencies": {"left-pad": "^1.0.0"},
            },
            "node_modules/left-pad": {
                "version": "1.3.0",
                "resolved": "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz",
                "integrity": "sha512-XI5MPzVNAhjAyhQzphX8BkmKsKUxD4LdyK24iZeQGinBN9yTQT3bFlCBy/aVx2HrNcqQGsdot8ghrjyrvMCoEA==",
                "license": "WTFPL",
            },
        },
    }


def write(document, indent=2):
    with open(PATH, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(document, indent=indent, ensure_ascii=False) + "\n")


def bump(document, indent=2):
    document["version"] = NEXT_VERSION
    document["packages"][""]["version"] = NEXT_VERSION
    write(document, indent)


if VARIANT == "base":
    write(base_document())
    raise SystemExit(0)

if VARIANT == "deleted":
    os.remove(PATH)
    raise SystemExit(0)

if VARIANT == "renamed":
    os.replace(PATH, os.path.join(os.path.dirname(PATH), "package-lock.bak"))
    raise SystemExit(0)

if VARIANT == "mode-only":
    os.chmod(PATH, 0o755)
    raise SystemExit(0)

if VARIANT == "binary":
    with open(PATH, "wb") as handle:
        handle.write(b"\x00\x01\x02 binary lockfile\n")
    raise SystemExit(0)

if VARIANT == "truncated-json":
    with open(PATH, "w", encoding="utf-8") as handle:
        handle.write('{\n  "version": "5.0.1",\n')
    raise SystemExit(0)

with open(PATH, encoding="utf-8") as handle:
    document = json.load(handle)

project = document["packages"][""]
left_pad = document["packages"]["node_modules/left-pad"]

if VARIANT == "version-bump":
    bump(document)
elif VARIANT == "version-bump-reformat":
    bump(document, indent=4)
elif VARIANT == "version-bump-unicode":
    document["version"] = "5.0.1\u200b"
    project["version"] = "5.0.1\u200b"
    write(document)
elif VARIANT == "version-bump-duplicate-key":
    text = json.dumps(document, indent=2) + "\n"
    text = text.replace(
        '  "version": "5.0.1-rc",\n',
        '  "version": "5.0.1",\n  "version": "5.0.1-rc",\n',
        1,
    )
    with open(PATH, "w", encoding="utf-8") as handle:
        handle.write(text)
elif VARIANT == "nested-version":
    left_pad["version"] = "1.3.1"
    bump(document)
elif VARIANT == "nested-integrity":
    left_pad["integrity"] = "sha512-boundary-marker"
    bump(document)
elif VARIANT == "nested-resolved":
    left_pad["resolved"] = "https://registry.npmjs.org/left-pad/-/left-pad-1.3.1.tgz"
    bump(document)
elif VARIANT == "root-dependency":
    project["dependencies"] = {"left-pad": "^1.1.0"}
    bump(document)
elif VARIANT == "root-license":
    project["license"] = "MIT"
    bump(document)
elif VARIANT == "added-package":
    document["packages"]["node_modules/right-pad"] = {
        "version": "1.0.1",
        "resolved": "https://registry.npmjs.org/right-pad/-/right-pad-1.0.1.tgz",
        "integrity": "sha512-right-pad",
    }
    bump(document)
elif VARIANT == "removed-package":
    del document["packages"]["node_modules/left-pad"]
    bump(document)
elif VARIANT == "root-only-version":
    document["version"] = NEXT_VERSION
    write(document)
elif VARIANT == "manifest-only-version":
    project["version"] = NEXT_VERSION
    write(document)
elif VARIANT == "extra-root-key":
    document["sideEffects"] = False
    bump(document)
else:
    raise SystemExit("unknown lockfile variant: {0}".format(VARIANT))
PY
}

seed_lockfile_repo() {
  local work_dir="$1"

  git init -b main "${work_dir}" >/dev/null
  git -C "${work_dir}" config user.name "FaceTheory Test"
  git -C "${work_dir}" config user.email "facetheory-test@example.com"
  git -C "${work_dir}" config core.fileMode true
  printf '%s\n' seed > "${work_dir}/README.md"
  mkdir -p "${work_dir}/ts"
  write_lockfile_variant "${work_dir}/ts/package-lock.json" base
  commit_file "${work_dir}" "chore: seed release lockfile" README.md ts/package-lock.json
  git -C "${work_dir}" branch base
}

commit_everything() {
  local work_dir="$1"
  local message="$2"

  git -C "${work_dir}" add -A -- . ':(exclude)scripts/verify-release-readiness.sh'
  commit_staged "${work_dir}" "${message}"
}

assert_lockfile_case() {
  local label="$1"
  local variant="$2"
  local expectation="$3"
  local reason="$4"
  local also_touch="${5:-}"

  local case_dir="${tmpdir}/lockfile-${label}"
  current_case="setup lockfile case ${label}"
  seed_lockfile_repo "${case_dir}"
  local case_script
  case_script="$(copy_script "${case_dir}")"
  write_lockfile_variant "${case_dir}/ts/package-lock.json" "${variant}"
  if [[ -n "${also_touch}" ]]; then
    mkdir -p "$(dirname "${case_dir}/${also_touch}")"
    printf '%s\n' '# release notes' >> "${case_dir}/${also_touch}"
  fi
  commit_everything "${case_dir}" "chore(release): exercise lockfile variant ${label}"

  local case_out="${tmpdir}/readiness-lockfile-${label}.out"
  current_case="lockfile case ${label}"
  if (cd "${case_dir}" && bash "${case_script}" base HEAD release >"${case_out}" 2>&1); then
    if [[ "${expectation}" != "pass" ]]; then
      fail "lockfile case ${label} unexpectedly passed the fast path; output: $(cat "${case_out}")"
    fi
    assert_contains "$(cat "${case_out}")" 'release-readiness: OK (release sync only change)' "lockfile case ${label}"
  else
    if [[ "${expectation}" != "fail" ]]; then
      fail "lockfile case ${label} unexpectedly failed the fast path; output: $(cat "${case_out}")"
    fi
    assert_contains "$(cat "${case_out}")" 'release-readiness: FAIL' "lockfile case ${label}"
    assert_contains "$(cat "${case_out}")" "ts/package-lock.json (" "lockfile case ${label} disqualifier"
    assert_contains "$(cat "${case_out}")" "${reason}" "lockfile case ${label} reason"
  fi
}

# Release-shaped version bump: the fast path must admit it.
assert_lockfile_case "version-bump" version-bump pass ""

# A version bump riding alongside an allowlisted docs change still passes.
assert_lockfile_case "version-bump-with-docs" version-bump pass "" "docs/README.md"

# Any lockfile content beyond the two version fields disqualifies the range.
assert_lockfile_case "nested-version" nested-version fail 'packages["node_modules/left-pad"].version value differs'
assert_lockfile_case "nested-integrity" nested-integrity fail 'packages["node_modules/left-pad"].integrity value differs'
assert_lockfile_case "nested-resolved" nested-resolved fail 'packages["node_modules/left-pad"].resolved value differs'
assert_lockfile_case "root-dependency" root-dependency fail 'packages[""].dependencies["left-pad"] value differs'
assert_lockfile_case "root-license" root-license fail 'packages[""].license value differs'
assert_lockfile_case "added-package" added-package fail "packages object keys differ"
assert_lockfile_case "removed-package" removed-package fail "packages object keys differ"
assert_lockfile_case "extra-root-key" extra-root-key fail "<root> object keys differ"
assert_lockfile_case "root-only-version" root-only-version fail 'disagree'
assert_lockfile_case "manifest-only-version" manifest-only-version fail 'disagree'

# Content and encoding tricks that a textual or line-count check could miss.
assert_lockfile_case "version-bump-unicode" version-bump-unicode fail "is not a plain version string"
assert_lockfile_case "version-bump-reformat" version-bump-reformat fail "is not the canonical JSON form"
assert_lockfile_case "version-bump-duplicate-key" version-bump-duplicate-key fail "repeats the object key"
assert_lockfile_case "binary" binary fail "is not valid JSON"
assert_lockfile_case "truncated-json" truncated-json fail "is not valid JSON"

# Rename, deletion, and mode edge cases stay excluded.
assert_lockfile_case "deleted" deleted fail "is added or deleted"
assert_lockfile_case "renamed" renamed fail "is added or deleted"
assert_lockfile_case "mode-only" mode-only fail "file mode changed"

# Keep the gate fail-closed when the range has no comparable history.
current_case="lockfile case unrelated history"
no_base_dir="${tmpdir}/lockfile-no-merge-base"
seed_lockfile_repo "${no_base_dir}"
no_base_script="$(copy_script "${no_base_dir}")"
write_lockfile_variant "${no_base_dir}/ts/package-lock.json" version-bump
commit_everything "${no_base_dir}" "chore(release): bump lockfile version"
git -C "${no_base_dir}" checkout -q --orphan unrelated
git -C "${no_base_dir}" -c commit.gpgSign=false -c core.hooksPath=/dev/null \
  commit -q -m "chore: unrelated root" --allow-empty
no_base_out="${tmpdir}/readiness-lockfile-no-merge-base.out"
current_case="lockfile case unrelated history"
if (cd "${no_base_dir}" && bash "${no_base_script}" base HEAD release >"${no_base_out}" 2>&1); then
  fail "a lockfile range with unrelated history unexpectedly passed"
fi
assert_contains "$(cat "${no_base_out}")" 'release-readiness: FAIL' "lockfile case unrelated history"

# A prerelease promotion into an in-flight release is a follow-up, not the
# release itself: the RC pull request already open against `premain` carries the
# user-facing commits, and the promotion adds the test, CI, or gate repair that
# RC needs. In that context only, a range with no feat:/fix:/perf: subject of its
# own clears the gate when the newest stable release tag reachable from the base
# still has user-facing commits between it and the base. Every other context and
# every base without such a tag keeps the strict failure.

seed_release_tag_repo() {
  local work_dir="$1"
  local tag_name="$2"

  git init -b main "${work_dir}" >/dev/null
  git -C "${work_dir}" config user.name "FaceTheory Test"
  git -C "${work_dir}" config user.email "facetheory-test@example.com"
  printf '%s\n' seed > "${work_dir}/README.md"
  commit_file "${work_dir}" "chore: seed" README.md
  if [[ -n "${tag_name}" ]]; then
    git -C "${work_dir}" -c tag.gpgSign=false tag "${tag_name}"
  fi
}

add_follow_up_commit() {
  local work_dir="$1"

  mkdir -p "${work_dir}/ts/test/unit"
  printf '%s\n' 'export const followUp = true;' > "${work_dir}/ts/test/unit/follow-up.ts"
  commit_file "${work_dir}" "test(ts): follow up the pending release" ts/test/unit/follow-up.ts
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  local label="$3"

  if [[ "${haystack}" == *"${needle}"* ]]; then
    fail "${label} unexpectedly contains ${needle}; output was: ${haystack}"
  fi
}

# A test-only promotion on top of a base that already carries user-facing
# commits since the last stable tag passes, and the listing names both the tag
# and every commit it counted.
follow_up_dir="${tmpdir}/prerelease-follow-up"
current_case="setup prerelease follow-up to a pending release"
seed_release_tag_repo "${follow_up_dir}" v4.0.0
commit_empty "${follow_up_dir}" "feat(ts): queue the pending release content"
commit_empty "${follow_up_dir}" "fix(isr): queue the pending release repair"
git -C "${follow_up_dir}" branch pending
add_follow_up_commit "${follow_up_dir}"
follow_up_script="$(copy_script "${follow_up_dir}")"
current_case="prerelease follow-up to a pending release passes"
follow_up_out="$(cd "${follow_up_dir}" && bash "${follow_up_script}" pending HEAD prerelease)"
assert_contains "${follow_up_out}" \
  'prerelease-readiness: OK (follow-up to the pending release since v4.0.0: 2 user-facing commits already on pending)' \
  "prerelease follow-up"
assert_contains "${follow_up_out}" 'feat(ts): queue the pending release content' "prerelease follow-up listing"
assert_contains "${follow_up_out}" 'fix(isr): queue the pending release repair' "prerelease follow-up listing"

# A range that carries its own release commit still takes the ordinary fast
# path; the follow-up rule must not pre-empt it.
self_signal_dir="${tmpdir}/prerelease-self-signal"
current_case="setup prerelease range with its own release commit"
seed_release_tag_repo "${self_signal_dir}" v4.0.0
commit_empty "${self_signal_dir}" "feat(ts): queue the pending release content"
git -C "${self_signal_dir}" branch pending
add_follow_up_commit "${self_signal_dir}"
commit_empty "${self_signal_dir}" "feat(release): carry the promotion change itself"
self_signal_script="$(copy_script "${self_signal_dir}")"
current_case="prerelease range with its own release commit keeps the plain OK"
self_signal_out="$(cd "${self_signal_dir}" && bash "${self_signal_script}" pending HEAD prerelease)"
assert_contains "${self_signal_out}" 'prerelease-readiness: OK' "prerelease self signal"
assert_not_contains "${self_signal_out}" 'follow-up to the pending release' "prerelease self signal"

# A base exactly at the stable tag has nothing pending: the follow-up rule
# cannot apply, and the failure text stays byte-identical to today's.
at_tag_dir="${tmpdir}/prerelease-at-tag"
current_case="setup prerelease base at the stable tag"
seed_release_tag_repo "${at_tag_dir}" v4.0.0
git -C "${at_tag_dir}" branch stable
add_follow_up_commit "${at_tag_dir}"
at_tag_script="$(copy_script "${at_tag_dir}")"
at_tag_out="${tmpdir}/readiness-prerelease-at-tag.out"
current_case="prerelease base at the stable tag fails"
if (cd "${at_tag_dir}" && bash "${at_tag_script}" stable HEAD prerelease >"${at_tag_out}" 2>&1); then
  fail "a prerelease range with nothing pending since the stable tag unexpectedly passed"
fi
assert_contains "$(cat "${at_tag_out}")" 'prerelease-readiness: FAIL' "prerelease base at stable tag"
assert_contains "$(cat "${at_tag_out}")" \
  'No user-facing conventional commits (feat:/fix:/perf:) found in stable..HEAD.' \
  "prerelease base at stable tag"
assert_contains "$(cat "${at_tag_out}")" \
  'release-please will skip, so no new release PR will be cut.' \
  "prerelease base at stable tag"

# A base that advanced past the tag with bookkeeping commits only is likewise
# not a pending release.
quiet_dir="${tmpdir}/prerelease-quiet-base"
current_case="setup prerelease base with no user-facing commit since the tag"
seed_release_tag_repo "${quiet_dir}" v4.0.0
commit_empty "${quiet_dir}" "chore(deps): absorb a Dependabot bump"
git -C "${quiet_dir}" branch pending
add_follow_up_commit "${quiet_dir}"
quiet_script="$(copy_script "${quiet_dir}")"
quiet_out="${tmpdir}/readiness-prerelease-quiet-base.out"
current_case="prerelease base with no user-facing commit since the tag fails"
if (cd "${quiet_dir}" && bash "${quiet_script}" pending HEAD prerelease >"${quiet_out}" 2>&1); then
  fail "a prerelease range over a bookkeeping-only base unexpectedly passed"
fi
assert_contains "$(cat "${quiet_out}")" 'prerelease-readiness: FAIL' "prerelease quiet base"

# Prerelease tags do not count as stable releases, and a repository with no tag
# at all has no pending release to follow up.
rc_tag_dir="${tmpdir}/prerelease-rc-tag-only"
current_case="setup prerelease with only an rc tag"
seed_release_tag_repo "${rc_tag_dir}" v4.1.0-rc
commit_empty "${rc_tag_dir}" "feat(ts): queue the pending release content"
git -C "${rc_tag_dir}" branch pending
add_follow_up_commit "${rc_tag_dir}"
rc_tag_script="$(copy_script "${rc_tag_dir}")"
rc_tag_out="${tmpdir}/readiness-prerelease-rc-tag.out"
current_case="prerelease with only an rc tag fails"
if (cd "${rc_tag_dir}" && bash "${rc_tag_script}" pending HEAD prerelease >"${rc_tag_out}" 2>&1); then
  fail "a prerelease range with only an rc tag unexpectedly passed"
fi
assert_contains "$(cat "${rc_tag_out}")" 'prerelease-readiness: FAIL' "prerelease rc tag only"

untagged_dir="${tmpdir}/prerelease-untagged"
current_case="setup prerelease with no tag"
seed_release_tag_repo "${untagged_dir}" ""
commit_empty "${untagged_dir}" "feat(ts): queue the pending release content"
git -C "${untagged_dir}" branch pending
add_follow_up_commit "${untagged_dir}"
untagged_script="$(copy_script "${untagged_dir}")"
untagged_out="${tmpdir}/readiness-prerelease-untagged.out"
current_case="prerelease with no tag fails"
if (cd "${untagged_dir}" && bash "${untagged_script}" pending HEAD prerelease >"${untagged_out}" 2>&1); then
  fail "a prerelease range with no tag unexpectedly passed"
fi
assert_contains "$(cat "${untagged_out}")" 'prerelease-readiness: FAIL' "prerelease untagged"

# The same test-only range over the same pending base still fails the release
# and staging contexts: the follow-up rule is prerelease-only.
release_context_out="${tmpdir}/readiness-followup-release.out"
current_case="release context ignores the prerelease follow-up rule"
if (cd "${follow_up_dir}" && bash "${follow_up_script}" pending HEAD release >"${release_context_out}" 2>&1); then
  fail "a test-only range passed the release context through the prerelease follow-up rule"
fi
assert_contains "$(cat "${release_context_out}")" 'release-readiness: FAIL' "release context follow-up"
assert_contains "$(cat "${release_context_out}")" \
  'No user-facing conventional commits (feat:/fix:/perf:) found in pending..HEAD.' \
  "release context follow-up"

staging_context_out="${tmpdir}/readiness-followup-staging.out"
current_case="staging context ignores the prerelease follow-up rule"
if (cd "${follow_up_dir}" && bash "${follow_up_script}" pending HEAD staging >"${staging_context_out}" 2>&1); then
  fail "a test-only range passed the staging context through the prerelease follow-up rule"
fi
assert_contains "$(cat "${staging_context_out}")" 'staging-readiness: FAIL' "staging context follow-up"

# An empty range carries nothing to promote, so a pending base must not turn it
# into a pass; the follow-up rule needs at least one commit of its own.
empty_range_out="${tmpdir}/readiness-followup-empty-range.out"
current_case="prerelease empty range is not a follow-up"
if (cd "${follow_up_dir}" && bash "${follow_up_script}" pending pending prerelease >"${empty_range_out}" 2>&1); then
  fail "an empty prerelease range passed through the prerelease follow-up rule"
fi
assert_contains "$(cat "${empty_range_out}")" 'prerelease-readiness: FAIL' "prerelease empty range"

trap - ERR
echo "test-verify-release-readiness: PASS"