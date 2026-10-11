#!/usr/bin/env bash
# pack-dev-archive.sh
#
# Builds a TEMPORARY LOCAL development archive of @theory-cloud/facetheory from
# the current working tree. Used for pre-lab handoff to TheoryMCP development
# (e.g. the Agent Import & Completion Wizard milestone) so consumers can vendor
# an in-progress FaceTheory build without waiting for a release.
#
# Hard constraints (this script must not break them):
#   * No GitHub Release. No npm publish. No version bump. No Release Please PR.
#     No tag creation. No release asset publication.
#   * No AWS/cloud/IAM/DNS mutation. No deploy. No live receipts.
#   * No secrets, credentials, signed URLs, or production-like data are added
#     to the archive or the surrounding artifacts.
#
# Output:
#   <output-dir>/theory-cloud-facetheory-<version>-dev-<short-sha>.tgz
#   <output-dir>/theory-cloud-facetheory-<version>-dev-<short-sha>.tgz.sha256
#
# Defaults:
#   --output-dir defaults to a private per-run temporary directory (mode 0700)
#
# Usage:
#   scripts/pack-dev-archive.sh [--output-dir <path>] [--skip-build]
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

REPO_ROOT="$(pwd)"
OUTPUT_DIR=""
SKIP_BUILD=0

fail() {
  echo "pack-dev-archive: FAIL ($*)" >&2
  exit 1
}

file_owner() {
  local owner
  if owner="$(stat -c '%u' "$1" 2>/dev/null)"; then
    printf '%s\n' "${owner}"
  else
    stat -f '%u' "$1"
  fi
}

file_mode() {
  local mode
  if mode="$(stat -c '%a' "$1" 2>/dev/null)"; then
    printf '%s\n' "${mode}"
  else
    stat -f '%Lp' "$1"
  fi
}

# Fail closed unless an existing output directory is a real directory owned by
# the current user with no group/other write bit. A precreated symlink, a
# foreign owner, or a shared-writable directory must be rejected before any
# archive or checksum byte is written.
validate_output_dir() {
  local dir="$1"
  if [[ -L "${dir}" ]]; then
    fail "output directory is a symlink: ${dir}"
  fi
  if [[ ! -e "${dir}" ]]; then
    return 0
  fi
  if [[ ! -d "${dir}" ]]; then
    fail "output path exists and is not a directory: ${dir}"
  fi
  local owner mode
  owner="$(file_owner "${dir}")"
  mode="$(file_mode "${dir}")"
  if [[ "${owner}" != "$(id -u)" ]]; then
    fail "output directory is not owned by the current user: ${dir} (uid ${owner})"
  fi
  if (( 8#${mode} & 8#022 )); then
    fail "output directory is group/world writable: ${dir} (mode ${mode})"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      if [[ $# -lt 2 ]]; then
        echo "pack-dev-archive: missing value for --output-dir" >&2
        exit 2
      fi
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *)
      echo "pack-dev-archive: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "${OUTPUT_DIR}" ]]; then
  OUTPUT_DIR="$(mktemp -d -t facetheory-dev-archives-XXXXXX)"
fi

if [[ ! -d "ts" ]]; then
  fail "expected ts/ directory in repo root"
fi

if [[ ! -f "ts/package.json" ]]; then
  fail "missing ts/package.json"
fi

PKG_VERSION="$(node -e "console.log(require('./ts/package.json').version)")"
if [[ -z "${PKG_VERSION}" ]]; then
  fail "could not read ts/package.json version"
fi

if command -v git >/dev/null 2>&1 && [[ -d ".git" ]]; then
  SHORT_SHA="$(git rev-parse --short=12 HEAD)"
  if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
    SHORT_SHA="${SHORT_SHA}-dirty"
  fi
else
  SHORT_SHA="nogit"
fi

ARCHIVE_BASENAME="theory-cloud-facetheory-${PKG_VERSION}-dev-${SHORT_SHA}.tgz"

validate_output_dir "${OUTPUT_DIR}"
mkdir -m 700 -p "${OUTPUT_DIR}"
validate_output_dir "${OUTPUT_DIR}"
OUTPUT_DIR="$(cd "${OUTPUT_DIR}" && pwd)"

ARCHIVE_PATH="${OUTPUT_DIR}/${ARCHIVE_BASENAME}"
SHA_PATH="${ARCHIVE_PATH}.sha256"

if [[ -L "${ARCHIVE_PATH}" || -L "${SHA_PATH}" ]]; then
  fail "refusing to write through a symlinked archive or checksum path in ${OUTPUT_DIR}"
fi

if [[ "${SKIP_BUILD}" -eq 0 ]]; then
  echo "pack-dev-archive: running ts build"
  ( cd ts && npm run build )
fi

# Use npm pack to honour the published "files" allowlist, then rename so the
# dev archive is visibly distinct from a real release tarball.
TMP_PACK_DIR="$(mktemp -d -t facetheory-dev-pack-XXXXXX)"
trap 'rm -rf "${TMP_PACK_DIR}"' EXIT

echo "pack-dev-archive: running npm pack into ${TMP_PACK_DIR}"
( cd ts && npm pack --pack-destination "${TMP_PACK_DIR}" >/dev/null )

PACK_OUTPUT="${TMP_PACK_DIR}/theory-cloud-facetheory-${PKG_VERSION}.tgz"
if [[ ! -f "${PACK_OUTPUT}" ]]; then
  fail "npm pack did not produce ${PACK_OUTPUT}"
fi

mv -f "${PACK_OUTPUT}" "${ARCHIVE_PATH}"

# Write the sha256 sidecar through a fresh private temp file and rename it into
# place, so a symlink precreated at the checksum path cannot redirect the write.
if command -v sha256sum >/dev/null 2>&1; then
  SHA_TOOL=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  SHA_TOOL=(shasum -a 256)
else
  SHA_TOOL=()
fi

if [[ ${#SHA_TOOL[@]} -gt 0 ]]; then
  CHECKSUM_TMP="$(mktemp "${OUTPUT_DIR}/.${ARCHIVE_BASENAME}.sha256.XXXXXX")"
  ( cd "${OUTPUT_DIR}" && "${SHA_TOOL[@]}" "${ARCHIVE_BASENAME}" > "${CHECKSUM_TMP}" )
  mv -f "${CHECKSUM_TMP}" "${SHA_PATH}"
else
  echo "pack-dev-archive: WARN (no sha256sum or shasum available; skipping checksum)" >&2
fi

cat <<EOF
pack-dev-archive: OK
  package version       : ${PKG_VERSION}
  source commit         : ${SHORT_SHA}
  archive               : ${ARCHIVE_PATH}
  checksum              : ${SHA_PATH}

Verify (the sidecar stores only the basename, so cd into the output dir):
  ( cd "${OUTPUT_DIR}" && sha256sum --check "${ARCHIVE_BASENAME}.sha256" )

This archive is a TEMPORARY LOCAL development handoff. It is not a release.
Do NOT publish, tag, deploy, or attach it to a GitHub Release.
EOF
