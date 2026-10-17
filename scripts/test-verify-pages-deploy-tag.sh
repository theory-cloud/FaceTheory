#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="${repo_root}/scripts/verify-pages-deploy-tag.sh"

fail() {
  echo "test-verify-pages-deploy-tag: FAIL ($*)"
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

bin_dir="${tmpdir}/bin"
mkdir -p "${bin_dir}"
cat > "${bin_dir}/gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == "api" ]] || { echo "unexpected gh invocation: $*" >&2; exit 1; }
endpoint="${2:-}"
shift 2
jq_expr=""
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --jq)
      jq_expr="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
case "${endpoint}" in
  */commits/*)
    [[ "${jq_expr}" == ".sha" ]] || { echo "unexpected jq: ${jq_expr}" >&2; exit 1; }
    printf '%s\n' "${FAKE_TAG_SHA}"
    ;;
  */compare/*)
    [[ "${jq_expr}" == ".status" ]] || { echo "unexpected jq: ${jq_expr}" >&2; exit 1; }
    printf '%s\n' "${FAKE_COMPARE_STATUS}"
    ;;
  *)
    echo "unexpected gh endpoint: ${endpoint}" >&2
    exit 1
    ;;
esac
SH
chmod +x "${bin_dir}/gh"

main_sha="1111111111111111111111111111111111111111"
other_sha="2222222222222222222222222222222222222222"

run_ok() {
  GH_BIN="${bin_dir}/gh" GITHUB_REPOSITORY="theory-cloud/FaceTheory" "$@"
}

# Positive: a tag-ref deploy whose tag commit is the run commit and is on main.
FAKE_TAG_SHA="${main_sha}" FAKE_COMPARE_STATUS="identical" \
  run_ok bash "${script_path}" "v1.2.3" "${main_sha}" "tag" >/dev/null ||
  fail "approved tag-ref deploy did not pass"

# Positive: a main push stamped with the latest stable release whose tag commit
# is an ancestor of main (the run is the newer main head).
FAKE_TAG_SHA="${other_sha}" FAKE_COMPARE_STATUS="ahead" \
  run_ok bash "${script_path}" "v1.2.3" "${main_sha}" "branch" >/dev/null ||
  fail "approved main-push deploy did not pass"

# Negative: the tag points at a commit that diverged from main (unreviewed branch).
if FAKE_TAG_SHA="${other_sha}" FAKE_COMPARE_STATUS="diverged" \
  run_ok bash "${script_path}" "v1.2.3" "${main_sha}" "branch" >/dev/null 2>&1; then
  fail "diverged tag commit unexpectedly passed"
fi

# Negative: the tag commit is ahead of main (not an approved main release commit).
if FAKE_TAG_SHA="${other_sha}" FAKE_COMPARE_STATUS="behind" \
  run_ok bash "${script_path}" "v1.2.3" "${main_sha}" "branch" >/dev/null 2>&1; then
  fail "non-ancestor tag commit unexpectedly passed"
fi

# Negative: a tag-ref deploy whose tag commit is not the run commit.
if FAKE_TAG_SHA="${other_sha}" FAKE_COMPARE_STATUS="identical" \
  run_ok bash "${script_path}" "v1.2.3" "${main_sha}" "tag" >/dev/null 2>&1; then
  fail "tag-ref commit mismatch unexpectedly passed"
fi

# Negative: an unresolved tag.
if FAKE_TAG_SHA="" FAKE_COMPARE_STATUS="ahead" \
  run_ok bash "${script_path}" "v1.2.3" "${main_sha}" "branch" >/dev/null 2>&1; then
  fail "unresolved tag unexpectedly passed"
fi

# Negative: a non-stable tag shape.
if FAKE_TAG_SHA="${main_sha}" FAKE_COMPARE_STATUS="identical" \
  run_ok bash "${script_path}" "v1.2" "${main_sha}" "tag" >/dev/null 2>&1; then
  fail "non-stable tag unexpectedly passed"
fi

echo "test-verify-pages-deploy-tag: PASS"
