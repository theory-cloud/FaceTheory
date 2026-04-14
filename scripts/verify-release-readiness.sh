#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

base_ref="${1:-}"
head_ref="${2:-}"
context_label="${3:-release}"

if [[ -z "${base_ref}" || -z "${head_ref}" ]]; then
  echo "${context_label}-readiness: FAIL (usage: scripts/verify-release-readiness.sh <base-ref> <head-ref> [context-label])"
  exit 1
fi

range="${base_ref}..${head_ref}"
diff_range="${base_ref}...${head_ref}"

echo "Checking commits in ${range}..."
if git log --format=%s "${range}" | grep -Eq '^(feat|fix|perf)(\([^)]+\))?(!)?: '; then
  echo "${context_label}-readiness: OK"
  exit 0
fi

mapfile -t changed_files < <(git diff --name-only --diff-filter=ACMR "${diff_range}")
if [[ "${#changed_files[@]}" -gt 0 ]]; then
  release_sync_only="true"
  for path in "${changed_files[@]}"; do
    case "${path}" in
      .github/workflows/* \
      | .release-please-manifest*.json \
      | release-please-config*.json \
      | VERSION \
      | CHANGELOG.md \
      | README.md \
      | Makefile \
      | .gitignore \
      | docs/README.md \
      | docs/api-reference.md \
      | docs/getting-started.md \
      | scripts/build-release-assets.sh \
      | scripts/ensure-release-branches.sh \
      | scripts/generate-checksums.sh \
      | scripts/read-version.sh \
      | scripts/render-release-notes.sh \
      | scripts/test-ensure-release-branches.sh \
      | scripts/test-theorycloud-targets.sh \
      | scripts/test-trigger-theorycloud-publish-awscurl.sh \
      | scripts/test-verify-branch-promotion-policy.sh \
      | scripts/trigger_theorycloud_publish.sh \
      | scripts/verify-branch-promotion-policy.sh \
      | scripts/verify-release-branch.sh \
      | scripts/verify-release-readiness.sh \
      | scripts/verify_theorycloud_facetheory_subtree.sh \
      | scripts/verify-ts-pack.sh \
      | scripts/verify-version-alignment.sh \
      | scripts/stage_theorycloud_facetheory_subtree.sh \
      | scripts/sync_theorycloud_facetheory_subtree.sh \
      | docs/development-guidelines.md \
      | ts/README.md \
      | ts/package-lock.json \
      | ts/package.json)
        ;;
      *)
        release_sync_only="false"
        break
        ;;
    esac
  done

  if [[ "${release_sync_only}" == "true" ]]; then
    echo "${context_label}-readiness: OK (release sync only change)"
    printf '%s\n' "${changed_files[@]}"
    exit 0
  fi
fi

echo "${context_label}-readiness: FAIL"
echo "No user-facing conventional commits (feat:/fix:/perf:) found in ${range}."
echo "release-please will skip, so no new release PR will be cut."
echo
echo "Commit subjects:"
git log --format=%s "${range}" || true
exit 1
