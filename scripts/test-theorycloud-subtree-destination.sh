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
  rm -rf "${scratch}"
}
trap cleanup EXIT

echo "test-theorycloud-subtree-destination: running as uid=$(id -u)"

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

# Negative: a cleanup failure clearing a previous subtree must be fatal. The
# failure is injected deterministically through a temporary sitecustomize module
# loaded only for the child stage-helper process; permission bits are never used
# because UID 0 bypasses directory DAC, which would make this control depend on
# the caller's privileges. The stage helper must keep starting Python with normal
# site initialization: python -E/-I/-S would suppress sitecustomize, and the
# marker assertions below must then fail this test visibly instead of passing it.
cleanup_dir="${scratch}/cleanup-out"
cleanup_target="${cleanup_dir}/facetheory"
mkdir -p "${cleanup_target}/previous"
printf 'x\n' > "${cleanup_target}/previous/file"
inject_dir="${scratch}/sitecustomize-inject"
probe_markers="${scratch}/inject-delegation-markers"
stage_markers="${scratch}/inject-stage-markers"
mkdir -p "${inject_dir}" "${probe_markers}" "${stage_markers}"
cat > "${inject_dir}/sitecustomize.py" <<'PY_INJECT'
import os
import shutil

_original_rmtree = shutil.rmtree
_target = os.path.realpath(os.environ["SUBTREE_TEST_CLEANUP_TARGET"])
_marker_dir = os.environ["SUBTREE_TEST_MARKER_DIR"]


def _write_marker(name, content):
    with open(os.path.join(_marker_dir, name), "w", encoding="utf-8") as handle:
        handle.write(content + "\n")


_write_marker("sitecustomize-loaded.marker", "sitecustomize loaded")


def rmtree(path, *args, **kwargs):
    resolved = os.path.realpath(os.fspath(path))
    if resolved == _target:
        _write_marker("rmtree-target-fired.marker", resolved)
        raise OSError(f"injected rmtree failure for {resolved}")
    return _original_rmtree(path, *args, **kwargs)


shutil.rmtree = rmtree
PY_INJECT

# The injector must delegate every nonmatching removal to the real rmtree and
# must not fire for a path outside the previous-subtree target.
delegate_dir="${scratch}/delegate-probe"
mkdir -p "${delegate_dir}"
PYTHONPATH="${inject_dir}" \
  SUBTREE_TEST_CLEANUP_TARGET="${cleanup_target}" \
  SUBTREE_TEST_MARKER_DIR="${probe_markers}" \
  python3 - "${delegate_dir}" <<'PY_DELEGATE'
import shutil
import sys

shutil.rmtree(sys.argv[1])
PY_DELEGATE
[[ -f "${probe_markers}/sitecustomize-loaded.marker" ]] || fail "fault injector was not loaded for the delegation probe"
[[ ! -e "${delegate_dir}" ]] || fail "fault injector did not delegate a nonmatching rmtree"
[[ ! -f "${probe_markers}/rmtree-target-fired.marker" ]] || fail "fault injector fired for a nonmatching path"

if PYTHONPATH="${inject_dir}" \
  SUBTREE_TEST_CLEANUP_TARGET="${cleanup_target}" \
  SUBTREE_TEST_MARKER_DIR="${stage_markers}" \
  bash "${stage_script}" --output "${cleanup_dir}" --repo-root "${repo_root}" >"${scratch}/cleanup.log" 2>&1; then
  fail "cleanup failure clearing the previous subtree was not fatal"
fi
grep -Fq "unable to clear the previous staged subtree" "${scratch}/cleanup.log" || fail "cleanup failure was not reported"
[[ -f "${stage_markers}/sitecustomize-loaded.marker" ]] || fail "fault injector did not load for the stage helper, so cleanup failure was not proven"
[[ -d "${cleanup_target}/previous" ]] || fail "failed restage cleared the previous subtree"
[[ ! -f "${cleanup_target}/source-manifest.json" ]] || fail "failed restage produced a success manifest"
expected_target="$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "${cleanup_target}")"
grep -Fxq -- "${expected_target}" "${stage_markers}/rmtree-target-fired.marker" 2>/dev/null \
  || fail "fault injector did not fire for the resolved previous-subtree target"

echo "test-theorycloud-subtree-destination: PASS"
