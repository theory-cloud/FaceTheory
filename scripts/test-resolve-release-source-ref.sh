#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="${repo_root}/scripts/resolve-release-source-ref.sh"

fail() {
  echo "test-resolve-release-source-ref: FAIL ($*)"
  exit 1
}

write_fake_gh() {
  local bin_dir="$1"
  mkdir -p "${bin_dir}"
  cat > "${bin_dir}/gh" <<'GH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${FAKE_GH_LOG}"
json_release() {
  local id="$1"
  local tag="$2"
  local target="$3"
  local draft="$4"
  local prerelease="$5"
  local url_suffix="$6"
  printf '[{"id":%s,"tag_name":"%s","target_commitish":"%s","draft":%s,"prerelease":%s,"html_url":"https://github.test/releases/%s"}]\n' \
    "${id}" "${tag}" "${target}" "${draft}" "${prerelease}" "${url_suffix}"
}
if [[ "${1:-}" == "api" ]]; then
  endpoint="${2:-}"
  case "${endpoint}" in
    repos/theory-cloud/FaceTheory/releases\?per_page=100\&page=1)
      case "${FAKE_RELEASE_MODE}" in
        untagged-draft)
          json_release 99 "v0.1.0-rc" "1111111111111111111111111111111111111111" true true untagged
          ;;
        existing-immutable)
          json_release 100 "v1.2.3-rc" "${FAKE_TARGET}" true true existing-immutable
          ;;
        existing-branch)
          json_release 101 "v1.2.3-rc" "release-candidate" true true existing-branch
          ;;
        existing-main)
          json_release 102 "v1.2.3-rc" "main" true true existing-main
          ;;
        malicious)
          json_release 103 "v1.2.5-rc" "refs/pull/1/head" true true malicious
          ;;
        none|fallback)
          printf '[]\n'
          ;;
        *)
          echo "unknown FAKE_RELEASE_MODE=${FAKE_RELEASE_MODE}" >&2
          exit 1
          ;;
      esac
      ;;
    *)
      echo "unexpected gh api endpoint: ${endpoint}" >&2
      exit 1
      ;;
  esac
  exit 0
fi
if [[ "${1:-} ${2:-}" == "release view" ]]; then
  if [[ "${FAKE_RELEASE_MODE}" == "fallback" ]]; then
    cat <<'JSON'
{"tagName":"v1.2.3","targetCommitish":"2222222222222222222222222222222222222222","isDraft":false,"isPrerelease":false,"url":"https://github.test/releases/v1.2.3","databaseId":104}
JSON
    exit 0
  fi
  exit 1
fi
echo "unexpected gh invocation: $*" >&2
exit 1
GH
  chmod +x "${bin_dir}/gh"
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT
bin_dir="${tmpdir}/bin"
log_file="${tmpdir}/gh.log"
write_fake_gh "${bin_dir}"

remote_dir="${tmpdir}/remote.git"
source_dir="${tmpdir}/source"
git init --bare "${remote_dir}" >/dev/null 2>&1
git init "${source_dir}" >/dev/null 2>&1
git -C "${source_dir}" config user.name "FaceTheory Test"
git -C "${source_dir}" config user.email "facetheory-test@example.com"
printf '%s\n' seed > "${source_dir}/README.md"
git -C "${source_dir}" add README.md
git -C "${source_dir}" -c commit.gpgSign=false commit -m "test: seed" >/dev/null 2>&1
tag_sha="$(git -C "${source_dir}" rev-parse HEAD)"
git -C "${source_dir}" -c tag.gpgSign=false tag -a v1.2.3-rc -m "test tag v1.2.3-rc" "${tag_sha}"
git -C "${source_dir}" -c tag.gpgSign=false tag -a v9.9.9 -m "test tag v9.9.9" "${tag_sha}"
git -C "${source_dir}" branch release-candidate "${tag_sha}"
git -C "${source_dir}" remote add origin "${remote_dir}"
git -C "${source_dir}" push origin refs/heads/release-candidate HEAD:refs/heads/main refs/tags/v1.2.3-rc refs/tags/v9.9.9 >/dev/null 2>&1
printf '%s\n' advanced >> "${source_dir}/README.md"
git -C "${source_dir}" add README.md
git -C "${source_dir}" -c commit.gpgSign=false commit -m "test: advance main" >/dev/null 2>&1
main_sha="$(git -C "${source_dir}" rev-parse HEAD)"
git -C "${source_dir}" push origin HEAD:refs/heads/main >/dev/null 2>&1

