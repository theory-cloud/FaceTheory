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
release_commit_subject_regex='^(feat|fix|perf)(\([^)]+\))?(!)?:[[:space:]]'
mapfile -t commit_subjects < <(git log --format=%s "${range}")
for subject in "${commit_subjects[@]}"; do
  if [[ "${subject}" =~ ${release_commit_subject_regex} ]]; then
    echo "${context_label}-readiness: OK"
    exit 0
  fi
done

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
      | scripts/check-release-baseline-ready.sh \
      | scripts/release-json-by-tag.sh \
      | scripts/resolve-release-source-ref.sh \
      | scripts/publish-draft-release-assets.sh \
      | scripts/test-check-release-baseline-ready.sh \
      | scripts/test-resolve-release-source-ref.sh \
      | scripts/test-publish-draft-release-assets.sh \
      | scripts/generate-checksums.sh \
      | scripts/read-version.sh \
      | scripts/render-release-notes.sh \
      | scripts/test-release-workflow-changelog-preservation.sh \
      | scripts/verify-release-branch.sh \
      | scripts/verify-release-draft-target.sh \
      | scripts/verify-release-readiness.sh \
      | scripts/test-verify-release-draft-target.sh \
      | scripts/test-verify-release-readiness.sh \
      | scripts/verify-ts-pack.sh \
      | scripts/verify-version-alignment.sh \
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
printf '%s\n' "${commit_subjects[@]}"
exit 1
