#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

fail() {
  echo "test-release-workflow-changelog-preservation: FAIL ($*)"
  exit 1
}

for workflow in .github/workflows/prerelease.yml .github/workflows/release.yml; do
  if grep -Fq -- '--notes-file' "${workflow}"; then
    fail "${workflow} must not overwrite Release Please/GitHub-generated changelog notes with --notes-file"
  fi
  if grep -Fq 'render-release-notes.sh' "${workflow}"; then
    fail "${workflow} must not render static release notes in the publication path"
  fi
  if grep -Fq 'RELEASE_NOTES.md' "${workflow}"; then
    fail "${workflow} must not shuttle static RELEASE_NOTES.md artifacts into publication"
  fi
done

if grep -R -Fq 'secrets.GITHUB_TOKEN' .github/workflows; then
  fail "workflows must fall back to github.token, not a non-existent secrets.GITHUB_TOKEN"
fi

release_please_pin='googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7 # v5.0.0'
if grep -R -Fq 'googleapis/release-please-action@16a9c90856f42705d54a6fda1823352bdc62cf38' .github/workflows; then
  fail "workflows must not use the deprecated node20 release-please-action pin"
fi
if grep -R -F 'googleapis/release-please-action@' .github/workflows | grep -Fv "${release_please_pin}"; then
  fail "workflows must pin release-please-action to the reviewed node24 SHA"
fi

if grep -R -F 'gh release create' .github/workflows scripts | grep -v 'scripts/test-release-workflow-changelog-preservation.sh'; then
  fail "release recovery must not create GitHub Releases outside Release Please"
fi

grep -Fq 'facetheory-release-scripts' .github/workflows/release.yml ||
  fail "release.yml must stage trusted release provenance scripts before checking out release source code"

grep -Fq 'resolve-release-source-ref.sh" "${TAG_NAME}"' .github/workflows/release.yml ||
  fail "release.yml must resolve existing draft source refs from trusted staged scripts before checkout"

grep -Fq 'RELEASE_SOURCE_COMMIT' .github/workflows/release.yml ||
  fail "release.yml must carry immutable release source identity into the build job"

grep -Fq 'verify-release-draft-target.sh" "${TAG_NAME}" HEAD' .github/workflows/release.yml ||
  fail "release.yml must revalidate existing draft target identity after checkout and before build"

if grep -R -Fq 'run: scripts/publish-draft-release-assets.sh' .github/workflows; then
  fail "release-capable publish tokens must not be exposed to mutable repo publish scripts"
fi

for workflow in .github/workflows/prerelease.yml .github/workflows/release.yml; do
  grep -Fq 'repos/${repo}/releases/${release_id}/assets' "${workflow}" ||
    fail "${workflow} must upload release assets through a minimal inline release-id API step"
  grep -Fq -- '--method PATCH' "${workflow}" ||
    fail "${workflow} must publish draft releases through a minimal inline PATCH API step"
done

grep -Fq 'Resolve draft release metadata' .github/workflows/prerelease.yml ||
  fail "prerelease.yml must resolve hidden draft release metadata before repo checkout"

grep -Fq 'Recover missing current prerelease Release Please state' .github/workflows/prerelease.yml ||
  fail "prerelease.yml must recover missing tagged prerelease Release Please state"

grep -Fq 'expected_title="chore(premain): release ${version}"' .github/workflows/prerelease.yml ||
  fail "prerelease.yml must recover the merged premain Release Please PR for the current RC"

grep -Fq 'Resolve draft release metadata' .github/workflows/release.yml ||
  fail "release.yml must resolve hidden draft release metadata before repo checkout"

for workflow in .github/workflows/prerelease.yml .github/workflows/release.yml; do
  grep -Fq 'for attempt in $(seq 1 72); do' "${workflow}" ||
    fail "${workflow} must tolerate delayed GitHub draft release visibility"
done

grep -Fq 'RELEASE_JSON: ${{ needs.resolve-draft-release.outputs.release_json }}' .github/workflows/prerelease.yml ||
  fail "prerelease.yml must pass control-plane draft metadata to verification without a token"

grep -Fq 'RELEASE_JSON: ${{ needs.resolve-draft-release.outputs.release_json }}' .github/workflows/release.yml ||
  fail "release.yml must pass control-plane draft metadata to verification without a token"

