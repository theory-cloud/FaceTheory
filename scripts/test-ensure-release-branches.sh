#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="${repo_root}/scripts/ensure-release-branches.sh"

fail() {
  echo "test-ensure-release-branches: FAIL ($*)"
  exit 1
}

setup_repo() {
  local label="$1"
  local base_dir="$2"
  local remote_dir="${base_dir}/${label}-remote.git"
  local work_dir="${base_dir}/${label}-work"

  git init --bare "${remote_dir}" >/dev/null 2>&1
  git clone "${remote_dir}" "${work_dir}" >/dev/null 2>&1
  git -C "${work_dir}" config user.name "FaceTheory Test"
  git -C "${work_dir}" config user.email "facetheory-test@example.com"
  git -C "${work_dir}" checkout -b main >/dev/null 2>&1

  printf '%s\n' "initial" > "${work_dir}/README.md"
  git -C "${work_dir}" add README.md
  git -C "${work_dir}" commit -m "test: seed main" >/dev/null 2>&1
  git -C "${work_dir}" push -u origin main >/dev/null 2>&1

  printf '%s\n%s\n' "${remote_dir}" "${work_dir}"
}

run_publish() {
  local work_dir="$1"
  REPO_ROOT="${work_dir}" bash "${script_path}" --publish >/dev/null
}

run_dry_run() {
  local work_dir="$1"
  REPO_ROOT="${work_dir}" bash "${script_path}" >/dev/null
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

# Dry run reports success without creating branches.
mapfile -t repo_a < <(setup_repo dryrun "${tmpdir}")
remote_a="${repo_a[0]}"
work_a="${repo_a[1]}"
run_dry_run "${work_a}"
if git -C "${work_a}" ls-remote --exit-code --heads origin premain >/dev/null 2>&1; then
  fail "dry-run unexpectedly created premain"
fi
if git -C "${work_a}" ls-remote --exit-code --heads origin staging >/dev/null 2>&1; then
  fail "dry-run unexpectedly created staging"
fi

# Publish creates both missing release branches from main.
mapfile -t repo_b < <(setup_repo publish "${tmpdir}")
remote_b="${repo_b[0]}"
work_b="${repo_b[1]}"
run_publish "${work_b}"
main_sha_b="$(git ls-remote --heads "${remote_b}" main | awk 'NR == 1 { print $1 }')"
premain_sha_b="$(git ls-remote --heads "${remote_b}" premain | awk 'NR == 1 { print $1 }')"
staging_sha_b="$(git ls-remote --heads "${remote_b}" staging | awk 'NR == 1 { print $1 }')"
[[ -n "${premain_sha_b}" ]] || fail "publish did not create premain"
[[ -n "${staging_sha_b}" ]] || fail "publish did not create staging"
[[ "${premain_sha_b}" == "${main_sha_b}" ]] || fail "premain was not created from main"
[[ "${staging_sha_b}" == "${main_sha_b}" ]] || fail "staging was not created from main"

# Existing branches are left untouched on rerun.
first_premain_sha_b="${premain_sha_b}"
first_staging_sha_b="${staging_sha_b}"
run_publish "${work_b}"
second_premain_sha_b="$(git ls-remote --heads "${remote_b}" premain | awk 'NR == 1 { print $1 }')"
second_staging_sha_b="$(git ls-remote --heads "${remote_b}" staging | awk 'NR == 1 { print $1 }')"
[[ "${second_premain_sha_b}" == "${first_premain_sha_b}" ]] || fail "premain changed on rerun"
[[ "${second_staging_sha_b}" == "${first_staging_sha_b}" ]] || fail "staging changed on rerun"

# A pre-existing staging branch pointing elsewhere is preserved.
mapfile -t repo_c < <(setup_repo preserve "${tmpdir}")
remote_c="${repo_c[0]}"
work_c="${repo_c[1]}"
first_main_sha_c="$(git -C "${work_c}" rev-parse HEAD)"
git -C "${work_c}" push origin "${first_main_sha_c}:refs/heads/staging" >/dev/null 2>&1
printf '%s\n' "follow-up" >> "${work_c}/README.md"
git -C "${work_c}" add README.md
 git -C "${work_c}" commit -m "test: advance main" >/dev/null 2>&1
 git -C "${work_c}" push origin main >/dev/null 2>&1
run_publish "${work_c}"
latest_main_sha_c="$(git ls-remote --heads "${remote_c}" main | awk 'NR == 1 { print $1 }')"
staging_sha_c="$(git ls-remote --heads "${remote_c}" staging | awk 'NR == 1 { print $1 }')"
premain_sha_c="$(git ls-remote --heads "${remote_c}" premain | awk 'NR == 1 { print $1 }')"
[[ "${staging_sha_c}" == "${first_main_sha_c}" ]] || fail "existing staging branch was rewritten"
[[ "${premain_sha_c}" == "${latest_main_sha_c}" ]] || fail "premain was not created from latest main"

echo "test-ensure-release-branches: PASS"
