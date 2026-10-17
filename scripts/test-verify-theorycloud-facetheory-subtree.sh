#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stage_script="${repo_root}/scripts/stage_theorycloud_facetheory_subtree.sh"
verify_script="${repo_root}/scripts/verify_theorycloud_facetheory_subtree.sh"

fail() {
  echo "test-verify-theorycloud-facetheory-subtree: FAIL ($*)" >&2
  exit 1
}

scratch="$(mktemp -d)"
cleanup() {
  chmod -R u+rwX "${scratch}" 2>/dev/null || true
  rm -rf "${scratch}"
}
trap cleanup EXIT

stage_into() {
  bash "${stage_script}" --output "$1" --repo-root "${repo_root}"
}

verify_at() {
  bash "${verify_script}" "$1" --repo-root "${repo_root}"
}

# Ordinary: a subtree staged from the committed revision verifies.
out_dir="${scratch}/clean"
if ! stage_into "${out_dir}" >"${scratch}/stage.log" 2>&1; then
  cat "${scratch}/stage.log" >&2
  fail "clean staging failed"
fi
if ! verify_at "${out_dir}" >"${scratch}/verify.log" 2>&1; then
  cat "${scratch}/verify.log" >&2
  fail "committed matching subtree did not verify"
fi

subtree="${out_dir}/facetheory"
mapfile -t staged_files < <(cd "${subtree}" && find . -type f ! -name source-manifest.json)
[[ "${#staged_files[@]}" -gt 0 ]] || fail "no staged files to exercise"
victim_rel="${staged_files[0]#./}"

# Negative: tampering with a staged byte must be denied against source_revision,
# even though the file path name is unchanged.
printf '\nTAMPERED\n' >> "${subtree}/${victim_rel}"
if verify_at "${out_dir}" >"${scratch}/tamper.log" 2>&1; then
  fail "tampered staged content was accepted"
fi
grep -Fq "does not match source_revision blob" "${scratch}/tamper.log" || fail "tamper was not reported as a blob mismatch"

# Negative: replacing a staged regular file with a symlink must be denied.
link_out="${scratch}/link"
stage_into "${link_out}" >/dev/null 2>&1 || fail "clean staging for symlink case failed"
ln -sfn "README.md" "${link_out}/facetheory/${victim_rel}"
if verify_at "${link_out}" >"${scratch}/symlink.log" 2>&1; then
  fail "staged symlink was accepted"
fi
grep -Fq "is a symlink" "${scratch}/symlink.log" || fail "staged symlink was not reported"

echo "test-verify-theorycloud-facetheory-subtree: PASS"
