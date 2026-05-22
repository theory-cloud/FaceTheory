#!/usr/bin/env bash
set -euo pipefail

source_ref="${1:-}"
expected_commit="${2:-}"
remote="${GIT_REMOTE:-origin}"

if [[ -z "${source_ref}" ]]; then
  echo "release-source-checkout: FAIL (missing source ref)" >&2
  exit 1
fi
if [[ -n "${expected_commit}" && ! "${expected_commit}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "release-source-checkout: FAIL (expected commit must be a full 40-character SHA)" >&2
  exit 1
fi

fetch_ref=""
case "${source_ref}" in
  refs/heads/*)
    echo "release-source-checkout: FAIL (mutable branch ref ${source_ref} is not allowed)" >&2
    exit 1
    ;;
  refs/*)
    if [[ "${source_ref}" == refs/tags/* ]]; then
      tag_name="${source_ref#refs/tags/}"
      if [[ -z "${tag_name}" ]] || ! git check-ref-format "refs/tags/${tag_name}" >/dev/null 2>&1; then
        echo "release-source-checkout: FAIL (invalid tag ref ${source_ref})" >&2
        exit 1
      fi
      fetch_ref="${source_ref}"
    else
      echo "release-source-checkout: FAIL (unsupported ref ${source_ref})" >&2
      exit 1
    fi
    ;;
  *)
    if [[ "${source_ref}" =~ ^[0-9a-f]{40}$ ]]; then
      fetch_ref="${source_ref}"
      if [[ -z "${expected_commit}" ]]; then
        expected_commit="${source_ref}"
      fi
    else
      if ! git check-ref-format "refs/tags/${source_ref}" >/dev/null 2>&1; then
        echo "release-source-checkout: FAIL (source ref must be an immutable commit or release tag)" >&2
        exit 1
      fi
      fetch_ref="refs/tags/${source_ref}"
    fi
    ;;
esac

# Keep the workspace tokenless. actions/checkout ran earlier only for trusted
# workflow scripts with persist-credentials:false; this manual fetch intentionally
# avoids a dynamic actions/checkout ref so privileged release jobs do not use the
# checkout action to materialize untrusted pull-request code.
git fetch --quiet --force --depth=1 "${remote}" "${fetch_ref}"
git checkout --quiet --detach --force FETCH_HEAD

actual_commit="$(git rev-parse HEAD)"
if [[ -n "${expected_commit}" && "${actual_commit}" != "${expected_commit}" ]]; then
  echo "release-source-checkout: FAIL (${source_ref} resolved to ${actual_commit})" >&2
  exit 1
fi

echo "release-source-checkout: checked out ${actual_commit}"
