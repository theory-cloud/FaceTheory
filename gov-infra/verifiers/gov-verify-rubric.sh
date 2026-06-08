#!/usr/bin/env bash
# FaceTheory gov-infra Rubric Verifier (Single Entrypoint)
# Applied from namespace-managed govern lifecycle profile:
# theorycloud_governance_profile.v0.1 / software_repo_gov_infra
#
# Usage from repository root:
#   bash gov-infra/verifiers/gov-verify-rubric.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
GOV_INFRA="${REPO_ROOT}/gov-infra"
PLANNING_DIR="${GOV_INFRA}/planning"
EVIDENCE_DIR="${GOV_INFRA}/evidence"
REPORT_PATH="${EVIDENCE_DIR}/gov-rubric-report.json"
REPORT_SCHEMA_URI="theorymcp://namespaces/theorycloud/governance-profiles/theorycloud_governance_profile.v0.1/schemas/gov_rubric_report.v1"
REPORT_SCHEMA_VERSION="gov_rubric_report.v1"

cd "${REPO_ROOT}"
mkdir -p "${EVIDENCE_DIR}"

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  printf '%s' "${s}"
}

repo_relative_path() {
  local path="$1"
  if [[ "${path}" == "${REPO_ROOT}/"* ]]; then
    printf '%s' "${path#"${REPO_ROOT}/"}"
  else
    printf '%s' "${path}"
  fi
}

