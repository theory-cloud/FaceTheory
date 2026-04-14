#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="${repo_root}/scripts/verify-branch-promotion-policy.sh"

fail() {
  echo "test-verify-branch-promotion-policy: FAIL ($*)"
  exit 1
}

setup_repo() {
  local base_dir="$1"
  local remote_dir="${base_dir}/remote.git"
  local work_dir="${base_dir}/work"

  git init --bare "${remote_dir}" >/dev/null 2>&1
  git clone "${remote_dir}" "${work_dir}" >/dev/null 2>&1
  git -C "${work_dir}" config user.name "FaceTheory Test"
  git -C "${work_dir}" config user.email "facetheory-test@example.com"
  git -C "${work_dir}" checkout -b main >/dev/null 2>&1

  cat > "${work_dir}/VERSION" <<'MAIN'
0.5.5 # x-release-please-version
MAIN
  printf '%s\n' "seed" > "${work_dir}/README.md"
  git -C "${work_dir}" add VERSION README.md
  git -C "${work_dir}" commit -m "test: seed main" >/dev/null 2>&1
  git -C "${work_dir}" push -u origin main >/dev/null 2>&1

  git -C "${work_dir}" checkout -b staging >/dev/null 2>&1
  git -C "${work_dir}" push -u origin staging >/dev/null 2>&1

  git -C "${work_dir}" checkout -b premain >/dev/null 2>&1
  git -C "${work_dir}" push -u origin premain >/dev/null 2>&1

  printf '%s\n%s\n' "${remote_dir}" "${work_dir}"
}

run_check() {
  local work_dir="$1"
  local base_ref="$2"
  local head_ref="$3"
  local base_branch="$4"
  local head_branch="$5"

  (cd "${work_dir}" && REPO_ROOT="${work_dir}" bash "${script_path}" "${base_ref}" "${head_ref}" "${base_branch}" "${head_branch}")
}

expect_pass() {
  local label="$1"
  shift
  if ! "$@" >/dev/null; then
    fail "${label} should have passed"
  fi
}

expect_fail() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    fail "${label} should have failed"
  fi
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

mapfile -t repo < <(setup_repo "${tmpdir}")
remote_dir="${repo[0]}"
work_dir="${repo[1]}"

# premain only accepts staging (plus release-please exception).
expect_pass "staging->premain" run_check "${work_dir}" refs/remotes/origin/premain refs/remotes/origin/staging premain staging
expect_pass "release-please->premain exception" run_check "${work_dir}" refs/remotes/origin/premain refs/remotes/origin/premain premain release-please--branches--premain

git -C "${work_dir}" checkout -b feature/nope staging >/dev/null 2>&1
printf '%s\n' "feature" >> "${work_dir}/README.md"
git -C "${work_dir}" add README.md
git -C "${work_dir}" commit -m "fix: feature branch" >/dev/null 2>&1
git -C "${work_dir}" push -u origin feature/nope >/dev/null 2>&1
expect_fail "feature->premain" run_check "${work_dir}" refs/remotes/origin/premain refs/remotes/origin/feature/nope premain feature/nope

# main accepts premain only after the RC tag is published at the current premain head.
git -C "${work_dir}" checkout premain >/dev/null 2>&1
cat > "${work_dir}/VERSION" <<'PRE'
0.5.6-rc.1 # x-release-please-version
PRE
git -C "${work_dir}" add VERSION
git -C "${work_dir}" commit -m "fix: prepare prerelease" >/dev/null 2>&1
git -C "${work_dir}" push origin premain >/dev/null 2>&1
expect_fail "premain->main without rc tag" run_check "${work_dir}" refs/remotes/origin/main refs/remotes/origin/premain main premain

premain_sha="$(git -C "${work_dir}" rev-parse refs/remotes/origin/premain)"
git -C "${work_dir}" tag -a v0.5.6-rc.1 -m "v0.5.6-rc.1" "${premain_sha}" >/dev/null 2>&1
git -C "${work_dir}" push origin refs/tags/v0.5.6-rc.1 >/dev/null 2>&1
expect_pass "premain->main with rc tag" run_check "${work_dir}" refs/remotes/origin/main refs/remotes/origin/premain main premain

printf '%s\n' "post-rc" >> "${work_dir}/README.md"
git -C "${work_dir}" add README.md
git -C "${work_dir}" commit -m "fix: drift after rc" >/dev/null 2>&1
git -C "${work_dir}" push origin premain >/dev/null 2>&1
expect_fail "premain->main after rc drift" run_check "${work_dir}" refs/remotes/origin/main refs/remotes/origin/premain main premain

expect_pass "release-please->main exception" run_check "${work_dir}" refs/remotes/origin/main refs/remotes/origin/main main release-please--branches--main

# staging blocks additional work until current main has been back-merged.
git -C "${work_dir}" checkout main >/dev/null 2>&1
cat > "${work_dir}/VERSION" <<'MAIN2'
0.5.6 # x-release-please-version
MAIN2
git -C "${work_dir}" add VERSION
git -C "${work_dir}" commit -m "fix: stable release head" >/dev/null 2>&1
git -C "${work_dir}" push origin main >/dev/null 2>&1

git -C "${work_dir}" checkout -b feature/staging-work staging >/dev/null 2>&1
printf '%s\n' "staging work" >> "${work_dir}/README.md"
git -C "${work_dir}" add README.md
git -C "${work_dir}" commit -m "fix: staging work" >/dev/null 2>&1
git -C "${work_dir}" push -u origin feature/staging-work >/dev/null 2>&1
expect_fail "feature->staging while main ahead" run_check "${work_dir}" refs/remotes/origin/staging refs/remotes/origin/feature/staging-work staging feature/staging-work

# A conflict-resolution branch that already contains main is allowed into staging.
git -C "${work_dir}" checkout -b sync/main-into-staging staging >/dev/null 2>&1
git -C "${work_dir}" merge --no-ff origin/main -m "test: sync main into staging" >/dev/null 2>&1
git -C "${work_dir}" push -u origin sync/main-into-staging >/dev/null 2>&1
expect_pass "main-containing sync branch -> staging" run_check "${work_dir}" refs/remotes/origin/staging refs/remotes/origin/sync/main-into-staging staging sync/main-into-staging

echo "test-verify-branch-promotion-policy: PASS"
