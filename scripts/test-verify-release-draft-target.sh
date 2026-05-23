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

# The release-capable token is intentionally confined to an inline workflow
# metadata step. The repo-controlled verifier must be able to validate that
# metadata without invoking gh or receiving the token itself.
work_env="$(setup_repo env-draft "${tmpdir}")"
head_env="$(git -C "${work_env}" rev-parse HEAD)"
release_json_env="{\"tagName\":\"v3.1.2-rc\",\"targetCommitish\":\"${head_env}\",\"isDraft\":true,\"isPrerelease\":true,\"url\":\"https://github.test/releases/untagged-env\"}"
REPO_ROOT="${work_env}" GH_BIN="${tmpdir}/missing-gh" RELEASE_JSON="${release_json_env}" \
  bash "${script_path}" "v3.1.2-rc" "HEAD" >/dev/null ||
  fail "environment-provided draft metadata did not pass without gh"

# Existing-tag asset builds must prove the draft target still resolves to the
# checked-out tag commit. A mutable target such as main must not pass after main
# advances beyond the requested tag.
work_tag="$(setup_repo existing-tag "${tmpdir}")"
tag_head="$(git -C "${work_tag}" rev-parse HEAD)"
remote_tag="${tmpdir}/existing-tag-remote.git"
git init --bare "${remote_tag}" >/dev/null 2>&1
git -C "${work_tag}" remote add origin "${remote_tag}"
git -C "${work_tag}" -c tag.gpgSign=false tag -a v3.1.2-rc -m "test tag v3.1.2-rc" "${tag_head}"
git -C "${work_tag}" push origin HEAD:refs/heads/main refs/tags/v3.1.2-rc >/dev/null 2>&1
printf '%s\n' "main moved after tag" >> "${work_tag}/README.md"
git -C "${work_tag}" add README.md
git -C "${work_tag}" commit -m "test: move main after tag" >/dev/null 2>&1
git -C "${work_tag}" push origin HEAD:refs/heads/main >/dev/null 2>&1
git -C "${work_tag}" checkout --detach "${tag_head}" >/dev/null 2>&1
release_json_tag_commit="{\"tagName\":\"v3.1.2-rc\",\"targetCommitish\":\"${tag_head}\",\"isDraft\":true,\"isPrerelease\":true,\"url\":\"https://github.test/releases/existing-tag\"}"
REPO_ROOT="${work_tag}" GH_BIN="${tmpdir}/missing-gh" RELEASE_JSON="${release_json_tag_commit}" \
  bash "${script_path}" "v3.1.2-rc" "HEAD" >/dev/null ||
  fail "existing tag draft with immutable tag target did not pass"
release_json_moved_main='{"tagName":"v3.1.2-rc","targetCommitish":"main","isDraft":true,"isPrerelease":true,"url":"https://github.test/releases/existing-tag-main"}'
if REPO_ROOT="${work_tag}" GIT_REMOTE="${remote_tag}" GH_BIN="${tmpdir}/missing-gh" RELEASE_JSON="${release_json_moved_main}" \
  bash "${script_path}" "v3.1.2-rc" "HEAD" >/dev/null 2>&1; then
  fail "existing tag draft with moved main target unexpectedly passed"
fi

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

# A mutable branch target may be accepted only after it resolves to the exact
# immutable commit being built. The mutable branch name itself must not be
# enough to pass if it later moves.
work_d="$(setup_repo branch-target "${tmpdir}")"
head_d="$(git -C "${work_d}" rev-parse HEAD)"
remote_d="${tmpdir}/branch-target-remote.git"
git init --bare "${remote_d}" >/dev/null 2>&1
git -C "${work_d}" remote add origin "${remote_d}"
git -C "${work_d}" push origin HEAD:refs/heads/release-candidate >/dev/null 2>&1
bin_d="${tmpdir}/bin-d"
write_fake_gh "${bin_d}" "v3.1.2-rc" "release-candidate" "true" "true"
REPO_ROOT="${work_d}" GIT_REMOTE="${remote_d}" GH_BIN="${bin_d}/gh" bash "${script_path}" "v3.1.2-rc" "${head_d}" >/dev/null ||
  fail "branch target did not resolve to the checked-out commit"

printf '%s\n' "moved branch" >> "${work_d}/README.md"
git -C "${work_d}" add README.md
git -C "${work_d}" commit -m "test: move release branch" >/dev/null 2>&1
git -C "${work_d}" push origin HEAD:refs/heads/release-candidate >/dev/null 2>&1
if REPO_ROOT="${work_d}" GIT_REMOTE="${remote_d}" GH_BIN="${bin_d}/gh" bash "${script_path}" "v3.1.2-rc" "${head_d}" >/dev/null 2>&1; then
  fail "moved branch target unexpectedly passed for stale checkout"
fi

bin_e="${tmpdir}/bin-e"
write_fake_gh "${bin_e}" "v3.1.2-rc" "refs/pull/1/head" "true" "true"
if REPO_ROOT="${work_d}" GIT_REMOTE="${remote_d}" GH_BIN="${bin_e}/gh" bash "${script_path}" "v3.1.2-rc" "HEAD" >/dev/null 2>&1; then
  fail "non-branch mutable ref unexpectedly passed"
fi

echo "test-verify-release-draft-target: PASS"