is_valid_report_timestamp() {
  local value="$1"
  [[ "${value}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || return 1
  python3 - "${value}" <<'PY'
from datetime import datetime
import sys
value = sys.argv[1]
try:
    parsed = datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
except ValueError:
    sys.exit(1)
if parsed.strftime("%Y-%m-%dT%H:%M:%SZ") != value:
    sys.exit(1)
PY
}

read_existing_report_timestamp() {
  [[ -f "${REPORT_PATH}" ]] || return 0
  python3 - "${REPORT_PATH}" <<'PY'
import json
import sys
from pathlib import Path
try:
    value = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")).get("timestamp", "")
except Exception:
    value = ""
if isinstance(value, str):
    print(value)
PY
}

select_report_timestamp() {
  local supplied="${GOV_REPORT_TIMESTAMP:-}"
  local existing=""
  existing="$(read_existing_report_timestamp 2>/dev/null || true)"
  if is_valid_report_timestamp "${supplied}" 2>/dev/null; then
    printf '%s' "${supplied}"
  elif is_valid_report_timestamp "${existing}" 2>/dev/null; then
    printf '%s' "${existing}"
  else
    date -u +%Y-%m-%dT%H:%M:%SZ
  fi
}

read_pack_field() {
  local field="$1"
  python3 - "${GOV_INFRA}/pack.json" "${field}" <<'PY'
import json
import sys
from pathlib import Path
path = Path(sys.argv[1])
field = sys.argv[2]
try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    print("unknown")
    raise SystemExit(0)
print(str(data.get(field, "unknown")))
PY
}

require_cmd_or_blocked() {
  local name="$1"
  if ! command -v "${name}" >/dev/null 2>&1; then
    echo "BLOCKED: missing required tool: ${name}" >&2
    return 2
  fi
}

file_sha256() {
  local file_path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${file_path}" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${file_path}" | awk '{print $1}'
  else
    echo "BLOCKED: missing sha256sum/shasum" >&2
    return 2
  fi
}

ensure_ts_deps_installed() {
  require_cmd_or_blocked node || return $?
  require_cmd_or_blocked npm || return $?
  [[ -f ts/package.json ]] || { echo "FAIL: missing ts/package.json" >&2; return 1; }
  [[ -f ts/package-lock.json ]] || { echo "FAIL: missing ts/package-lock.json" >&2; return 1; }

  local lock_hash stamp
  lock_hash="$(file_sha256 ts/package-lock.json)" || return $?
  stamp="ts/node_modules/.gov-ts-deps.sha256"
  if [[ -d ts/node_modules && -f "${stamp}" ]] && grep -Fxq "${lock_hash}" "${stamp}" 2>/dev/null; then
    echo "TypeScript dependencies already match ts/package-lock.json"
    return 0
  fi

  echo "Installing TypeScript dependencies from ts/package-lock.json"
  (cd ts && npm ci --no-audit --no-fund)
  printf '%s\n' "${lock_hash}" > "${stamp}"
}

run_with_pinned_go_toolchain() {
  local pin
  pin="$(tr -d '[:space:]' < .go-version)"
  GOTOOLCHAIN="go${pin}" "$@"
}

check_actions_pinned_to_sha() {
  require_cmd_or_blocked python3 || return $?
  python3 <<'PY'
from pathlib import Path
import re
import sys

failures = []
workflow_dir = Path(".github/workflows")
if not workflow_dir.is_dir():
    print("FAIL: missing .github/workflows")
    sys.exit(1)

uses_re = re.compile(r"^\s*uses:\s*([^\s#]+)")
sha_re = re.compile(r"^[0-9a-f]{40}$")
for path in sorted(workflow_dir.glob("*.y*ml")):
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        match = uses_re.match(line)
        if not match:
            continue
        value = match.group(1).strip().strip('"\'')
        if value.startswith("./"):
            continue
        if value.startswith("docker://"):
            failures.append(f"{path}:{lineno}: docker action is not pinned to a git SHA: {value}")
            continue
        if "@" not in value:
            failures.append(f"{path}:{lineno}: action missing @ref: {value}")
            continue
        ref = value.rsplit("@", 1)[1]
        if not sha_re.fullmatch(ref):
            failures.append(f"{path}:{lineno}: action ref must be a 40-character SHA, got {ref!r}")

if failures:
    print("FAIL: workflow action pinning drift")
    for failure in failures:
        print(f"- {failure}")
    sys.exit(1)

print("workflow-action-pins: PASS")
PY
}

validate_profile_descriptor() {
  require_cmd_or_blocked python3 || return $?
  python3 <<'PY'
import json
import re
import sys
from pathlib import Path

required_planning = [
    "gov-infra/planning/facetheory-threat-model.md",
    "gov-infra/planning/facetheory-controls-matrix.md",
    "gov-infra/planning/facetheory-10of10-rubric.md",
    "gov-infra/planning/facetheory-10of10-roadmap.md",
    "gov-infra/planning/facetheory-evidence-plan.md",
    "gov-infra/planning/facetheory-ai-drift-recovery.md",
    "gov-infra/planning/facetheory-supply-chain-allowlist.txt",
]
required_files = [
    "gov-infra/README.md",
    "gov-infra/AGENTS.md",
    "gov-infra/pack.json",
    "gov-infra/prompts/README.md",
    "gov-infra/governance-profile.json",
    "gov-infra/verifiers/gov-verify-rubric.sh",
    *required_planning,
]
missing = [path for path in required_files if not Path(path).is_file()]
if missing:
    print("FAIL: missing governed artifacts")
    for path in missing:
        print(f"- {path}")
    sys.exit(1)

profile = json.loads(Path("gov-infra/governance-profile.json").read_text(encoding="utf-8"))
if profile.get("contract_id") != "theorycloud_governance_profile.v0.1":
    raise SystemExit("FAIL: descriptor contract_id mismatch")
if profile.get("profile_id") != "software_repo_gov_infra":
    raise SystemExit("FAIL: descriptor profile_id mismatch")
gov = profile.get("gov_infra") or {}
for key, value in {
    "verifier_entrypoint": "gov-infra/verifiers/gov-verify-rubric.sh",
    "evidence_path": "gov-infra/evidence/",
    "report_path": "gov-infra/evidence/gov-rubric-report.json",
}.items():
    if gov.get(key) != value:
        raise SystemExit(f"FAIL: descriptor {key} must be {value!r}, got {gov.get(key)!r}")

g3 = ((profile.get("invariants") or {}).get("G3") or {})
for key in ("verifier_entrypoint", "evidence_path", "report_path"):
    if not g3.get(key):
        raise SystemExit(f"FAIL: descriptor invariant G3 missing {key}")

makefile = Path("Makefile").read_text(encoding="utf-8")
lines = makefile.splitlines()
rubric_recipe = []
inside = False
for line in lines:
    if re.match(r"^rubric:\s*", line):
        inside = True
        continue
    if inside and line and not line.startswith(("\t", " ")) and re.match(r"^[A-Za-z0-9_.-]+:\s*", line):
        break
    if inside:
        rubric_recipe.append(line)
recipe = "\n".join(rubric_recipe)
if "bash gov-infra/verifiers/gov-verify-rubric.sh" not in recipe:
    raise SystemExit("FAIL: Makefile rubric target must call bash gov-infra/verifiers/gov-verify-rubric.sh")

verifier_text = Path("gov-infra/verifiers/gov-verify-rubric.sh").read_text(encoding="utf-8")
if re.search(r"(^|[^A-Za-z0-9_-])make\s+rubric([^A-Za-z0-9_-]|$)", verifier_text):
    raise SystemExit("FAIL: gov verifier must not call the rubric wrapper")

ci = Path(".github/workflows/ci.yml").read_text(encoding="utf-8")
if "bash gov-infra/verifiers/gov-verify-rubric.sh" not in ci:
    raise SystemExit("FAIL: CI rubric job must invoke the gov verifier directly")
if "gov-infra/evidence/" not in ci or "actions/upload-artifact@" not in ci:
    raise SystemExit("FAIL: CI rubric job must upload gov-infra/evidence/")

print("profile-descriptor: PASS")
print("no-recursion: PASS")
print("scaffold-inventory: PASS")
PY
}

check_gov_docs() {
  require_cmd_or_blocked python3 || return $?
  python3 <<'PY'
from pathlib import Path
import sys

failures = []
checks = {
    "gov-infra/README.md": [
        "repo-local, executable governance surface",
        "guide-only documentation is never treated as CI proof",
        "Signing is retired",
    ],
    "gov-infra/prompts/README.md": [
        "does not vendor",
        "govern_lifecycle_turn",
        "bc41187efb6f5b3c3bfb4d9295836d4e071941d7",
    ],
    "AGENTS.md": [
        "GEMINI.md is intentionally absent",
        "theorycloud_governance_profile.v0.1",
        "software_repo_gov_infra",
    ],
}
for path, needles in checks.items():
    file_path = Path(path)
    if not file_path.is_file():
        failures.append(f"missing {path}")
        continue
    text = file_path.read_text(encoding="utf-8")
    for needle in needles:
        if needle not in text:
            failures.append(f"{path}: missing {needle!r}")

if Path("GEMINI.md").exists():
    failures.append("GEMINI.md must remain absent; the absence is the documented decision")
if "GEMINI.md" not in Path(".gitignore").read_text(encoding="utf-8"):
    failures.append(".gitignore must continue to ignore local GEMINI.md materialization")

for path in [Path("gov-infra/governance-profile.json"), Path("AGENTS.md")]:
    if path.is_file():
        text = path.read_text(encoding="utf-8").lower()
        if "mcp replaces repo-local ci" in text or "gov-infra retired" in text:
            failures.append(f"{path}: contains forbidden retirement/replacement claim")

if failures:
    print("FAIL: docs/profile consistency drift")
    for failure in failures:
        print(f"- {failure}")
    sys.exit(1)

print("docs-profile: PASS")
print("gemini-absence: PASS")
PY
}

# --- Rubric verifier functions ---

gov_check_quality() {
  ensure_ts_deps_installed || return $?
  make ts-typecheck
  make ts-lint
  make ts-test
}

gov_check_consistency() {
  require_cmd_or_blocked python3 || return $?
  scripts/verify-version-alignment.sh
  run_with_pinned_go_toolchain scripts/verify-go-version-pin.sh
}

gov_check_completeness() {
  validate_profile_descriptor
}

gov_check_security() {
  require_cmd_or_blocked node || return $?
  require_cmd_or_blocked npm || return $?
  scripts/verify-npm-audit.sh
  check_actions_pinned_to_sha
}

gov_check_compliance() {
  require_cmd_or_blocked bash || return $?
  scripts/verify-ci-rubric-enforced.sh
  scripts/test-verify-release-draft-target.sh
  scripts/test-check-release-baseline-ready.sh
  scripts/test-resolve-release-source-ref.sh
  scripts/test-publish-draft-release-assets.sh
  scripts/test-verify-release-readiness.sh
  scripts/test-release-workflow-changelog-preservation.sh
}

gov_check_maintainability() {
  require_cmd_or_blocked node || return $?
  require_cmd_or_blocked npm || return $?
  require_cmd_or_blocked tar || return $?
  scripts/verify-ts-pack.sh
}

gov_check_docs() {
  check_gov_docs
}

PASS_COUNT=0
FAIL_COUNT=0
BLOCKED_COUNT=0
PACK_VERSION="$(read_pack_field packVersion)"
PACK_DIGEST="$(read_pack_field packDigest)"
REPORT_TIMESTAMP="$(select_report_timestamp)"
declare -a RESULTS=()

record_result() {
  local id="$1"
  local category="$2"
  local status="$3"
  local message="$4"
  local evidence_path="$5"
  local report_evidence_path
  report_evidence_path="$(repo_relative_path "${evidence_path}")"

  case "${status}" in
    PASS) ((PASS_COUNT++)) || true ;;
    FAIL) ((FAIL_COUNT++)) || true ;;
    BLOCKED) ((BLOCKED_COUNT++)) || true ;;
    *) echo "Internal error: invalid status ${status}" >&2; exit 2 ;;
  esac

  RESULTS+=("{\"id\":\"$(json_escape "${id}")\",\"category\":\"$(json_escape "${category}")\",\"status\":\"$(json_escape "${status}")\",\"message\":\"$(json_escape "${message}")\",\"evidencePath\":\"$(json_escape "${report_evidence_path}")\"}")
}

