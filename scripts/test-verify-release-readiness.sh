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

# Workflow files, verifier scripts, their test harnesses, and the installed
# dependency lockfile are user-facing changes: the fast path must not admit a
# range that only edits them, even with a chore commit.
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

trap - ERR
echo "test-verify-release-readiness: PASS"