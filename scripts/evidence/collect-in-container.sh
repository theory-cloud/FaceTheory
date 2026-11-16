#!/usr/bin/env bash
# Purpose: produce one gate's evidence record inside the digest-pinned Linux
# container its proof profile declares.
#
# A floor profile is a claim about a Linux environment that the macOS producing
# host cannot satisfy, so the collector runs inside the container that profile
# names. The image is pinned by digest in scripts/evidence/validation-gates.json
# and is selected from there, never from an argument: the record and the image
# that produced it cannot drift apart.
#
# The container gets a read-only mount of this checkout and copies it to a
# writable tree of its own, so nothing but the finished record reaches the host
# worktree. The copy is byte-faithful for every tracked input; the excluded
# paths (node_modules, dist, coverage) are ignored build state, so the record
# produced here verifies against the host checkout.
#
# Usage: scripts/evidence/collect-in-container.sh --gate <gate-id> --profile <profile-id>
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${repo_root}"

gate=""
profile=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --gate)
      gate="${2:-}"
      shift 2
      ;;
    --profile)
      profile="${2:-}"
      shift 2
      ;;
    --help|-h)
      cat <<'USAGE'
usage: scripts/evidence/collect-in-container.sh --gate <gate-id> --profile <profile-id>

Produces the named gate's record for a container-bound proof profile. The image
digest, platform and profile declarations come from
scripts/evidence/validation-gates.json.
USAGE
      exit 0
      ;;
    *)
      echo "collect-in-container: FAIL (unknown argument: $1)" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${gate}" || -z "${profile}" ]]; then
  echo "collect-in-container: FAIL (--gate and --profile are required)" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "collect-in-container: BLOCKED (docker is not on PATH)" >&2
  exit 2
fi

read -r image container_platform evidence_directory local_log_directory <<EOF
$(python3 - "${gate}" "${profile}" <<'PY'
import json
import sys
from pathlib import Path

gate, profile = sys.argv[1], sys.argv[2]
registry = json.loads(Path("scripts/evidence/validation-gates.json").read_text(encoding="utf-8"))
entry = registry.get("gates", {}).get(gate)
if entry is None:
    raise SystemExit(f"collect-in-container: FAIL (unknown gate {gate!r})")
if profile not in (entry.get("profiles") or ["default"]):
    raise SystemExit(f"collect-in-container: FAIL (gate {gate!r} does not declare profile {profile!r})")
declaration = registry.get("proofProfiles", {}).get(profile) or {}
image = str(declaration.get("image") or "")
platform = str(declaration.get("containerPlatform") or "")
if not image.startswith("sha256:") and "@sha256:" not in image:
    raise SystemExit(f"collect-in-container: FAIL (profile {profile!r} has no digest-pinned image)")
if not platform:
    raise SystemExit(f"collect-in-container: FAIL (profile {profile!r} has no containerPlatform)")
print(image, platform, registry["evidenceDirectory"].strip("/"), registry["localLogDirectory"].strip("/"))
PY
)
EOF

if [[ -z "${image}" || -z "${container_platform}" || -z "${evidence_directory}" ]]; then
  echo "collect-in-container: FAIL (could not resolve the profile's image from the registry)" >&2
  exit 1
fi

npm_cache="${FACETHEORY_CONTAINER_NPM_CACHE:-${HOME}/.cache/facetheory-evidence/npm}"
mkdir -p "${npm_cache}"
mkdir -p "${repo_root}/${evidence_directory}" "${repo_root}/${local_log_directory}"

# The container runs as root. Hand the finished records back with the checkout's
# ownership so the host worktree stays writable and the records commit cleanly.
host_uid="$(id -u)"
host_gid="$(id -g)"

echo "collect-in-container: gate=${gate} profile=${profile} image=${image} platform=${container_platform}" >&2

docker run --rm \
  --platform "${container_platform}" \
  -e CI=1 \
  -e "EVIDENCE_GATE=${gate}" \
  -e "EVIDENCE_PROFILE=${profile}" \
  -e "EVIDENCE_DIRECTORY=${evidence_directory}" \
  -e "EVIDENCE_LOCAL_LOGS=${local_log_directory}" \
  -e "HOST_UID=${host_uid}" \
  -e "HOST_GID=${host_gid}" \
  -v "${repo_root}:/src:ro" \
  -v "${repo_root}/${evidence_directory}:/out" \
  -v "${repo_root}/${local_log_directory}:/out-local" \
  -v "${npm_cache}:/root/.npm" \
  "${image}" \
  bash -lc '
    set -euo pipefail

    work=/work
    rm -rf "${work}"
    mkdir -p "${work}"

    # Byte-faithful copy of every tracked input; ignored build state is skipped
    # so the copy stays small and the host tree is never written.
    tar -C /src -cf - \
      --exclude=./node_modules \
      --exclude=./ts/node_modules \
      --exclude=./infra/apptheory-ssr-site/node_modules \
      --exclude=./infra/apptheory-ssg-isr-site/node_modules \
      --exclude=./ts/coverage \
      --exclude=./ts/dist \
      --exclude=./dist \
      --exclude=./docs/_site \
      --exclude=./.git \
      . | tar -C "${work}" -xf -

    cd "${work}"

    # The checkout is a git worktree whose .git file points at the parent
    # repository, which is not mounted here. A local repository over the same
    # file set gives the collector its git-backed input enumeration and a clean
    # tree; the record binds content digests, not commits.
    git init -q .
    git -c user.email=evidence@facetheory.invalid -c user.name=evidence \
      -c commit.gpgsign=false add -A
    git -c user.email=evidence@facetheory.invalid -c user.name=evidence \
      -c commit.gpgsign=false commit -qm "evidence snapshot"

    bash scripts/evidence/collect.sh --gate "${EVIDENCE_GATE}" --profile "${EVIDENCE_PROFILE}"

    cp -a "${work}/${EVIDENCE_DIRECTORY}/." /out/

    # The record references its command log by digest. Keep the log where the
    # record points at it, so a reviewer can read what actually ran instead of
    # trusting a digest alone. Ignored by git; never part of a records commit.
    if [[ -d "${work}/${EVIDENCE_LOCAL_LOGS}" ]]; then
      cp -a "${work}/${EVIDENCE_LOCAL_LOGS}/." /out-local/
    fi

    chown -R "${HOST_UID:-0}:${HOST_GID:-0}" /out
  '

echo "collect-in-container: wrote ${evidence_directory}/${gate}/${profile}.json" >&2
