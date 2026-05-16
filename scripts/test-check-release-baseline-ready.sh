#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="${repo_root}/scripts/check-release-baseline-ready.sh"

fail() {
  echo "test-check-release-baseline-ready: FAIL ($*)"
  exit 1
}

setup_remote_with_tag() {
  local base_dir="$1"
  local remote_dir="${base_dir}/remote.git"
  local source_dir="${base_dir}/source"

  git init --bare "${remote_dir}" >/dev/null 2>&1
  git init "${source_dir}" >/dev/null 2>&1
  git -C "${source_dir}" config user.name "FaceTheory Test"
  git -C "${source_dir}" config user.email "facetheory-test@example.com"
  printf '%s\n' seed > "${source_dir}/README.md"
  git -C "${source_dir}" add README.md
  git -C "${source_dir}" -c commit.gpgSign=false commit -m "test: seed" >/dev/null 2>&1
  git -C "${source_dir}" -c tag.gpgSign=false tag --no-sign v1.2.3
  git -C "${source_dir}" remote add origin "${remote_dir}"
  git -C "${source_dir}" push origin v1.2.3 >/dev/null 2>&1

  printf '%s\n' "${remote_dir}"
}

setup_work() {
  local base_dir="$1"
  local version="${2:-1.2.3}"
  local work_dir="${base_dir}/work-${version}"

  mkdir -p "${work_dir}"
  cat > "${work_dir}/.release-please-manifest.json" <<JSON
{
  ".": "${version}"
}
JSON
  printf '%s\n' "${work_dir}"
}

write_fake_gh() {
  local bin_dir="$1"
  local tag="$2"
  local draft="$3"

  mkdir -p "${bin_dir}"
  cat > "${bin_dir}/gh" <<SH
#!/usr/bin/env bash
set -euo pipefail
if [[ "\$1 \$2 \$3" != "release view ${tag}" ]]; then
  echo "unexpected gh invocation: \$*" >&2
  exit 1
fi
cat <<'JSON'
{"tagName":"${tag}","isDraft":${draft},"url":"https://github.test/releases/${tag}"}
JSON
SH
  chmod +x "${bin_dir}/gh"
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

remote_dir="$(setup_remote_with_tag "${tmpdir}")"

published_work="$(setup_work "${tmpdir}" "1.2.3")"
published_bin="${tmpdir}/published-bin"
write_fake_gh "${published_bin}" "v1.2.3" "false"
published_out="$(
  REPO_ROOT="${published_work}" \
  GIT_REMOTE="${remote_dir}" \
  GH_BIN="${published_bin}/gh" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}"
)"
printf '%s\n' "${published_out}" | grep -Fq 'release-baseline-ready: PASS' ||
  fail "published tag/release baseline did not pass"

draft_work="$(setup_work "${tmpdir}" "1.2.3")"
draft_bin="${tmpdir}/draft-bin"
write_fake_gh "${draft_bin}" "v1.2.3" "true"
draft_out="$(
  REPO_ROOT="${draft_work}" \
  GIT_REMOTE="${remote_dir}" \
  GH_BIN="${draft_bin}/gh" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}"
)"
printf '%s\n' "${draft_out}" | grep -Fq 'release=draft' ||
  fail "draft release baseline was not rejected as draft"
if printf '%s\n' "${draft_out}" | grep -Fq 'release-baseline-ready: PASS'; then
  fail "draft release baseline unexpectedly passed"
fi

missing_tag_work="$(setup_work "${tmpdir}" "1.2.4")"
missing_bin="${tmpdir}/missing-bin"
write_fake_gh "${missing_bin}" "v1.2.4" "false"
missing_out="$(
  REPO_ROOT="${missing_tag_work}" \
  GIT_REMOTE="${remote_dir}" \
  GH_BIN="${missing_bin}/gh" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}"
)"
printf '%s\n' "${missing_out}" | grep -Fq 'tag=false' ||
  fail "missing tag baseline was not rejected"

output_file="${tmpdir}/github-output"
REPO_ROOT="${draft_work}" \
GIT_REMOTE="${remote_dir}" \
GH_BIN="${draft_bin}/gh" \
GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
GITHUB_OUTPUT="${output_file}" \
bash "${script_path}" >/dev/null

grep -Fxq 'ready=false' "${output_file}" || fail "GITHUB_OUTPUT missing ready=false for draft"
grep -Fxq 'release_state=draft' "${output_file}" || fail "GITHUB_OUTPUT missing release_state=draft"

echo "test-check-release-baseline-ready: PASS"
