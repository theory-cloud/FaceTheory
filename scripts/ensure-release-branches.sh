#!/usr/bin/env bash
set -euo pipefail

repo_root="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "${repo_root}"

remote="${GIT_REMOTE:-origin}"
main_branch="${MAIN_BRANCH:-main}"
read -r -a target_branches <<< "${TARGET_BRANCHES:-premain staging}"
publish="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --publish)
      publish="true"
      ;;
    --dry-run)
      publish="false"
      ;;
    --remote)
      shift
      remote="${1:-}"
      ;;
    --main-branch)
      shift
      main_branch="${1:-}"
      ;;
    --targets)
      shift
      read -r -a target_branches <<< "${1:-}"
      ;;
    *)
      echo "ensure-release-branches: FAIL (unknown argument: $1)"
      exit 1
      ;;
  esac
  shift || true
done

if [[ ! -d .git ]]; then
  echo "ensure-release-branches: FAIL (repo root ${repo_root} is not a git repository)"
  exit 1
fi

if [[ -z "${remote}" ]]; then
  echo "ensure-release-branches: FAIL (missing remote)"
  exit 1
fi

if [[ -z "${main_branch}" ]]; then
  echo "ensure-release-branches: FAIL (missing main branch)"
  exit 1
fi

if [[ "${#target_branches[@]}" -eq 0 ]]; then
  echo "ensure-release-branches: FAIL (no target branches configured)"
  exit 1
fi

if ! git remote get-url "${remote}" >/dev/null 2>&1; then
  echo "ensure-release-branches: FAIL (missing git remote ${remote})"
  exit 1
fi

if ! git fetch "${remote}" "${main_branch}" --force >/dev/null 2>&1; then
  echo "ensure-release-branches: FAIL (unable to fetch ${remote}/${main_branch})"
  exit 1
fi

source_ref="refs/remotes/${remote}/${main_branch}"
if ! git show-ref --verify --quiet "${source_ref}"; then
  echo "ensure-release-branches: FAIL (missing ${source_ref})"
  exit 1
fi

source_commit="$(git rev-parse "${source_ref}")"
created=()
existing=()
would_create=()

for target_branch in "${target_branches[@]}"; do
  if [[ -z "${target_branch}" ]]; then
    continue
  fi

  if [[ "${target_branch}" == "${main_branch}" ]]; then
    echo "ensure-release-branches: SKIP (${target_branch} matches ${main_branch})"
    existing+=("${target_branch}")
    continue
  fi

  existing_commit="$(git ls-remote --heads "${remote}" "${target_branch}" | awk 'NR == 1 { print $1 }')"
  if [[ -n "${existing_commit}" ]]; then
    echo "ensure-release-branches: exists ${target_branch} (${existing_commit})"
    existing+=("${target_branch}")
    continue
  fi

  if [[ "${publish}" == "true" ]]; then
    git push "${remote}" "${source_ref}:refs/heads/${target_branch}" >/dev/null
    echo "ensure-release-branches: created ${target_branch} from ${main_branch} (${source_commit})"
    created+=("${target_branch}")
  else
    echo "ensure-release-branches: would create ${target_branch} from ${main_branch} (${source_commit})"
    would_create+=("${target_branch}")
  fi
done

created_summary="${created[*]:-none}"
existing_summary="${existing[*]:-none}"
would_create_summary="${would_create[*]:-none}"
mode="dry-run"
if [[ "${publish}" == "true" ]]; then
  mode="publish"
fi

echo "ensure-release-branches: PASS (${mode}; source=${main_branch}@${source_commit}; created=${created_summary}; existing=${existing_summary}; would_create=${would_create_summary})"
