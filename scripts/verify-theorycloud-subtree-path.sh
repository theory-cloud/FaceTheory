#!/usr/bin/env bash
# Purpose: the TheoryCloud subtree gate command. It keeps the checks the CI job
# performed and adds the one leg that only a Linux root run can give: the
# destination test as UID 0. The record is produced in the digest-pinned Linux
# container its proof profile declares, where the run is already UID 0, so no
# privileged escalation happens in CI or on the producing host.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

staging_output="${FACETHEORY_SUBTREE_STAGING_OUTPUT:-${TMPDIR:-/tmp}/facetheory-theorycloud-subtree-$(id -u)}"
export THEORYCLOUD_FACETHEORY_SUBTREE_OUTPUT_DIR="${staging_output}"

echo "theorycloud-subtree: helper shell syntax"
for script in \
  scripts/stage_theorycloud_facetheory_subtree.sh \
  scripts/verify_theorycloud_facetheory_subtree.sh \
  scripts/sync_theorycloud_facetheory_subtree.sh \
  scripts/trigger_theorycloud_publish.sh \
  scripts/test-theorycloud-targets.sh \
  scripts/test-trigger-theorycloud-publish-awscurl.sh \
  scripts/verify-theorycloud-publish-install.sh \
  scripts/test-verify-theorycloud-publish-install.sh \
  scripts/verify-release-python-isolation.sh \
  scripts/test-verify-release-python-isolation.sh \
  scripts/verify-pages-deploy-tag.sh \
  scripts/test-verify-pages-deploy-tag.sh \
  scripts/verify-release-publish-binding.sh \
  scripts/test-verify-release-publish-binding.sh; do
  bash -n "${script}"
done

echo "theorycloud-subtree: no-vars publisher workflow contract"
workflow=".github/workflows/theorycloud-facetheory-subtree-publish.yml"
grep -Fq 'arn:aws:iam::787107040121:role/KnowledgeTheory-TheoryCloud-FaceTheory-lab-Publisher' "${workflow}"
grep -Fq 'arn:aws:iam::787107040121:role/KnowledgeTheory-TheoryCloud-FaceTheory-live-Publisher' "${workflow}"
if grep -Fq 'vars.THEORYCLOUD_AWS_ROLE_ARN_' "${workflow}"; then
  echo "theorycloud-subtree: FAIL (publisher workflow still references vars-based role selection)" >&2
  exit 1
fi

echo "theorycloud-subtree: staging and provenance"
bash scripts/stage_theorycloud_facetheory_subtree.sh --output "${staging_output}"
bash scripts/verify_theorycloud_facetheory_subtree.sh "${staging_output}"

echo "theorycloud-subtree: destination test as ordinary user (uid=$(id -u))"
bash scripts/test-theorycloud-subtree-destination.sh

echo "theorycloud-subtree: destination test as UID 0"
if [[ "$(id -u)" == "0" ]]; then
  bash scripts/test-theorycloud-subtree-destination.sh
elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  sudo -n bash scripts/test-theorycloud-subtree-destination.sh
else
  echo "theorycloud-subtree: FAIL (the UID 0 leg needs a root container or passwordless sudo)" >&2
  exit 1
fi

echo "theorycloud-subtree: sync/publish helper dry runs"
THEORYCLOUD_S3_SYNC_DRY_RUN=true bash scripts/sync_theorycloud_facetheory_subtree.sh --stage lab
THEORYCLOUD_S3_SYNC_DRY_RUN=true bash scripts/sync_theorycloud_facetheory_subtree.sh --stage live
THEORYCLOUD_PUBLISH_DRY_RUN=true bash scripts/trigger_theorycloud_publish.sh --stage lab --source-revision abc123def456 --idempotency-key evidence-lab
THEORYCLOUD_PUBLISH_DRY_RUN=true bash scripts/trigger_theorycloud_publish.sh --stage live --source-revision abc123def456 --idempotency-key evidence-live

echo "theorycloud-subtree: shared rollout target fixtures"
bash scripts/test-theorycloud-targets.sh
bash scripts/test-trigger-theorycloud-publish-awscurl.sh

echo "theorycloud-subtree: release-trust guards"
bash scripts/verify-theorycloud-publish-install.sh
bash scripts/test-verify-theorycloud-publish-install.sh
bash scripts/verify-release-python-isolation.sh
bash scripts/test-verify-release-python-isolation.sh
bash scripts/test-verify-pages-deploy-tag.sh
bash scripts/verify-release-publish-binding.sh
bash scripts/test-verify-release-publish-binding.sh

echo "theorycloud-subtree: PASS"