untagged_out="$(
  FAKE_GH_LOG="${log_file}" \
  FAKE_RELEASE_MODE=untagged-draft \
  GH_BIN="${bin_dir}/gh" \
  GIT_REMOTE="${remote_dir}" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}" v0.1.0-rc \
    2>"${tmpdir}/untagged.err"
)"
grep -Fxq 'source_ref=1111111111111111111111111111111111111111' <<<"${untagged_out}" || fail "untagged draft source_ref did not use immutable target commit"
grep -Fxq 'release_source_commit=1111111111111111111111111111111111111111' <<<"${untagged_out}" || fail "untagged draft output missing release_source_commit"
grep -Fxq 'release_is_draft=true' <<<"${untagged_out}" || fail "untagged draft output missing release_is_draft=true"
grep -Fxq 'release_target=1111111111111111111111111111111111111111' <<<"${untagged_out}" || fail "untagged draft output missing release_target"
grep -Fxq 'release_target_commit=1111111111111111111111111111111111111111' <<<"${untagged_out}" || fail "untagged draft output missing release_target_commit"
grep -Fxq 'release_id=99' <<<"${untagged_out}" || fail "untagged draft output missing release_id"
if grep -Fq 'release view v0.1.0-rc' "${log_file}"; then
  fail "draft lookup fell through to release view despite list API match"
fi

existing_immutable_out="$(
  FAKE_GH_LOG="${log_file}" \
  FAKE_RELEASE_MODE=existing-immutable \
  FAKE_TARGET="${tag_sha}" \
  GH_BIN="${bin_dir}/gh" \
  GIT_REMOTE="${remote_dir}" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}" v1.2.3-rc \
    2>"${tmpdir}/existing-immutable.err"
)"
grep -Fxq 'source_ref=refs/tags/v1.2.3-rc' <<<"${existing_immutable_out}" || fail "existing tag source_ref did not use requested tag ref"
grep -Fxq "release_source_commit=${tag_sha}" <<<"${existing_immutable_out}" || fail "existing tag output missing release_source_commit"
grep -Fxq "release_tag_commit=${tag_sha}" <<<"${existing_immutable_out}" || fail "existing tag output missing release_tag_commit"
grep -Fxq "release_target_commit=${tag_sha}" <<<"${existing_immutable_out}" || fail "existing immutable target did not resolve to tag commit"
grep -Fq "existing tag v1.2.3-rc resolves to immutable commit ${tag_sha}" "${tmpdir}/existing-immutable.err" || fail "existing tag stderr did not describe tag commit"

existing_branch_out="$(
  FAKE_GH_LOG="${log_file}" \
  FAKE_RELEASE_MODE=existing-branch \
  GH_BIN="${bin_dir}/gh" \
  GIT_REMOTE="${remote_dir}" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}" v1.2.3-rc \
    2>"${tmpdir}/existing-branch.err"
)"
grep -Fxq 'source_ref=refs/tags/v1.2.3-rc' <<<"${existing_branch_out}" || fail "existing tag with matching branch did not keep tag source_ref"
grep -Fxq "release_target_commit=${tag_sha}" <<<"${existing_branch_out}" || fail "matching branch target did not resolve to tag commit"
if grep -Fxq "source_ref=${tag_sha}" <<<"${existing_branch_out}"; then
  fail "existing tag source drifted to target commit instead of requested tag"
fi

if FAKE_GH_LOG="${log_file}" \
  FAKE_RELEASE_MODE=existing-main \
  GH_BIN="${bin_dir}/gh" \
  GIT_REMOTE="${remote_dir}" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}" v1.2.3-rc >"${tmpdir}/existing-main.out" 2>"${tmpdir}/existing-main.err"; then
  fail "existing tag with moved main target unexpectedly resolved"
