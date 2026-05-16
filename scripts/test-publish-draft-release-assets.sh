#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="${repo_root}/scripts/publish-draft-release-assets.sh"

fail() {
  echo "test-publish-draft-release-assets: FAIL ($*)"
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
  shift
  method="GET"
  endpoint=""
  input=""
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --method)
        method="$2"
        shift 2
        ;;
      --header|-H)
        shift 2
        ;;
      --input)
        input="$2"
        shift 2
        ;;
      -F|--field)
        shift 2
        ;;
      --jq)
        jq_expr="$2"
        shift 2
        ;;
      *)
        if [[ -z "${endpoint}" ]]; then
          endpoint="$1"
        fi
        shift
        ;;
    esac
  done
  case "${method} ${endpoint}" in
    "GET repos/theory-cloud/FaceTheory/releases?per_page=100&page=1")
      cat <<'JSON'
[
  {
    "id": 99,
    "tag_name": "v1.2.3-rc",
    "target_commitish": "1111111111111111111111111111111111111111",
    "draft": true,
    "prerelease": true,
    "upload_url": "https://uploads.github.com/repos/theory-cloud/FaceTheory/releases/99/assets{?name,label}",
    "html_url": "https://github.test/releases/untagged"
  }
]
JSON
      ;;
    "GET repos/theory-cloud/FaceTheory/releases/99/assets")
      if [[ "${jq_expr:-}" == ".[].name" ]]; then
        printf '%s\n' 'facetheory-reference-1.2.3-rc.tar.gz'
      else
        cat <<'JSON'
[{"name":"facetheory-reference-1.2.3-rc.tar.gz"}]
JSON
      fi
      ;;
    "POST https://uploads.github.com/repos/theory-cloud/FaceTheory/releases/99/assets?name=theory-cloud-facetheory-1.2.3-rc.tgz"|"POST https://uploads.github.com/repos/theory-cloud/FaceTheory/releases/99/assets?name=SHA256SUMS.txt")
      [[ -n "${input}" && -f "${input}" ]] || exit 1
      printf '{"state":"uploaded"}\n'
      ;;
    "PATCH repos/theory-cloud/FaceTheory/releases/99")
      printf '{"draft":false,"prerelease":true}\n'
      ;;
    *)
      echo "unexpected gh api invocation: method=${method} endpoint=${endpoint}" >&2
      exit 1
      ;;
  esac
  exit 0
fi
if [[ "$1 $2" == "release view" ]]; then
  echo "release view should not be used when releases list returns an id" >&2
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
dist_dir="${tmpdir}/dist"
log_file="${tmpdir}/gh.log"
mkdir -p "${dist_dir}"
printf 'pkg' > "${dist_dir}/theory-cloud-facetheory-1.2.3-rc.tgz"
printf 'ref' > "${dist_dir}/facetheory-reference-1.2.3-rc.tar.gz"
printf 'sum' > "${dist_dir}/SHA256SUMS.txt"
write_fake_gh "${bin_dir}"

out="$(
  FAKE_GH_LOG="${log_file}" \
  GH_BIN="${bin_dir}/gh" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  bash "${script_path}" v1.2.3-rc "${dist_dir}"
)"

grep -Fq 'release-assets: skip existing facetheory-reference-1.2.3-rc.tar.gz' <<<"${out}" || fail "existing asset was not skipped"
grep -Fq 'release-assets: published v1.2.3-rc' <<<"${out}" || fail "release was not published"
grep -Fq 'POST https://uploads.github.com/repos/theory-cloud/FaceTheory/releases/99/assets?name=theory-cloud-facetheory-1.2.3-rc.tgz' "${log_file}" || fail "package asset upload missing"
grep -Fq 'POST https://uploads.github.com/repos/theory-cloud/FaceTheory/releases/99/assets?name=SHA256SUMS.txt' "${log_file}" || fail "checksum upload missing"
if grep -Fq 'POST https://uploads.github.com/repos/theory-cloud/FaceTheory/releases/99/assets?name=facetheory-reference-1.2.3-rc.tar.gz' "${log_file}"; then
  fail "existing reference asset was uploaded"
fi
grep -Fq 'PATCH repos/theory-cloud/FaceTheory/releases/99' "${log_file}" || fail "publish patch missing"
if grep -Fq 'release view' "${log_file}"; then
  fail "script fell back to gh release view despite release id"
fi

echo "test-publish-draft-release-assets: PASS"