run_check() {
  local id="$1"
  local category="$2"
  local verifier="$3"
  local output_file="${EVIDENCE_DIR}/${id}-output.log"

  if ! declare -F "${verifier}" >/dev/null 2>&1; then
    {
      echo "Verifier: ${verifier}"
      echo "BLOCKED: verifier function is not defined"
    } > "${output_file}"
    record_result "${id}" "${category}" "BLOCKED" "Verifier ${verifier} is not defined" "${output_file}"
    return 0
  fi

  set +e
  (
    set -euo pipefail
    echo "Verifier: ${verifier}"
    echo "Repository: ${REPO_ROOT}"
    echo "Rubric ID: ${id}"
    echo
    "${verifier}"
  ) > "${output_file}" 2>&1
  local ec=$?
  set -e

  if [[ ${ec} -eq 0 ]]; then
    record_result "${id}" "${category}" "PASS" "${verifier} succeeded" "${output_file}"
  elif [[ ${ec} -eq 2 || ${ec} -eq 126 || ${ec} -eq 127 ]]; then
    record_result "${id}" "${category}" "BLOCKED" "${verifier} blocked with exit code ${ec}" "${output_file}"
  else
    record_result "${id}" "${category}" "FAIL" "${verifier} failed with exit code ${ec}" "${output_file}"
  fi
}

