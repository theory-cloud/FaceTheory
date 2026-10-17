#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guard="${repo_root}/scripts/verify-pages-workflow-order.sh"
workflow_rel=".github/workflows/pages.yml"

fail() {
  echo "test-verify-pages-workflow-order: FAIL ($*)" >&2
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

seed() {
  local target="$1"
  mkdir -p "${target}/.github/workflows"
  cp "${repo_root}/${workflow_rel}" "${target}/${workflow_rel}"
}

run_guard() {
  REPO_ROOT="$1" bash "${guard}"
}

expect_pass() {
  local label="$1" target="$2"
  if ! run_guard "${target}" >/dev/null 2>&1; then
    fail "${label} unexpectedly failed the guard"
  fi
}

expect_fail() {
  local label="$1" target="$2"
  if run_guard "${target}" >/dev/null 2>&1; then
    fail "${label} unexpectedly passed the guard"
  fi
}

# Positive: the committed Pages workflow sources the verifier from a trusted
# constant ref before exec and builds from the immutable run SHA.
seed "${tmpdir}/positive"
expect_pass "committed pages workflow" "${tmpdir}/positive"

# Negative: the verifier runs before any checkout provides it (the round-1
# defect). Delete the trusted-verifier checkout step.
seed "${tmpdir}/no-trusted-checkout"
python3 - "${tmpdir}/no-trusted-checkout/${workflow_rel}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()
start = next(i for i, line in enumerate(lines) if line.strip() == "- name: Checkout trusted verifier source")
end = next(i for i in range(start + 1, len(lines)) if lines[i].startswith("      - "))
del lines[start:end]
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
expect_fail "verifier without a providing checkout" "${tmpdir}/no-trusted-checkout"

# Negative: the trusted checkout is moved after the verifier (order regression).
seed "${tmpdir}/reordered"
python3 - "${tmpdir}/reordered/${workflow_rel}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()
start = next(i for i, line in enumerate(lines) if line.strip() == "- name: Checkout trusted verifier source")
end = next(i for i in range(start + 1, len(lines)) if lines[i].startswith("      - "))
block = lines[start:end]
rest = lines[:start] + lines[end:]
deploy = next(i for i, line in enumerate(rest) if line == "  deploy:")
path.write_text("\n".join(rest[:deploy] + block + rest[deploy:]) + "\n", encoding="utf-8")
PY
expect_fail "trusted checkout after the verifier" "${tmpdir}/reordered"

# Negative: the trusted checkout ref is event-derived, not a constant branch.
seed "${tmpdir}/unpinned-ref"
python3 - "${tmpdir}/unpinned-ref/${workflow_rel}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
path.write_text(text.replace("          ref: refs/heads/main\n", "          ref: ${{ github.event.ref }}\n"), encoding="utf-8")
PY
expect_fail "event-derived verifier source ref" "${tmpdir}/unpinned-ref"

# Negative: the trusted checkout has no subdirectory path, so the verifier path
# it invokes cannot be provided.
seed "${tmpdir}/no-path"
python3 - "${tmpdir}/no-path/${workflow_rel}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
path.write_text(text.replace("          path: .trusted-pages-verifier\n", ""), encoding="utf-8")
PY
expect_fail "trusted checkout without a path" "${tmpdir}/no-path"

# Negative: the verifier is invoked from the repo root (the unverified tree).
seed "${tmpdir}/root-invocation"
python3 - "${tmpdir}/root-invocation/${workflow_rel}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
path.write_text(
    text.replace(
        ".trusted-pages-verifier/scripts/verify-pages-deploy-tag.sh",
        "scripts/verify-pages-deploy-tag.sh",
    ),
    encoding="utf-8",
)
PY
expect_fail "root-path verifier invocation" "${tmpdir}/root-invocation"

# Negative: no later checkout pins the immutable run SHA as the build tree.
seed "${tmpdir}/no-run-sha"
python3 - "${tmpdir}/no-run-sha/${workflow_rel}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
path.write_text(text.replace("          ref: ${{ github.sha }}\n", "          ref: refs/heads/main\n"), encoding="utf-8")
PY
expect_fail "build tree without the immutable run SHA" "${tmpdir}/no-run-sha"

echo "test-verify-pages-workflow-order: PASS"