fi
grep -Fq "tag resolves to ${tag_sha}, release target resolves to ${main_sha}" "${tmpdir}/existing-main.err" ||
  fail "moved main failure did not report tag/target commit mismatch"

if FAKE_GH_LOG="${log_file}" \
  FAKE_RELEASE_MODE=malicious \
  GH_BIN="${bin_dir}/gh" \
  GIT_REMOTE="${remote_dir}" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}" v1.2.5-rc >/dev/null 2>&1; then
  fail "malicious draft ref unexpectedly resolved"
fi

none_out="$(
  FAKE_GH_LOG="${log_file}" \
  FAKE_RELEASE_MODE=none \
  GH_BIN="${bin_dir}/gh" \
  GIT_REMOTE="${remote_dir}" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}" v9.9.9
)"
grep -Fxq 'source_ref=refs/tags/v9.9.9' <<<"${none_out}" || fail "missing release should fall back to existing tag ref"
grep -Fxq "release_source_commit=${tag_sha}" <<<"${none_out}" || fail "missing release should preserve existing tag commit"
grep -Fxq 'release_is_draft=false' <<<"${none_out}" || fail "missing release should not be draft"

missing_tag_out="$(
  FAKE_GH_LOG="${log_file}" \
  FAKE_RELEASE_MODE=none \
  GH_BIN="${bin_dir}/gh" \
  GIT_REMOTE="${remote_dir}" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}" v8.8.8
)"
grep -Fxq 'source_ref=v8.8.8' <<<"${missing_tag_out}" || fail "missing release and missing tag should leave checkout to fail closed on tag ref"
grep -Fxq 'release_is_draft=false' <<<"${missing_tag_out}" || fail "missing release and missing tag should not be draft"

fallback_out="$(
  FAKE_GH_LOG="${log_file}" \
  FAKE_RELEASE_MODE=fallback \
  GH_BIN="${bin_dir}/gh" \
  GIT_REMOTE="${remote_dir}" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}" v1.2.3
)"
grep -Fxq 'source_ref=2222222222222222222222222222222222222222' <<<"${fallback_out}" || fail "release view fallback did not resolve source_ref"
grep -Fxq 'release_source_commit=2222222222222222222222222222222222222222' <<<"${fallback_out}" || fail "release view fallback did not resolve release_source_commit"
grep -Fxq 'release_is_draft=false' <<<"${fallback_out}" || fail "published release fallback should not be draft"

empty_out="$(GITHUB_REF='refs/heads/premain' bash "${script_path}")"
grep -Fxq 'source_ref=refs/heads/premain' <<<"${empty_out}" || fail "empty tag should use GITHUB_REF"
grep -Fxq 'release_is_draft=false' <<<"${empty_out}" || fail "empty tag should not be draft"

checkout_work="${tmpdir}/checkout-work"
git init "${checkout_work}" >/dev/null 2>&1
git -C "${checkout_work}" remote add origin "${remote_dir}"
(
  cd "${checkout_work}"
  GIT_REMOTE="${remote_dir}" \
    bash "${repo_root}/scripts/checkout-release-source.sh" refs/tags/v1.2.3-rc "${tag_sha}" >/dev/null
) ||
  fail "checkout helper did not check out requested tag commit"
checkout_head="$(git -C "${checkout_work}" rev-parse HEAD)"
[[ "${checkout_head}" == "${tag_sha}" ]] || fail "checkout helper produced ${checkout_head}, expected tag ${tag_sha}"
if (
  cd "${checkout_work}"
  GIT_REMOTE="${remote_dir}" \
    bash "${repo_root}/scripts/checkout-release-source.sh" refs/tags/v1.2.3-rc "${main_sha}" >/dev/null 2>&1
); then
  fail "checkout helper accepted tag checkout that did not match expected commit"
fi
if (
  cd "${checkout_work}"
  GIT_REMOTE="${remote_dir}" \
    bash "${repo_root}/scripts/checkout-release-source.sh" refs/pull/1/head >/dev/null 2>&1
); then
  fail "checkout helper accepted unsupported pull-request ref"
fi

echo "test-resolve-release-source-ref: PASS"
