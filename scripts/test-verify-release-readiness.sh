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

# Post-release main back-merge exemption (the staging PR lane). A release-please
# back-merge whose head ref is this repository's `main` returns released content
# into staging, so its range carries only chore commits; that must not read as a
# missing release driver. Every other shape stays subject to the plain predicate:
# a chore-only feature pull request, a lookalike head ref, and a fork's own
# branch named `main` all still fail, and the exemption only ever applies when
# the caller opts in.
run_gate() { # <work-dir> <script-path> <out-file> [args...]
  local work_dir="$1"
  local gate_script="$2"
  local out_file="$3"
  shift 3

  local status=0
  set +e
  (cd "${work_dir}" && bash "${gate_script}" "$@") >"${out_file}" 2>&1
  status=$?
  set -e
  printf '%s' "${status}"
}

backmerge_dir="${tmpdir}/back-merge"
current_case="setup post-release back-merge"
setup_repo "${backmerge_dir}"
backmerge_script="$(copy_script "${backmerge_dir}")"
commit_empty "${backmerge_dir}" "chore(main): release 4.2.0"
commit_empty "${backmerge_dir}" "chore(release): sync generated release artifacts"

current_case="post-release main back-merge is exempt"
backmerge_status="$(run_gate "${backmerge_dir}" "${backmerge_script}" "${tmpdir}/back-merge.out" \
  base HEAD staging --allow-main-backmerge --head-ref main \
  --github-head-repository theory-cloud/FaceTheory --github-repository theory-cloud/FaceTheory)"
if [[ "${backmerge_status}" != "0" ]]; then
  fail "post-release main back-merge must pass; got exit ${backmerge_status}: $(cat "${tmpdir}/back-merge.out")"
fi
assert_contains "$(cat "${tmpdir}/back-merge.out")" \
  'staging-readiness: OK (post-release main back-merge:' "post-release main back-merge verdict"

current_case="chore-only feature pull request still fails"
chore_only_status="$(run_gate "${backmerge_dir}" "${backmerge_script}" "${tmpdir}/chore-only.out" \
  base HEAD staging --allow-main-backmerge --head-ref facetheory/chore-only \
  --github-head-repository theory-cloud/FaceTheory --github-repository theory-cloud/FaceTheory)"
if [[ "${chore_only_status}" != "1" ]]; then
  fail "a chore-only feature pull request must still fail; got exit ${chore_only_status}"
fi
assert_contains "$(cat "${tmpdir}/chore-only.out")" \
  'staging-readiness: FAIL' "chore-only feature pull request failure output"

current_case="lookalike head ref still fails"
lookalike_status="$(run_gate "${backmerge_dir}" "${backmerge_script}" "${tmpdir}/lookalike.out" \
  base HEAD staging --allow-main-backmerge --head-ref main-hotfix \
  --github-head-repository theory-cloud/FaceTheory --github-repository theory-cloud/FaceTheory)"
if [[ "${lookalike_status}" != "1" ]]; then
  fail "a lookalike head ref named main-hotfix must not be exempt; got exit ${lookalike_status}"
fi
assert_contains "$(cat "${tmpdir}/lookalike.out")" \
  'staging-readiness: FAIL' "lookalike head ref failure output"

current_case="fork head ref named main still fails"
fork_status="$(run_gate "${backmerge_dir}" "${backmerge_script}" "${tmpdir}/fork.out" \
  base HEAD staging --allow-main-backmerge --head-ref main \
  --github-head-repository fork-owner/FaceTheory --github-repository theory-cloud/FaceTheory)"
if [[ "${fork_status}" != "1" ]]; then
  fail "a fork head ref named main must not be exempt; got exit ${fork_status}"
fi
assert_contains "$(cat "${tmpdir}/fork.out")" 'staging-readiness: FAIL' "fork head ref failure output"

current_case="the exemption requires its opt-in"
no_opt_in_status="$(run_gate "${backmerge_dir}" "${backmerge_script}" "${tmpdir}/no-opt-in.out" \
  base HEAD staging --head-ref main \
  --github-head-repository theory-cloud/FaceTheory --github-repository theory-cloud/FaceTheory)"
if [[ "${no_opt_in_status}" != "1" ]]; then
  fail "without --allow-main-backmerge the range must stay subject to the plain predicate; got exit ${no_opt_in_status}"
fi
assert_contains "$(cat "${tmpdir}/no-opt-in.out")" \
  'staging-readiness: FAIL' "no-opt-in failure output"

current_case="normal fix pull request still passes"
fix_pr_dir="${tmpdir}/fix-pr"
setup_repo "${fix_pr_dir}"
fix_pr_script="$(copy_script "${fix_pr_dir}")"
commit_empty "${fix_pr_dir}" "chore(docs): filler"
commit_empty "${fix_pr_dir}" "fix(runtime): repair the thing"
fix_pr_status="$(run_gate "${fix_pr_dir}" "${fix_pr_script}" "${tmpdir}/fix-pr.out" \
  base HEAD staging --allow-main-backmerge --head-ref facetheory/fix-runtime \
  --github-head-repository theory-cloud/FaceTheory --github-repository theory-cloud/FaceTheory)"
if [[ "${fix_pr_status}" != "0" ]]; then
  fail "a normal fix pull request must pass; got exit ${fix_pr_status}: $(cat "${tmpdir}/fix-pr.out")"
fi
assert_contains "$(cat "${tmpdir}/fix-pr.out")" 'staging-readiness: OK' "normal fix pull request verdict"
if [[ "$(cat "${tmpdir}/fix-pr.out")" == *"post-release main back-merge"* ]]; then
  fail "a normal fix pull request must not report the post-release main back-merge exemption"
fi

trap - ERR
echo "test-verify-release-readiness: PASS"
