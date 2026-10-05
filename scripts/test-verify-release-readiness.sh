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
printf '%s\n' '# release sync test change' >> "${sync_dir}/scripts/verify-release-readiness.sh"
commit_file "${sync_dir}" "chore(release): update readiness helper" scripts/verify-release-readiness.sh
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

trap - ERR
echo "test-verify-release-readiness: PASS"
