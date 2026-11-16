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
# Usage: scripts/evidence/collect-all.sh [--dry-run]
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${repo_root}"

# The default profile declares the repository Go pin, and the collector probes
# the Go version it would actually run under, so the pin is selected here rather
# than left to the ambient toolchain.
if [[ -f .go-version ]]; then
  export GOTOOLCHAIN="go$(tr -d '[:space:]' < .go-version)"
fi

dry_run=false
if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=true
fi

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
    echo "would collect gate=${gate} profile=${profile} (${where})"
    continue
  fi
  if [[ "${where}" == "container" ]]; then
    bash scripts/evidence/collect-in-container.sh --gate "${gate}" --profile "${profile}"
  else
    bash scripts/evidence/collect.sh --gate "${gate}" --profile "${profile}"
  fi
done <<<"${pairs}"

if [[ "${dry_run}" == "true" ]]; then
  exit 0
fi

bash scripts/evidence/verify-all.sh