write_report() {
  local status="PASS"
  if [[ ${FAIL_COUNT} -gt 0 ]]; then
    status="FAIL"
  elif [[ ${BLOCKED_COUNT} -gt 0 ]]; then
    status="BLOCKED"
  fi

  {
    printf '{\n'
    printf '  "$schema": "%s",\n' "$(json_escape "${REPORT_SCHEMA_URI}")"
    printf '  "schemaVersion": "%s",\n' "$(json_escape "${REPORT_SCHEMA_VERSION}")"
    printf '  "timestamp": "%s",\n' "$(json_escape "${REPORT_TIMESTAMP}")"
    printf '  "pack": {"version": "%s", "digest": "%s"},\n' "$(json_escape "${PACK_VERSION}")" "$(json_escape "${PACK_DIGEST}")"
    printf '  "project": {"name": "FaceTheory", "slug": "facetheory"},\n'
    printf '  "summary": {"status": "%s", "pass": %d, "fail": %d, "blocked": %d},\n' "${status}" "${PASS_COUNT}" "${FAIL_COUNT}" "${BLOCKED_COUNT}"
    printf '  "results": [\n'
    local i
    for i in "${!RESULTS[@]}"; do
      if [[ ${i} -gt 0 ]]; then
        printf ',\n'
      fi
      printf '    %s' "${RESULTS[${i}]}"
    done
    printf '\n  ]\n'
    printf '}\n'
  } > "${REPORT_PATH}"
}

