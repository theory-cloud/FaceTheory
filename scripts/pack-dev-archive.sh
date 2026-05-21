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
#   --output-dir defaults to /tmp/theorycloud-facetheory-dev-archives/
#
# Usage:
#   scripts/pack-dev-archive.sh [--output-dir <path>] [--skip-build]
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

REPO_ROOT="$(pwd)"
OUTPUT_DIR="/tmp/theorycloud-facetheory-dev-archives"
SKIP_BUILD=0

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

if [[ ! -d "ts" ]]; then
  echo "pack-dev-archive: FAIL (expected ts/ directory in repo root)" >&2
  exit 1
fi

if [[ ! -f "ts/package.json" ]]; then
  echo "pack-dev-archive: FAIL (missing ts/package.json)" >&2
  exit 1
fi

PKG_VERSION="$(node -e "console.log(require('./ts/package.json').version)")"
if [[ -z "${PKG_VERSION}" ]]; then
  echo "pack-dev-archive: FAIL (could not read ts/package.json version)" >&2
  exit 1
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
ARCHIVE_PATH="${OUTPUT_DIR}/${ARCHIVE_BASENAME}"
SHA_PATH="${ARCHIVE_PATH}.sha256"

mkdir -p "${OUTPUT_DIR}"

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
  echo "pack-dev-archive: FAIL (npm pack did not produce ${PACK_OUTPUT})" >&2
  ls -la "${TMP_PACK_DIR}" >&2 || true
  exit 1
fi

mv -f "${PACK_OUTPUT}" "${ARCHIVE_PATH}"

# Compute sha256sum next to the archive.
if command -v sha256sum >/dev/null 2>&1; then
  ( cd "${OUTPUT_DIR}" && sha256sum "${ARCHIVE_BASENAME}" > "${ARCHIVE_BASENAME}.sha256" )
elif command -v shasum >/dev/null 2>&1; then
  ( cd "${OUTPUT_DIR}" && shasum -a 256 "${ARCHIVE_BASENAME}" > "${ARCHIVE_BASENAME}.sha256" )
else
  echo "pack-dev-archive: WARN (no sha256sum or shasum available; skipping checksum)" >&2
fi

cat <<EOF
pack-dev-archive: OK
  package version       : ${PKG_VERSION}
  source commit         : ${SHORT_SHA}
  archive               : ${ARCHIVE_PATH}
  checksum              : ${SHA_PATH}

This archive is a TEMPORARY LOCAL development handoff. It is not a release.
Do NOT publish, tag, deploy, or attach it to a GitHub Release.
EOF
