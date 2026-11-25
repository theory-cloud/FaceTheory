#!/usr/bin/env bash
# Purpose: verify every gate's tracked evidence at every proof profile it
# declares, for the candidate tree. This is what CI runs.
#
# Nothing is executed. Each gate/profile pair is verified independently, so one
# missing or stale record fails the run by name and every other gate is still
# reported. A failure names the exact local collection command.
#
# This is the verify path, not the reproduction path: it reuses committed records
# and runs no gate. To re-execute a gate instead, produce the record again with
# `scripts/evidence/collect-all.sh --force` (every gate and profile) or with the
# single pair's own producer - `scripts/evidence/collect-in-container.sh` for a
# container-bound profile, `scripts/evidence/collect.sh` for a host profile -
# each with `--force`.
#
# Usage: scripts/evidence/verify-all.sh
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${repo_root}"

pairs="$(python3 - <<'PY'
import json
from pathlib import Path

registry = json.loads(Path("scripts/evidence/validation-gates.json").read_text(encoding="utf-8"))
for gate_id, gate in registry["gates"].items():
    for profile in gate.get("profiles") or ["default"]:
        print(f"{gate_id}\t{profile}")
PY
)"

failures=0
while IFS=$'\t' read -r gate profile; do
  [[ -n "${gate}" ]] || continue
  if bash scripts/evidence/verify-gate.sh --gate "${gate}" --profile "${profile}"; then
    continue
  fi
  failures=$((failures + 1))
done <<<"${pairs}"

if [[ "${failures}" -gt 0 ]]; then
  echo "" >&2
  echo "verify-all: FAIL (${failures} gate/profile record(s) do not apply to this tree)" >&2
  echo "produce evidence locally: 'scripts/evidence/collect-all.sh' produces every gate and profile in the producer each one declares - container-bound profiles through 'scripts/evidence/collect-in-container.sh' inside their digest-pinned image, host profiles through 'scripts/evidence/collect.sh' - and each names its own --gate/--profile pair above. Records are reusable, so a gate already proven for this tree is not re-run: add --force to re-execute instead. Commit the record each run writes; CI verifies records and never executes a gate." >&2
  exit 1
fi

echo "verify-all: PASS (every gate and tracked proof profile is evidence-verified; no command executed in this run)"