validate_gov_rubric_report_v1() {
  require_cmd_or_blocked python3 || return $?
  python3 - "${REPORT_PATH}" "${REPORT_SCHEMA_URI}" <<'PY'
import json
import os
import re
import sys
from pathlib import Path

report_path = Path(sys.argv[1])
schema_uri = sys.argv[2]
report = json.loads(report_path.read_text(encoding="utf-8"))
errors = []

allowed_top = {"$schema", "schemaVersion", "timestamp", "pack", "project", "summary", "results"}
allowed_result = {"id", "category", "status", "message", "evidencePath"}
allowed_categories = {
    "Quality", "Consistency", "Completeness", "Security", "Compliance", "Maintainability", "Docs"
}
expected_ids = ["QUA-1", "CON-1", "COM-1", "SEC-1", "CMP-1", "MAI-1", "DOC-1"]
if set(report) != allowed_top:
    errors.append(f"top-level keys must be exactly {sorted(allowed_top)}, got {sorted(report)}")
if report.get("$schema") != schema_uri:
    errors.append("$schema mismatch")
if report.get("schemaVersion") != "gov_rubric_report.v1":
    errors.append("schemaVersion must be gov_rubric_report.v1")
if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z", str(report.get("timestamp", ""))):
    errors.append("timestamp must be UTC seconds precision")
pack = report.get("pack")
if not isinstance(pack, dict) or set(pack) != {"version", "digest"}:
    errors.append("pack must contain exactly version and digest")
project = report.get("project")
if project != {"name": "FaceTheory", "slug": "facetheory"}:
    errors.append("project must identify FaceTheory/facetheory")
summary = report.get("summary")
if not isinstance(summary, dict) or set(summary) != {"status", "pass", "fail", "blocked"}:
    errors.append("summary must contain exactly status/pass/fail/blocked")
results = report.get("results")
if not isinstance(results, list):
    errors.append("results must be a list")
else:
    ids = [result.get("id") for result in results if isinstance(result, dict)]
    if ids != expected_ids:
        errors.append(f"results IDs must be stable and ordered: {expected_ids}, got {ids}")
    counts = {"PASS": 0, "FAIL": 0, "BLOCKED": 0}
    for index, result in enumerate(results):
        if not isinstance(result, dict):
            errors.append(f"results[{index}] must be an object")
            continue
        if set(result) != allowed_result:
            errors.append(f"results[{index}] keys must be exactly {sorted(allowed_result)}")
        if result.get("category") not in allowed_categories:
            errors.append(f"results[{index}].category is invalid")
        status = result.get("status")
        if status not in counts:
            errors.append(f"results[{index}].status is invalid")
        else:
            counts[status] += 1
        evidence = result.get("evidencePath")
        if not isinstance(evidence, str) or not evidence.startswith("gov-infra/evidence/") or os.path.isabs(evidence):
            errors.append(f"results[{index}].evidencePath must be repo-relative under gov-infra/evidence/")
        elif not Path(evidence).is_file():
            errors.append(f"results[{index}].evidencePath does not exist: {evidence}")
    if isinstance(summary, dict):
        if summary.get("pass") != counts["PASS"]:
            errors.append("summary.pass count mismatch")
        if summary.get("fail") != counts["FAIL"]:
            errors.append("summary.fail count mismatch")
        if summary.get("blocked") != counts["BLOCKED"]:
            errors.append("summary.blocked count mismatch")
        expected_status = "FAIL" if counts["FAIL"] else "BLOCKED" if counts["BLOCKED"] else "PASS"
        if summary.get("status") != expected_status:
            errors.append("summary.status does not match result counts")

if errors:
    print("FAIL: gov_rubric_report.v1 validation failed", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)
print("gov-rubric-report: schema-valid")
PY
}

rm -f "${REPORT_PATH}" "${EVIDENCE_DIR}/"*-output.log

run_check "QUA-1" "Quality" "gov_check_quality"
run_check "CON-1" "Consistency" "gov_check_consistency"
run_check "COM-1" "Completeness" "gov_check_completeness"
run_check "SEC-1" "Security" "gov_check_security"
run_check "CMP-1" "Compliance" "gov_check_compliance"
run_check "MAI-1" "Maintainability" "gov_check_maintainability"
run_check "DOC-1" "Docs" "gov_check_docs"

write_report
validate_gov_rubric_report_v1

summary_status="$(python3 - "${REPORT_PATH}" <<'PY'
import json
import sys
from pathlib import Path
print(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["summary"]["status"])
PY
)"

echo "gov-rubric: ${summary_status} (${REPORT_PATH})"

if [[ "${summary_status}" != "PASS" ]]; then
  exit 1
fi
