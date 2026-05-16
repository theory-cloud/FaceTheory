#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="${repo_root}/scripts/verify-release-draft-target.sh"

fail() {
  echo "test-verify-release-draft-target: FAIL ($*)"
  exit 1
}

setup_repo() {
  local label="$1"
  local base_dir="$2"
  local work_dir="${base_dir}/${label}-work"

  mkdir -p "${work_dir}/scripts"
  git init "${work_dir}" >/dev/null 2>&1
  git -C "${work_dir}" config user.name "FaceTheory Test"
  git -C "${work_dir}" config user.email "facetheory-test@example.com"

  cp "${repo_root}/scripts/read-version.sh" "${work_dir}/scripts/read-version.sh"
  chmod +x "${work_dir}/scripts/read-version.sh"
  printf '%s # x-release-please-version\n' "3.1.2-rc" > "${work_dir}/VERSION"
  printf '%s\n' "release source" > "${work_dir}/README.md"
  git -C "${work_dir}" add VERSION README.md scripts/read-version.sh
  git -C "${work_dir}" commit -m "test: seed release source" >/dev/null 2>&1

  printf '%s\n' "${work_dir}"
}

write_fake_gh() {
  local bin_dir="$1"
  local tag="$2"
  local target="$3"
  local is_draft="$4"
  local is_prerelease="$5"

  mkdir -p "${bin_dir}"
  cat > "${bin_dir}/gh" <<SH
#!/usr/bin/env bash
set -euo pipefail
if [[ "\$1 \$2 \$3" != "release view ${tag}" ]]; then
  echo "unexpected gh invocation: \$*" >&2
  exit 1
fi
cat <<'JSON'
{"tagName":"${tag}","targetCommitish":"${target}","isDraft":${is_draft},"isPrerelease":${is_prerelease},"url":"https://github.test/releases/${tag}"}
JSON
SH
  chmod +x "${bin_dir}/gh"
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

# Release Please draft releases are untagged until publish time. The asset builder
# must accept a draft release whose targetCommitish is the checked-out release
# commit, even though no git tag exists yet.
work_a="$(setup_repo untagged-draft "${tmpdir}")"
head_a="$(git -C "${work_a}" rev-parse HEAD)"
bin_a="${tmpdir}/bin-a"
write_fake_gh "${bin_a}" "v3.1.2-rc" "${head_a}" "true" "true"
REPO_ROOT="${work_a}" GH_BIN="${bin_a}/gh" bash "${script_path}" "v3.1.2-rc" "HEAD" >/dev/null ||
  fail "untagged draft target did not pass"

# A draft release pointing somewhere other than the checked-out commit must fail
# closed; otherwise assets can be built from different code than the release.
work_b="$(setup_repo wrong-target "${tmpdir}")"
head_b="$(git -C "${work_b}" rev-parse HEAD)"
printf '%s\n' "wrong target" >> "${work_b}/README.md"
git -C "${work_b}" add README.md
git -C "${work_b}" commit -m "test: wrong target" >/dev/null 2>&1
wrong_b="$(git -C "${work_b}" rev-parse HEAD)"
bin_b="${tmpdir}/bin-b"
write_fake_gh "${bin_b}" "v3.1.2-rc" "${wrong_b}" "true" "true"
if REPO_ROOT="${work_b}" GH_BIN="${bin_b}/gh" bash "${script_path}" "v3.1.2-rc" "${head_b}" >/dev/null 2>&1; then
  fail "wrong target unexpectedly passed"
fi

# The release must still be a draft before assets are uploaded; published releases
# are immutable and must not be modified by this path.
work_c="$(setup_repo published "${tmpdir}")"
head_c="$(git -C "${work_c}" rev-parse HEAD)"
bin_c="${tmpdir}/bin-c"
write_fake_gh "${bin_c}" "v3.1.2-rc" "${head_c}" "false" "true"
if REPO_ROOT="${work_c}" GH_BIN="${bin_c}/gh" bash "${script_path}" "v3.1.2-rc" "HEAD" >/dev/null 2>&1; then
  fail "published release unexpectedly passed"
fi

echo "test-verify-release-draft-target: PASS"
