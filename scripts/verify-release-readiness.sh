#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

base_ref=""
range_head=""
context_label=""
allow_main_backmerge="false"
pr_head_ref=""
github_repository="${GITHUB_REPOSITORY:-}"
github_head_repository=""
backmerge_detail=""

usage() {
  cat <<'USAGE'
usage: scripts/verify-release-readiness.sh <base-ref> <head-ref> [context-label]
       [--allow-main-backmerge --head-ref <pull-request-head-ref>
        --github-head-repository <owner/name> --github-repository <owner/name>]

Fails unless the given git revision range contains at least one user-facing
Conventional Commit (feat:/fix:/perf:) subject, or the range is a change that
release-please owns end to end (release sync only).

--allow-main-backmerge opts in to the narrow post-release main back-merge
exemption. It only ever applies to a pull request whose head ref is exactly
`main` and whose head repository is this repository, so a lookalike branch such
as `main-hotfix`, or a fork's own branch named `main`, cannot take it.
USAGE
}

positionals=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-main-backmerge) allow_main_backmerge="true"; shift ;;
    --head-ref) pr_head_ref="${2:-}"; shift 2 ;;
    --github-repository) github_repository="${2:-}"; shift 2 ;;
    --github-head-repository) github_head_repository="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    --*) echo "release-readiness: FAIL (unknown argument: $1)" >&2; usage >&2; exit 2 ;;
    *) positionals+=("$1"); shift ;;
  esac
done

base_ref="${positionals[0]:-}"
range_head="${positionals[1]:-}"
context_label="${positionals[2]:-release}"

if [[ -z "${base_ref}" || -z "${range_head}" ]]; then
  echo "${context_label}-readiness: FAIL (usage: scripts/verify-release-readiness.sh <base-ref> <head-ref> [context-label] [--allow-main-backmerge --head-ref <name> --github-head-repository <owner/name> --github-repository <owner/name>])"
  exit 1
fi

range="${base_ref}..${range_head}"
diff_range="${base_ref}...${range_head}"

# normalize_repository trims and lowercases an owner/name value, mirroring the
# trusted-repository comparison in scripts/verify-release-train-promotion.sh.
normalize_repository() {
  local value="${1:-}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value,,}"
}

# is_post_release_main_backmerge returns 0 when the checked revision is exactly
# the post-release back-merge of this repository's released main branch into the
# lane this gate guards, and 1 when it is not.
#
# This gate is pull_request-only (ci.yml "Release readiness (PR -> staging)"), so
# only the pull-request leg exists: there is no push leg to judge and the merged
# staging SHA is never checked here. The head ref must be exactly `main` -- a
# lookalike branch such as `main-hotfix` is not `main` -- and the head repository
# must be this repository, so a fork's own branch named `main` cannot take the
# exemption. The release train is the only writer of the protected main branch,
# so a pull request whose head is this repository's main promotes only
# already-released content; that is why its range carries no release-driving
# commit, and why that must not read as a missing release driver.
is_post_release_main_backmerge() {
  backmerge_detail=""
  if [[ -z "${pr_head_ref}" ]]; then
    return 1
  fi

  local normalized_head_repository normalized_repository
  normalized_head_repository="$(normalize_repository "${github_head_repository}")"
  normalized_repository="$(normalize_repository "${github_repository}")"
  if [[ "${pr_head_ref}" == "main" ]] \
    && [[ -n "${normalized_head_repository}" ]] \
    && [[ "${normalized_head_repository}" == "${normalized_repository}" ]]; then
    backmerge_detail="pull-request head ${github_repository} main"
    return 0
  fi
  return 1
}

if [[ "${allow_main_backmerge}" == "true" ]]; then
  # The exemption is only meaningful against the released main branch, so an
  # opted-in caller that cannot name the repository or the pull-request head ref
  # is misconfigured: block rather than fall back to the plain predicate, whose
  # outcome would then depend on how the wiring happens to be spelled.
  if [[ -z "$(normalize_repository "${github_repository}")" ]]; then
    echo "${context_label}-readiness: BLOCKED (--allow-main-backmerge requires --github-repository in owner/name form)" >&2
    exit 2
  fi
  if [[ -z "${pr_head_ref}" ]]; then
    echo "${context_label}-readiness: BLOCKED (--allow-main-backmerge requires --head-ref; this gate has no push leg to judge)" >&2
    exit 2
  fi
  if is_post_release_main_backmerge; then
    echo "${context_label}-readiness: OK (post-release main back-merge: ${backmerge_detail})"
    exit 0
  fi
fi

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
      | scripts/verify-ci-rubric-enforced.sh \
      | scripts/verify-deterministic-builds.sh \
      | scripts/verify-release-draft-target.sh \
      | scripts/verify-release-pr-postcondition.sh \
      | scripts/verify-release-publish-postcondition.sh \
      | scripts/verify-release-readiness.sh \
      | scripts/verify-release-train-promotion.sh \
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
