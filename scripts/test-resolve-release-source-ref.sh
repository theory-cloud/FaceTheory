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
  cat > "${bin_dir}/gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${FAKE_GH_LOG}"
if [[ "$1" == "api" ]]; then
  endpoint="$2"
  case "${endpoint}" in
    repos/theory-cloud/FaceTheory/releases\?per_page=100\&page=1)
      case "${FAKE_RELEASE_MODE}" in
        draft)
          cat <<'JSON'
[
  {
    "id": 99,
    "tag_name": "v1.2.3-rc",
    "target_commitish": "1111111111111111111111111111111111111111",
    "draft": true,
    "prerelease": true,
    "html_url": "https://github.test/releases/untagged"
  }
]
JSON
          ;;
        draft-branch)
          cat <<'JSON'
[
  {
    "id": 100,
    "tag_name": "v1.2.4-rc",
    "target_commitish": "release-candidate",
    "draft": true,
    "prerelease": true,
    "html_url": "https://github.test/releases/branch"
  }
]
JSON
          ;;
        malicious)
          cat <<'JSON'
[
  {
    "id": 101,
    "tag_name": "v1.2.5-rc",
    "target_commitish": "refs/pull/1/head",
    "draft": true,
    "prerelease": true,
    "html_url": "https://github.test/releases/malicious"
  }
]
JSON
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
if [[ "$1 $2" == "release view" ]]; then
  if [[ "${FAKE_RELEASE_MODE}" == "fallback" ]]; then
    cat <<'JSON'
{"tagName":"v1.2.3","targetCommitish":"2222222222222222222222222222222222222222","isDraft":false,"isPrerelease":false,"url":"https://github.test/releases/v1.2.3","databaseId":100}
JSON
    exit 0
  fi
  exit 1
fi
echo "unexpected gh invocation: $*" >&2
exit 1
SH
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
git -C "${source_dir}" branch release-candidate
git -C "${source_dir}" remote add origin "${remote_dir}"
git -C "${source_dir}" push origin release-candidate >/dev/null 2>&1
branch_sha="$(git -C "${source_dir}" rev-parse release-candidate)"

draft_out="$(
  FAKE_GH_LOG="${log_file}" \
  FAKE_RELEASE_MODE=draft \
  GH_BIN="${bin_dir}/gh" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}" v1.2.3-rc \
    2>"${tmpdir}/draft.err"
)"

grep -Fxq 'source_ref=1111111111111111111111111111111111111111' <<<"${draft_out}" || fail "draft source_ref did not use target_commitish"
grep -Fxq 'release_is_draft=true' <<<"${draft_out}" || fail "draft output missing release_is_draft=true"
grep -Fxq 'release_target=1111111111111111111111111111111111111111' <<<"${draft_out}" || fail "draft output missing release_target"
grep -Fxq 'release_id=99' <<<"${draft_out}" || fail "draft output missing release_id"
grep -Fq 'release-source-ref: draft v1.2.3-rc targets 1111111111111111111111111111111111111111' "${tmpdir}/draft.err" || fail "draft stderr did not describe resolved target"
if grep -Fq 'release view v1.2.3-rc' "${log_file}"; then
  fail "draft lookup fell through to release view despite list API match"
fi

env_out="$(
  RELEASE_JSON='{"id":102,"tag_name":"v1.2.3-rc","target_commitish":"3333333333333333333333333333333333333333","draft":true,"prerelease":true,"html_url":"https://github.test/releases/env"}' \
  GH_BIN="${tmpdir}/missing-gh" \
  bash "${script_path}" v1.2.3-rc \
    2>"${tmpdir}/env.err"
)"
grep -Fxq 'source_ref=3333333333333333333333333333333333333333' <<<"${env_out}" ||
  fail "environment-provided release metadata did not resolve source_ref"
grep -Fxq 'release_is_draft=true' <<<"${env_out}" ||
  fail "environment-provided release metadata did not preserve draft state"
grep -Fxq 'release_id=102' <<<"${env_out}" ||
  fail "environment-provided release metadata did not preserve release_id"

branch_out="$(
  FAKE_GH_LOG="${log_file}" \
  FAKE_RELEASE_MODE=draft-branch \
  GH_BIN="${bin_dir}/gh" \
  GIT_REMOTE="${remote_dir}" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}" v1.2.4-rc \
    2>"${tmpdir}/branch.err"
)"
grep -Fxq "source_ref=${branch_sha}" <<<"${branch_out}" || fail "draft branch target did not resolve to immutable commit"
grep -Fxq 'release_target=release-candidate' <<<"${branch_out}" || fail "draft branch output missing original target"
grep -Fxq "release_source_commit=${branch_sha}" <<<"${branch_out}" || fail "draft branch output missing release_source_commit"
if grep -Fxq 'source_ref=release-candidate' <<<"${branch_out}"; then
  fail "draft branch target leaked mutable source_ref"
fi
grep -Fq "draft target release-candidate resolved to immutable commit ${branch_sha}" "${tmpdir}/branch.err" ||
  fail "draft branch stderr did not describe immutable resolution"

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
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}" v9.9.9
)"
grep -Fxq 'source_ref=v9.9.9' <<<"${none_out}" || fail "missing release should fall back to tag ref"
grep -Fxq 'release_is_draft=false' <<<"${none_out}" || fail "missing release should not be draft"

fallback_out="$(
  FAKE_GH_LOG="${log_file}" \
  FAKE_RELEASE_MODE=fallback \
  GH_BIN="${bin_dir}/gh" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}" v1.2.3
)"
grep -Fxq 'source_ref=2222222222222222222222222222222222222222' <<<"${fallback_out}" || fail "release view fallback did not resolve source_ref"
grep -Fxq 'release_is_draft=false' <<<"${fallback_out}" || fail "published release fallback should not be draft"

empty_out="$(GITHUB_REF='refs/heads/premain' bash "${script_path}")"
grep -Fxq 'source_ref=refs/heads/premain' <<<"${empty_out}" || fail "empty tag should use GITHUB_REF"
grep -Fxq 'release_is_draft=false' <<<"${empty_out}" || fail "empty tag should not be draft"

echo "test-resolve-release-source-ref: PASS"
