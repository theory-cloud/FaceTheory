#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fail() {
  echo "test-trigger-theorycloud-publish-awscurl: FAIL ($*)" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if ! grep -Fq "${needle}" <<<"${haystack}"; then
    fail "expected to find '${needle}'"
  fi
}

stub_dir="$(mktemp -d)"
trap 'rm -rf "${stub_dir}"' EXIT

cat > "${stub_dir}/awscurl" <<'EOF_AWSCURL'
#!/usr/bin/env bash
set -euo pipefail

mode="${AWSCURL_TEST_MODE:-success}"
output_file=""
url=""
seen_fail_with_body="false"
seen_write_out="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fail-with-body)
      seen_fail_with_body="true"
      shift
      ;;
    -o)
      output_file="$2"
      shift 2
      ;;
    -w)
      seen_write_out="true"
      shift 2
      ;;
    -*)
      shift
      if [[ $# -gt 0 && "$1" != -* ]]; then
        shift
      fi
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done

if [[ "${seen_fail_with_body}" != "true" ]]; then
  echo "missing --fail-with-body" >&2
  exit 64
fi
if [[ "${seen_write_out}" == "true" ]]; then
  echo "unexpected -w flag" >&2
  exit 65
fi
if [[ -z "${output_file}" ]]; then
  echo "missing -o output file" >&2
  exit 66
fi
if [[ -z "${url}" ]]; then
  echo "missing publish URL" >&2
  exit 67
fi

case "${mode}" in
  success)
    printf '{"job_id":"job-123","status":"enqueued"}\n' > "${output_file}"
    exit 0
    ;;
  failure)
    printf '{"error":"publish failed"}\n' > "${output_file}"
    exit 7
    ;;
  *)
    echo "unsupported AWSCURL_TEST_MODE=${mode}" >&2
    exit 68
    ;;
esac
EOF_AWSCURL
chmod +x "${stub_dir}/awscurl"

success_output="$(
  PATH="${stub_dir}:${PATH}" \
  bash "${SCRIPT_DIR}/trigger_theorycloud_publish.sh" \
    --stage lab \
    --source-revision abc123def456 \
    --idempotency-key stub-success
)"
assert_contains "${success_output}" 'trigger-theorycloud-publish: PASS (url=https://l0lw87lsp1.execute-api.us-east-1.amazonaws.com/v1/internal/publish/theorycloud)'
assert_contains "${success_output}" '{"job_id":"job-123","status":"enqueued"}'

set +e
failure_output="$(
  PATH="${stub_dir}:${PATH}" \
  AWSCURL_TEST_MODE=failure \
  bash "${SCRIPT_DIR}/trigger_theorycloud_publish.sh" \
    --stage live \
    --source-revision abc123def456 \
    --idempotency-key stub-failure 2>&1
)"
failure_status=$?
set -e

if [[ "${failure_status}" -eq 0 ]]; then
  fail "expected failure when awscurl returns a non-zero status"
fi

assert_contains "${failure_output}" 'trigger-theorycloud-publish: FAIL (awscurl invocation failed for https://at3k47vix3.execute-api.us-east-1.amazonaws.com/v1/internal/publish/theorycloud (exit 7): {"error":"publish failed"})'

echo 'test-trigger-theorycloud-publish-awscurl: PASS'
