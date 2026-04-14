#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fail() {
  echo "test-theorycloud-targets: FAIL ($*)" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if ! grep -Fq "${needle}" <<<"${haystack}"; then
    fail "expected to find '${needle}'"
  fi
}

lab_sync_output="$(THEORYCLOUD_S3_SYNC_DRY_RUN=true bash "${SCRIPT_DIR}/sync_theorycloud_facetheory_subtree.sh" --stage lab)"
assert_contains "${lab_sync_output}" 'destination=s3://kt-sources-lab-787107040121/theorycloud/facetheory/'
assert_contains "${lab_sync_output}" 'command=aws s3 sync'

live_sync_output="$(THEORYCLOUD_S3_SYNC_DRY_RUN=true bash "${SCRIPT_DIR}/sync_theorycloud_facetheory_subtree.sh" --stage live)"
assert_contains "${live_sync_output}" 'destination=s3://kt-sources-live-787107040121/theorycloud/facetheory/'

lab_publish_output="$(THEORYCLOUD_PUBLISH_DRY_RUN=true bash "${SCRIPT_DIR}/trigger_theorycloud_publish.sh" --stage lab --source-revision abc123def456 --idempotency-key test-lab)"
assert_contains "${lab_publish_output}" 'url=https://l0lw87lsp1.execute-api.us-east-1.amazonaws.com/v1/internal/publish/theorycloud'
assert_contains "${lab_publish_output}" 'payload={"source_revision":"abc123def456","idempotency_key":"test-lab","reason":"docs sync complete","force":false}'

live_publish_output="$(THEORYCLOUD_PUBLISH_DRY_RUN=true bash "${SCRIPT_DIR}/trigger_theorycloud_publish.sh" --stage live --source-revision abc123def456 --idempotency-key test-live)"
assert_contains "${live_publish_output}" 'url=https://at3k47vix3.execute-api.us-east-1.amazonaws.com/v1/internal/publish/theorycloud'
assert_contains "${live_publish_output}" 'payload={"source_revision":"abc123def456","idempotency_key":"test-live","reason":"docs sync complete","force":false}'

echo 'test-theorycloud-targets: PASS'