grep -Fq 'RELEASE_JSON: ${{ steps.metadata.outputs.release_json }}' .github/workflows/release.yml ||
  fail "release.yml existing-tag path must pass resolved release metadata without a token"

python3 - <<'PY' || fail "release draft verification steps must not receive GitHub tokens"
from pathlib import Path

for workflow in (Path(".github/workflows/release.yml"), Path(".github/workflows/prerelease.yml")):
    lines = workflow.read_text(encoding="utf-8").splitlines()
    for index, line in enumerate(lines):
        if "verify-release-draft-target.sh" not in line:
            continue
        if "verify-release-draft-target.sh\"" not in line and "run: scripts/verify-release-draft-target.sh" not in line:
            continue
        window = "\n".join(lines[max(0, index - 8): index + 1])
        if "GH_TOKEN:" in window or "GITHUB_TOKEN:" in window or "secrets.RELEASE_PLEASE_TOKEN" in window:
            raise SystemExit(f"{workflow}:{index + 1}")
        if "RELEASE_JSON" not in window:
            raise SystemExit(f"{workflow}:{index + 1}")
PY

grep -Fq 'scripts/check-release-baseline-ready.sh .release-please-manifest.premain.json' .github/workflows/prerelease-pr.yml ||
  fail "prerelease-pr.yml must verify the current premain prerelease baseline before generating the next RC PR"

grep -Fq "needs.check-baseline.outputs.ready == 'true'" .github/workflows/prerelease-pr.yml ||
  fail "prerelease-pr.yml must gate Release Please PR generation on combined baseline readiness"

grep -Fq 'scripts/check-release-baseline-ready.sh .release-please-manifest.premain.json' .github/workflows/release-pr.yml ||
  fail "release-pr.yml must verify the premain RC baseline before generating an aligned stable release PR"

grep -Fq 'steps.version.outputs.release_as }}" != "" &&' .github/workflows/release-pr.yml ||
  fail "release-pr.yml must fail closed when an aligned stable release depends on an unpublished premain RC"

for workflow in .github/workflows/prerelease-pr.yml .github/workflows/release-pr.yml .github/workflows/prerelease.yml; do
  python3 - "${workflow}" <<'PY' || fail "${workflow} check-baseline job must use contents: read"
import sys
from pathlib import Path

workflow = Path(sys.argv[1])
text = workflow.read_text(encoding="utf-8")
needle = "  check-baseline:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n"
if needle not in text:
    raise SystemExit(1)
PY

done

for workflow in .github/workflows/prerelease-pr.yml .github/workflows/release-pr.yml .github/workflows/prerelease.yml; do
  python3 - "${workflow}" <<'PY' || fail "${workflow} baseline scripts must receive only github.token"
import sys
from pathlib import Path

workflow = Path(sys.argv[1])
lines = workflow.read_text(encoding="utf-8").splitlines()
for index, line in enumerate(lines):
    if "scripts/check-release-baseline-ready.sh" not in line:
        continue
    window = "\n".join(lines[max(0, index - 6): index + 1])
    if "secrets.RELEASE_PLEASE_TOKEN" in window:
        raise SystemExit(1)
    if "GH_TOKEN: ${{ github.token }}" not in window:
        raise SystemExit(1)
PY

done

for workflow in .github/workflows/release.yml .github/workflows/prerelease.yml; do
  python3 - "${workflow}" <<'PY' || fail "${workflow} build-release-assets job must use contents: read"
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text(encoding="utf-8")
if not re.search(r"\n  build-release-assets:\n(?:.*\n)*?    permissions:\n      contents: read\n", text):
    raise SystemExit(1)
PY

done

for workflow in .github/workflows/release.yml .github/workflows/prerelease.yml; do
  python3 - "${workflow}" <<'PY' || fail "${workflow} draft metadata resolver must be a no-checkout control-plane job"
import re
import sys
from pathlib import Path

workflow = Path(sys.argv[1])
text = workflow.read_text(encoding="utf-8")
resolver_match = re.search(
    r"\n  resolve-draft-release:\n(?P<block>(?:    .*\n|\n)+?)(?=\n  build-release-assets:)",
    text,
)
if resolver_match is None:
    raise SystemExit(f"missing resolve-draft-release job in {workflow}")
