#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="${repo_root}/scripts/pack-dev-archive.sh"

fail() {
  echo "test-pack-dev-archive: FAIL ($*)" >&2
  exit 1
}

scratch="$(mktemp -d)"
cleanup() {
  chmod -R u+rwX "${scratch}" 2>/dev/null || true
  rm -rf "${scratch}"
}
trap cleanup EXIT

# Stub npm so the test never installs or builds: the archive path only needs
# `npm pack` to emit the expected tarball name into the destination directory.
bin_dir="${scratch}/bin"
mkdir -p "${bin_dir}"
cat > "${bin_dir}/npm" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "pack" ]]; then
  dest=""
  shift
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pack-destination) dest="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  [[ -n "${dest}" ]] || exit 1
  version="$(node -e "console.log(require('./package.json').version)")"
  printf 'stub-package\n' > "${dest}/theory-cloud-facetheory-${version}.tgz"
fi
exit 0
SH
chmod +x "${bin_dir}/npm"

run_pack() {
  PATH="${bin_dir}:${PATH}" bash "${script_path}" "$@"
}

# Ordinary: a fresh private output directory still builds and checksums.
out_dir="${scratch}/clean-out"
if ! run_pack --output-dir "${out_dir}" --skip-build >"${scratch}/clean.log" 2>&1; then
  cat "${scratch}/clean.log" >&2
  fail "clean-tree dev archive build failed"
fi
archive_path="$(sed -n 's/^  archive[[:space:]]*: //p' "${scratch}/clean.log" | tail -1)"
[[ -n "${archive_path}" ]] || fail "clean run did not report an archive path"
[[ -f "${archive_path}" ]] || fail "clean run did not produce the archive"
[[ -f "${archive_path}.sha256" ]] || fail "clean run did not produce the checksum sidecar"
archive_basename="$(basename "${archive_path}")"
if command -v sha256sum >/dev/null 2>&1; then
  ( cd "${out_dir}" && sha256sum --check "${archive_basename}.sha256" >/dev/null ) || fail "checksum sidecar does not verify"
fi

# Negative: a precreated symlink at the output path must be refused with no
# write through the symlink to an arbitrary target.
victim_dir="${scratch}/victim"
mkdir -p "${victim_dir}"
ln -s "${victim_dir}" "${scratch}/link-out"
if run_pack --output-dir "${scratch}/link-out" --skip-build >"${scratch}/link.log" 2>&1; then
  fail "precreated symlink output directory was accepted"
fi
grep -Fq "symlink" "${scratch}/link.log" || fail "symlink rejection did not name the reason"
if [[ -n "$(ls -A "${victim_dir}")" ]]; then
  fail "symlinked output directory received an arbitrary write"
fi

# Negative: a group/world-writable output directory must be refused.
open_dir="${scratch}/open-out"
mkdir -p "${open_dir}"
chmod 0777 "${open_dir}"
if run_pack --output-dir "${open_dir}" --skip-build >"${scratch}/open.log" 2>&1; then
  fail "group/world-writable output directory was accepted"
fi

# Negative: a precreated symlink at the checksum sidecar path must not redirect
# the checksum write to an arbitrary target file.
safe_dir="${scratch}/safe-out"
mkdir -p "${safe_dir}"
chmod 0700 "${safe_dir}"
victim_file="${scratch}/victim-sha256"
: > "${victim_file}"
ln -s "${victim_file}" "${safe_dir}/${archive_basename}.sha256"
if run_pack --output-dir "${safe_dir}" --skip-build >"${scratch}/sha.log" 2>&1; then
  fail "precreated checksum symlink was accepted"
fi
if [[ -s "${victim_file}" ]]; then
  fail "checksum write followed a precreated symlink"
fi

echo "test-pack-dev-archive: PASS"
