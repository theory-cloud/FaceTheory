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

# Read the full name-status change set rather than only the added/copied/
# modified destinations. A deletion (`D`) or either side of a rename (`R`/`C`)
# can otherwise hide a non-allowlisted path from the release-infrastructure
# exception, so every path the range touches is collected and put through the
# allowlist below. Paths are tab-separated by git, so a path with spaces survives
# the read.
mapfile -t change_lines < <(git diff --name-status "${diff_range}")
changed_files=()
for change_line in "${change_lines[@]}"; do
  [[ -n "${change_line}" ]] || continue
  IFS=$'\t' read -r change_status change_from change_to <<< "${change_line}"
  case "${change_status}" in
    R*|C*) changed_files+=("${change_from}" "${change_to}") ;;
    *) changed_files+=("${change_from}") ;;
  esac
done
if [[ "${#changed_files[@]}" -gt 0 ]]; then
  release_sync_only="true"
  for path in "${changed_files[@]}"; do
    case "${path}" in
      # Release metadata, the docs that carry version markers, and the release
      # helpers that only publish the generated assets. Workflow files,
      # verifier scripts (including their test harnesses), and the installed
      # dependency lockfile are deliberately absent: a range that changes gate
      # or CI code, or resolves dependencies, is user-facing and needs a
      # conventional release commit like any other change.
      .release-please-manifest*.json \
      | release-please-config*.json \
      | VERSION \
      | CHANGELOG.md \
      | CHANGELOG.prerelease.md \
      | README.md \
      | Makefile \
      | .gitignore \
      | docs/README.md \
      | docs/api-reference.md \
      | docs/getting-started.md \
      | scripts/build-release-assets.sh \
      | scripts/release-json-by-tag.sh \
      | scripts/resolve-release-source-ref.sh \
      | scripts/publish-draft-release-assets.sh \
      | scripts/generate-checksums.sh \
      | scripts/read-version.sh \
      | scripts/render-release-notes.sh \
      | ts/README.md \
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
