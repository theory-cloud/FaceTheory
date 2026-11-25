#!/usr/bin/env bash
# Purpose: produce every record the CI verify job checks, on one tree.
#
# Gates that declare a container-bound proof profile are produced inside that
# profile's digest-pinned Linux container; the rest are produced on the
# approved producing host. The order follows the registry, so a dependency
# (`rubric` on `ts-pack`) is always produced before the gate that composes it.
#
# The tree must be committed first: the collector refuses a dirty worktree so a
# record can never describe inputs that were still being edited.
#
# Collection is incremental: a gate/profile pair whose committed record still
# applies to this tree is reused and its commands do not run. `--force` is the
# fresh-run path - it re-executes every gate and profile in the producer each one
# declares instead of reusing an applicable record - and it is the difference
# between this and `scripts/evidence/verify-all.sh`, which reuses records and
# executes nothing at all.
#
# Usage: scripts/evidence/collect-all.sh [--force] [--dry-run]
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${repo_root}"

# The default profile declares the repository Go pin, and the collector probes
# the Go version it would actually run under, so the pin is selected here rather
# than left to the ambient toolchain.
if [[ -f .go-version ]]; then
  export GOTOOLCHAIN="go$(tr -d '[:space:]' < .go-version)"
fi

force=false
dry_run=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      force=true
      shift
      ;;
    --dry-run)
      dry_run=true
      shift
      ;;
    --help|-h)
      cat <<'USAGE'
usage: scripts/evidence/collect-all.sh [--force] [--dry-run]

Produces every gate/profile record this tree needs, in the producer each profile
declares: container-bound profiles in their digest-pinned image through
collect-in-container.sh, host profiles through collect.sh. An applicable record
is reused; --force re-executes every gate and profile instead.
USAGE
      exit 0
      ;;
    *)
      echo "collect-all: FAIL (unknown argument: $1)" >&2
      exit 1
      ;;
  esac
done

pairs="$(python3 - <<'PY'
import json
from pathlib import Path

registry = json.loads(Path("scripts/evidence/validation-gates.json").read_text(encoding="utf-8"))
profiles = registry.get("proofProfiles", {})
for gate_id, gate in registry["gates"].items():
    for profile in gate.get("profiles") or ["default"]:
        container = "container" if (profiles.get(profile) or {}).get("image") else "host"
        print(f"{gate_id}\t{profile}\t{container}")
PY
)"

while IFS=$'\t' read -r gate profile where; do
  [[ -n "${gate}" ]] || continue
  if [[ "${dry_run}" == "true" ]]; then
    if [[ "${force}" == "true" ]]; then
      echo "would re-execute gate=${gate} profile=${profile} (${where})"
    else
      echo "would collect gate=${gate} profile=${profile} (${where})"
    fi
    continue
  fi
  pair_args=(--gate "${gate}" --profile "${profile}")
  if [[ "${force}" == "true" ]]; then
    pair_args+=(--force)
  fi
  if [[ "${where}" == "container" ]]; then
    bash scripts/evidence/collect-in-container.sh "${pair_args[@]}"
  else
    bash scripts/evidence/collect.sh "${pair_args[@]}"
  fi
done <<<"${pairs}"

if [[ "${dry_run}" == "true" ]]; then
  exit 0
fi

bash scripts/evidence/verify-all.sh
