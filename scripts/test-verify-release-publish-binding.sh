#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guard="${repo_root}/scripts/verify-release-publish-binding.sh"

fail() {
  echo "test-verify-release-publish-binding: FAIL ($*)"
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

seed() {
  local target="$1"
  mkdir -p "${target}/.github/workflows"
  cp "${repo_root}/.github/workflows/release.yml" "${target}/.github/workflows/"
  cp "${repo_root}/.github/workflows/prerelease.yml" "${target}/.github/workflows/"
}

run_guard() {
  REPO_ROOT="$1" bash "${guard}"
}

# Positive: the committed publication sites satisfy every invariant.
seed "${tmpdir}/positive"
run_guard "${tmpdir}/positive" >/dev/null || fail "committed publication sites failed the guard"

# Negative: a publication site that does not receive the verified source commit.
seed "${tmpdir}/no-expected"
python3 - "${tmpdir}/no-expected/.github/workflows/release.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = [line for line in path.read_text(encoding="utf-8").splitlines() if "EXPECTED_SOURCE_COMMIT:" not in line]
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
if run_guard "${tmpdir}/no-expected" >/dev/null 2>&1; then
  fail "publication site without EXPECTED_SOURCE_COMMIT unexpectedly passed"
fi

# Negative: one site loses the binding block (parity break).
seed "${tmpdir}/asymmetric"
python3 - "${tmpdir}/asymmetric/.github/workflows/prerelease.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()
start = next(i for i, line in enumerate(lines) if "release-publish-target-binding:start" in line)
end = next(i for i, line in enumerate(lines) if "release-publish-target-binding:end" in line)
del lines[start : end + 1]
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
if run_guard "${tmpdir}/asymmetric" >/dev/null 2>&1; then
  fail "site without the binding block unexpectedly passed"
fi

# Negative: the binding no longer re-resolves a mutable branch target.
seed "${tmpdir}/no-branch-check"
python3 - "${tmpdir}/no-branch-check/.github/workflows/release.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
needle = '              gh api "repos/${repo}/branches/${target_commitish#refs/heads/}" --jq .commit.sha 2>/dev/null || true\n'
path.write_text(text.replace(needle, "              true\n"), encoding="utf-8")
PY
if run_guard "${tmpdir}/no-branch-check" >/dev/null 2>&1; then
  fail "binding without branch re-resolution unexpectedly passed"
fi

# Negative: the target pin happens after the draft is published.
seed "${tmpdir}/late-pin"
python3 - "${tmpdir}/late-pin/.github/workflows/release.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()
pin = next(
    i for i, line in enumerate(lines) if 'gh api --method PATCH "repos/${repo}/releases/${release_id}" -f "target_commitish=${expected_source_commit}"' in line
)
pin_line = lines.pop(pin)
draft = next(i for i, line in enumerate(lines) if "-F draft=false" in line)
lines.insert(draft + 1, pin_line)
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
if run_guard "${tmpdir}/late-pin" >/dev/null 2>&1; then
  fail "target pinned after publish unexpectedly passed"
fi

# Negative: the final publish PATCH stops re-asserting the pinned target.
seed "${tmpdir}/unpinned-publish"
python3 - "${tmpdir}/unpinned-publish/.github/workflows/release.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
needle = (
    '            -F draft=false \\\n'
    '            -f "target_commitish=${expected_source_commit}" \\\n'
    '            -F prerelease=false \\\n'
)
path.write_text(
    text.replace(needle, "            -F draft=false \\\n            -F prerelease=false \\\n", 1),
    encoding="utf-8",
)
PY
if run_guard "${tmpdir}/unpinned-publish" >/dev/null 2>&1; then
  fail "final publish PATCH without the pinned target unexpectedly passed"
fi

# Runtime: execute the exact binding block from the workflow against a mocked gh.
stub_dir="${tmpdir}/stub"
mkdir -p "${stub_dir}"
cat > "${stub_dir}/gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == "api" ]] || { echo "unexpected gh invocation: $*" >&2; exit 1; }
shift
method="GET"
endpoint=""
field=""
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --method)
      method="$2"
      shift 2
      ;;
    --jq|-H|--header)
      shift 2
      ;;
    -f|--field)
      field="$2"
      shift 2
      ;;
    *)
      if [[ -z "${endpoint}" ]]; then endpoint="$1"; fi
      shift
      ;;
  esac
done
if [[ "${method}" == "PATCH" ]]; then
  printf 'PATCH %s %s\n' "${endpoint}" "${field}" >> "${FAKE_GH_LOG}"
  echo "{}"
  exit 0
fi
case "${endpoint}" in
  */branches/*)
    printf '%s\n' "${FAKE_BRANCH_SHA}"
    ;;
  *)
    echo "unexpected gh endpoint: ${endpoint}" >&2
    exit 1
    ;;
esac
SH
chmod +x "${stub_dir}/gh"

harness="${tmpdir}/harness.sh"
expected_sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
other_sha="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  echo 'repo="theory-cloud/FaceTheory"'
  echo 'release_id="99"'
  echo 'TAG_NAME="v1.2.3"'
  echo 'EXPECTED_SOURCE_COMMIT="$2"'
  echo 'release_fields=("99" "false" "upload" "html" "$1")'
  python3 - "${repo_root}/.github/workflows/release.yml" <<'PY'
import sys
from pathlib import Path

lines = Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()
start = next(i for i, line in enumerate(lines) if "release-publish-target-binding:start" in line)
end = next(i for i, line in enumerate(lines) if "release-publish-target-binding:end" in line)
for line in lines[start + 1 : end]:
    print(line)
PY
  echo 'echo BINDING-PASS'
} > "${harness}"

run_binding() {
  local target="$1" expected="$2" branch_sha="$3" log="$4"
  PATH="${stub_dir}:${PATH}" FAKE_GH_LOG="${log}" FAKE_BRANCH_SHA="${branch_sha}" \
    bash "${harness}" "${target}" "${expected}"
}

# Positive: the draft already targets the verified full SHA.
log="${tmpdir}/sha.log"
run_binding "${expected_sha}" "${expected_sha}" "" "${log}" >/dev/null ||
  fail "exact-SHA publish target did not pass"
grep -Fq "PATCH repos/theory-cloud/FaceTheory/releases/99 target_commitish=${expected_sha}" "${log}" ||
  fail "exact-SHA publish target was not pinned via PATCH"

# Positive: a branch target that still resolves to the verified SHA.
log="${tmpdir}/branch.log"
run_binding "main" "${expected_sha}" "${expected_sha}" "${log}" >/dev/null ||
  fail "branch target resolving to the verified SHA did not pass"
grep -Fq "target_commitish=${expected_sha}" "${log}" ||
  fail "branch target was not pinned to the verified SHA"

# Negative: a branch that moved after verification.
if run_binding "main" "${expected_sha}" "${other_sha}" "${tmpdir}/drift.log" >/dev/null 2>&1; then
  fail "moved branch publish target unexpectedly passed"
fi

# Negative: an exact SHA that is not the verified source commit.
if run_binding "${other_sha}" "${expected_sha}" "" "${tmpdir}/wrong.log" >/dev/null 2>&1; then
  fail "mismatched publish target unexpectedly passed"
fi

# Negative: a missing expected source commit.
if run_binding "${expected_sha}" "" "" "${tmpdir}/missing.log" >/dev/null 2>&1; then
  fail "missing expected source commit unexpectedly passed"
fi

echo "test-verify-release-publish-binding: PASS"