resolver = resolver_match.group("block")
required = (
    "    needs: release-please\n",
    "    if: needs.release-please.outputs.release_created == 'true'\n",
    "    permissions:\n      contents: write\n",
    "    outputs:\n      release_json: ${{ steps.draft.outputs.release_json }}\n",
    "      - name: Resolve draft release metadata\n",
    "          GH_TOKEN: ${{ secrets.RELEASE_PLEASE_TOKEN || github.token }}\n",
)
for needle in required:
    if needle not in resolver:
        raise SystemExit(f"missing resolver invariant {needle!r} in {workflow}")
for forbidden in ("actions/checkout@", "run: scripts/", "make rubric", "npm ci", "build-release-assets.sh"):
    if forbidden in resolver:
        raise SystemExit(f"resolver job must not contain {forbidden!r} in {workflow}")

build_match = re.search(
    r"\n  build-release-assets:\n(?P<block>(?:    .*\n|\n)+?)(?=\n  publish-)",
    text,
)
if build_match is None:
    raise SystemExit(f"missing build-release-assets job in {workflow}")
build = build_match.group("block")
for required in (
    "      - release-please\n",
    "      - resolve-draft-release\n",
    "    permissions:\n      contents: read\n",
    "RELEASE_JSON: ${{ needs.resolve-draft-release.outputs.release_json }}",
):
    if required not in build:
        raise SystemExit(f"missing build invariant {required!r} in {workflow}")
for forbidden in ("GH_TOKEN:", "GITHUB_TOKEN:", "secrets.RELEASE_PLEASE_TOKEN"):
    if forbidden in build:
        raise SystemExit(f"build-release-assets must not receive {forbidden} in {workflow}")

cleanup_match = re.search(
    r"\n  cleanup-failed-draft:\n(?P<block>(?:    .*\n|\n)+?)$",
    text,
)
if cleanup_match is None:
    raise SystemExit(f"missing cleanup-failed-draft job in {workflow}")
cleanup = cleanup_match.group("block")
for required in (
    "      - resolve-draft-release\n",
    "needs.resolve-draft-release.result == 'failure'",
    "needs.resolve-draft-release.result == 'cancelled'",
):
    if required not in cleanup:
        raise SystemExit(f"cleanup must cover resolver failure invariant {required!r} in {workflow}")
PY

done

python3 - .github/workflows/release.yml <<'PY' || fail "release.yml existing-tag build job must use contents: read"
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text(encoding="utf-8")
if not re.search(r"\n  build-existing-tag-assets:\n(?:.*\n)*?    permissions:\n      contents: read\n", text):
    raise SystemExit(1)
PY

python3 - <<'PY' || fail "release-capable tokens must not be passed to repo-controlled scripts"
from pathlib import Path

for workflow in Path(".github/workflows").glob("*.yml"):
    lines = workflow.read_text(encoding="utf-8").splitlines()
    for index, line in enumerate(lines):
        if "run: scripts/" not in line:
            continue
        window = "\n".join(lines[max(0, index - 8): index + 1])
        if "secrets.RELEASE_PLEASE_TOKEN" in window:
            raise SystemExit(f"{workflow}:{index + 1}")
PY

python3 - <<'PY' || fail "release build and rubric steps must not receive GitHub token env"
from pathlib import Path

sensitive_runs = (
    "cd ts && npm ci",
    "make rubric",
    "scripts/build-release-assets.sh",
    "scripts/generate-checksums.sh",
)
for workflow in (Path(".github/workflows/release.yml"), Path(".github/workflows/prerelease.yml")):
    lines = workflow.read_text(encoding="utf-8").splitlines()
    for index, line in enumerate(lines):
        if not any(run in line for run in sensitive_runs):
            continue
        window = "\n".join(lines[max(0, index - 8): index + 1])
        if "GH_TOKEN:" in window or "GITHUB_TOKEN:" in window or "secrets.RELEASE_PLEASE_TOKEN" in window:
            raise SystemExit(f"{workflow}:{index + 1}")
PY

echo "test-release-workflow-changelog-preservation: PASS"
