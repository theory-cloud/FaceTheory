#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="${repo_root}/scripts/verify-release-readiness.sh"

fail() {
  echo "test-verify-release-readiness: FAIL ($*)"
  exit 1
}

setup_repo() {
  local work_dir="$1"
  git init "${work_dir}" >/dev/null 2>&1
  git -C "${work_dir}" config user.name "FaceTheory Test"
  git -C "${work_dir}" config user.email "facetheory-test@example.com"
  printf '%s\n' seed > "${work_dir}/README.md"
  git -C "${work_dir}" add README.md
  git -C "${work_dir}" -c commit.gpgSign=false commit -m "chore: seed" >/dev/null 2>&1
  git -C "${work_dir}" branch -M main
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

# Regression for a pipefail/SIGPIPE bug: the old implementation piped
# `git log` into `grep -q`; with `pipefail`, a conventional commit near the
# beginning of a long range could make grep exit before git log finished and
# incorrectly fail release readiness.
work_dir="${tmpdir}/with-fix"
setup_repo "${work_dir}"
work_script="$(copy_script "${work_dir}")"
for i in $(seq 1 180); do
  printf 'doc %s\n' "${i}" > "${work_dir}/docs-${i}.md"
  git -C "${work_dir}" add "docs-${i}.md"
  git -C "${work_dir}" -c commit.gpgSign=false commit -m "docs: filler ${i}" >/dev/null 2>&1
done
printf '%s\n' fix > "${work_dir}/fix.txt"
git -C "${work_dir}" add fix.txt
git -C "${work_dir}" -c commit.gpgSign=false commit -m "fix(release): exercise readiness scan" >/dev/null 2>&1
with_fix_out="$(cd "${work_dir}" && bash "${work_script}" base HEAD release)"
printf '%s\n' "${with_fix_out}" | grep -Fq 'release-readiness: OK' ||
  fail "range with conventional fix did not pass"

# Pure release-sync changes are allowed even without feat/fix/perf commits.
sync_dir="${tmpdir}/sync-only"
setup_repo "${sync_dir}"
sync_script="$(copy_script "${sync_dir}")"
printf '%s\n' '# release sync test change' >> "${sync_dir}/scripts/verify-release-readiness.sh"
git -C "${sync_dir}" add scripts/verify-release-readiness.sh
git -C "${sync_dir}" -c commit.gpgSign=false commit -m "chore(release): update readiness helper" >/dev/null 2>&1
sync_out="$(cd "${sync_dir}" && bash "${sync_script}" base HEAD release)"
printf '%s\n' "${sync_out}" | grep -Fq 'release-readiness: OK (release sync only change)' ||
  fail "release sync-only change did not pass"

# Non-release-sync changes without a conventional release commit still fail.
fail_dir="${tmpdir}/no-release-signal"
setup_repo "${fail_dir}"
fail_script="$(copy_script "${fail_dir}")"
printf '%s\n' note > "${fail_dir}/src.txt"
git -C "${fail_dir}" add src.txt
git -C "${fail_dir}" -c commit.gpgSign=false commit -m "docs: not releasable" >/dev/null 2>&1
if (cd "${fail_dir}" && bash "${fail_script}" base HEAD release >/tmp/readiness-fail.out 2>&1); then
  fail "non-release change without conventional release commit unexpectedly passed"
fi
grep -Fq 'release-readiness: FAIL' /tmp/readiness-fail.out ||
  fail "failure output missing release-readiness: FAIL"

echo "test-verify-release-readiness: PASS"
