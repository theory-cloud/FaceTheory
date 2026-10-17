#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stage_script="${repo_root}/scripts/stage_theorycloud_facetheory_subtree.sh"
sync_script="${repo_root}/scripts/sync_theorycloud_facetheory_subtree.sh"

fail() {
  echo "test-theorycloud-subtree-destination: FAIL ($*)" >&2
  exit 1
}

scratch="$(mktemp -d)"
cleanup() {
  chmod -R u+rwX "${scratch}" 2>/dev/null || true
  rm -rf "${scratch}"
}
trap cleanup EXIT

# Ordinary: a clean local staging plus sync dry run succeeds without executing
# AWS.
out_dir="${scratch}/out"
if ! THEORYCLOUD_S3_SYNC_DRY_RUN=true bash "${sync_script}" --stage lab --output "${out_dir}" >"${scratch}/dry.log" 2>&1; then
  cat "${scratch}/dry.log" >&2
  fail "clean local staging + dry run failed"
fi
grep -Fq "DRY RUN" "${scratch}/dry.log" || fail "dry run banner missing"
grep -Fq "command=aws s3 sync" "${scratch}/dry.log" || fail "dry run did not print the sync plan"
[[ -f "${out_dir}/facetheory/source-manifest.json" ]] || fail "staging did not produce a manifest"

# Negative: a precreated symlink destination must be refused with no write
# through the symlink to an arbitrary target.
victim="${scratch}/victim"
mkdir -p "${victim}"
ln -s "${victim}" "${scratch}/link-out"
if THEORYCLOUD_S3_SYNC_DRY_RUN=true bash "${sync_script}" --stage lab --output "${scratch}/link-out" >"${scratch}/link.log" 2>&1; then
  fail "symlinked staging destination was accepted"
fi
grep -Fq "symlink" "${scratch}/link.log" || fail "symlink rejection did not name the reason"
[[ -z "$(ls -A "${victim}")" ]] || fail "symlinked staging destination received an arbitrary write"

# Negative: the direct stage helper (also reached through the Makefile target)
# must validate the RAW --output path before resolving it, so a precreated
# symlink destination is refused with no write through to the arbitrary target.
stage_victim="${scratch}/stage-victim"
mkdir -p "${stage_victim}"
ln -s "${stage_victim}" "${scratch}/stage-link-out"
if bash "${stage_script}" --output "${scratch}/stage-link-out" --repo-root "${repo_root}" >"${scratch}/stage-link.log" 2>&1; then
  fail "direct staging accepted a symlinked output destination"
fi
grep -Fq "symlink" "${scratch}/stage-link.log" || fail "direct stage symlink rejection did not name the reason"
[[ -z "$(ls -A "${stage_victim}")" ]] || fail "direct staging wrote through a symlinked destination"

# Ordinary: the direct stage helper still stages into a clean private
# destination.
stage_ok="${scratch}/stage-ok"
if ! bash "${stage_script}" --output "${stage_ok}" --repo-root "${repo_root}" >"${scratch}/stage-ok.log" 2>&1; then
  cat "${scratch}/stage-ok.log" >&2
  fail "direct staging into a clean private destination failed"
fi
[[ -f "${stage_ok}/facetheory/source-manifest.json" ]] || fail "direct staging did not produce a manifest"

# Negative: a group/world-writable destination must be refused.
open_dir="${scratch}/open-out"
mkdir -p "${open_dir}"
chmod 0777 "${open_dir}"
if THEORYCLOUD_S3_SYNC_DRY_RUN=true bash "${sync_script}" --stage lab --output "${open_dir}" >"${scratch}/open.log" 2>&1; then
  fail "group/world-writable staging destination was accepted"
fi

# Negative: a cleanup failure clearing a previous subtree must be fatal.
cleanup_dir="${scratch}/cleanup-out"
mkdir -p "${cleanup_dir}/facetheory/locked"
chmod 0700 "${cleanup_dir}"
printf 'x\n' > "${cleanup_dir}/facetheory/locked/file"
chmod 0500 "${cleanup_dir}/facetheory/locked"
if bash "${stage_script}" --output "${cleanup_dir}" --repo-root "${repo_root}" >"${scratch}/cleanup.log" 2>&1; then
  fail "cleanup failure clearing the previous subtree was not fatal"
fi
grep -Fq "unable to clear the previous staged subtree" "${scratch}/cleanup.log" || fail "cleanup failure was not reported"
chmod -R u+rwX "${cleanup_dir}" 2>/dev/null || true

echo "test-theorycloud-subtree-destination: PASS"
