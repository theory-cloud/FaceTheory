#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<EOF_USAGE
Usage:
  bash scripts/sync_theorycloud_facetheory_subtree.sh [--stage STAGE] [--source-s3-uri URI] [--output DIR]

Environment:
  THEORYCLOUD_STAGE                          Stage name. Default: lab
  THEORYCLOUD_FACETHEORY_SUBTREE_OUTPUT_DIR  Staging root. Default: a private per-user temp dir (mode 0700)
  THEORYCLOUD_FACETHEORY_SOURCE_S3_URI       Optional override for the subtree destination S3 URI
  KT_SOURCE_S3_URI                           Alternate override for the subtree destination S3 URI
  THEORYCLOUD_S3_SYNC_DELETE                 Default: true. When true, prune objects under theorycloud/facetheory/
  THEORYCLOUD_S3_SYNC_DRY_RUN                Default: false. When true, print the sync plan without calling AWS
EOF_USAGE
}

fail() {
  echo "sync-theorycloud-facetheory-subtree: FAIL ($*)" >&2
  exit 1
}

private_default_output_dir() {
  local base="${TMPDIR:-/tmp}"
  base="${base%/}"
  printf '%s/facetheory-theorycloud-%s' "${base}" "$(id -u)"
}

# The staging destination holds a source of truth that is synced with --delete,
# so it must be a private directory owned by the current user. A precreated
# symlink, a foreign owner, or a shared-writable directory must fail closed.
require_private_dir() {
  local dir="${1%/}"
  if [[ -L "${dir}" ]]; then
    fail "output directory is a symlink: ${dir}"
  fi
  if [[ ! -d "${dir}" ]]; then
    fail "output directory does not exist: ${dir}"
  fi
  if [[ ! -O "${dir}" ]]; then
    fail "output directory is not owned by the current user: ${dir}"
  fi
  local mode
  if ! mode="$(stat -c '%a' "${dir}" 2>/dev/null)"; then
    mode="$(stat -f '%Lp' "${dir}")"
  fi
  if (( 8#${mode} & 8#022 )); then
    fail "output directory is group/world writable: ${dir} (mode ${mode})"
  fi
}

default_source_s3_uri_for_stage() {
  local stage="$1"
  case "${stage}" in
    lab) printf '%s\n' 's3://kt-sources-lab-787107040121/theorycloud/facetheory/' ;;
    live) printf '%s\n' 's3://kt-sources-live-787107040121/theorycloud/facetheory/' ;;
    *) return 1 ;;
  esac
}

require_s3_uri() {
  local value="$1"
  local label="$2"
  if [[ -z "${value}" ]]; then
    fail "missing ${label}"
  fi
  if [[ "${value}" != s3://* ]]; then
    fail "${label} must be an s3:// URI: ${value}"
  fi
}

STAGE="${THEORYCLOUD_STAGE:-lab}"
OUTPUT_DIR="${THEORYCLOUD_FACETHEORY_SUBTREE_OUTPUT_DIR:-$(private_default_output_dir)}"
SOURCE_S3_URI="${THEORYCLOUD_FACETHEORY_SOURCE_S3_URI:-${KT_SOURCE_S3_URI:-}}"
SYNC_DELETE="${THEORYCLOUD_S3_SYNC_DELETE:-true}"
SYNC_DRY_RUN="${THEORYCLOUD_S3_SYNC_DRY_RUN:-false}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage)
      STAGE="$2"
      shift 2
      ;;
    --source-s3-uri)
      SOURCE_S3_URI="$2"
      shift 2
      ;;
    --output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

STAGE="${STAGE,,}"
if [[ -z "${SOURCE_S3_URI}" ]]; then
  SOURCE_S3_URI="$(default_source_s3_uri_for_stage "${STAGE}" || true)"
fi
require_s3_uri "${SOURCE_S3_URI}" "THEORYCLOUD_FACETHEORY_SOURCE_S3_URI"
SOURCE_S3_URI="${SOURCE_S3_URI%/}/"

if [[ -e "${OUTPUT_DIR}" || -L "${OUTPUT_DIR}" ]]; then
  require_private_dir "${OUTPUT_DIR}"
fi

bash "${SCRIPT_DIR}/stage_theorycloud_facetheory_subtree.sh" --output "${OUTPUT_DIR}"

require_private_dir "${OUTPUT_DIR}"

SUBTREE_DIR="${OUTPUT_DIR%/}/facetheory"
if [[ ! -d "${SUBTREE_DIR}" || -L "${SUBTREE_DIR}" ]]; then
  fail "missing a real staged subtree at ${SUBTREE_DIR}; staging helper did not produce facetheory/"
fi
if [[ ! -f "${SUBTREE_DIR}/source-manifest.json" || -L "${SUBTREE_DIR}/source-manifest.json" ]]; then
  fail "missing a regular staged provenance manifest at ${SUBTREE_DIR}/source-manifest.json"
fi

sync_flags=()
if [[ "${SYNC_DELETE}" == "true" ]]; then
  sync_flags+=(--delete)
fi

if [[ "${SYNC_DRY_RUN}" == "true" ]]; then
  echo "sync-theorycloud-facetheory-subtree: DRY RUN"
  echo "stage=${STAGE}"
  echo "source=${SUBTREE_DIR}/"
  echo "destination=${SOURCE_S3_URI}"
  if [[ "${SYNC_DELETE}" == "true" ]]; then
    echo "delete=true"
  else
    echo "delete=false"
  fi
  echo "command=aws s3 sync ${SUBTREE_DIR}/ ${SOURCE_S3_URI} ${sync_flags[*]:-}"
  echo "sync-theorycloud-facetheory-subtree: PASS (dry-run; target=${SOURCE_S3_URI})"
  exit 0
fi

command -v aws >/dev/null 2>&1 || fail "aws CLI is required"

echo "syncing FaceTheory subtree to ${SOURCE_S3_URI}"
if ! aws s3 sync "${SUBTREE_DIR}/" "${SOURCE_S3_URI}" "${sync_flags[@]}"; then
  fail "aws s3 sync failed for ${SOURCE_S3_URI}"
fi

echo "sync-theorycloud-facetheory-subtree: PASS (target=${SOURCE_S3_URI})"
