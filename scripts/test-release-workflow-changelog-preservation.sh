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
  if grep -Fq 'make rubric' "${workflow}"; then
    fail "${workflow} release build/publish paths must not run the full rubric"
  fi
  if grep -Fq 'scripts/verify-deterministic-builds.sh' "${workflow}"; then
    fail "${workflow} release build/publish paths must not run deterministic-build verification"
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

python3 - <<'PY' || fail "stable and RC release configs must keep changelog paths separate"
import json
from pathlib import Path


def load(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


stable = load("release-please-config.json")
premain = load("release-please-config.premain.json")

stable_package = stable.get("packages", {}).get(".", {})
premain_package = premain.get("packages", {}).get(".", {})

stable_changelog = stable_package.get("changelog-path", stable.get("changelog-path", "CHANGELOG.md"))
premain_changelog = premain_package.get("changelog-path", premain.get("changelog-path", "CHANGELOG.md"))

if stable.get("prerelease") is True:
    raise SystemExit("stable config must not publish prereleases")
if stable_changelog != "CHANGELOG.md":
    raise SystemExit("stable config must keep CHANGELOG.md as the stable changelog")
if premain.get("prerelease") is not True or premain.get("versioning") != "prerelease":
    raise SystemExit("premain config must remain the RC/prerelease config")
if premain_changelog != "CHANGELOG.prerelease.md":
    raise SystemExit("premain config must write RC notes to CHANGELOG.prerelease.md")
if premain_changelog == stable_changelog:
    raise SystemExit("premain RC notes must not share the stable changelog path")
PY

grep -Fq 'CHANGELOG.prerelease.md' .github/workflows/prerelease-pr.yml ||
  fail "prerelease-pr.yml must ignore RC changelog-only Release Please commits"

if grep -R -F 'gh release create' .github/workflows scripts | grep -v 'scripts/test-release-workflow-changelog-preservation.sh'; then
  fail "release recovery must not create GitHub Releases outside Release Please"
fi

grep -Fq 'facetheory-release-scripts' .github/workflows/release.yml ||
  fail "release.yml must stage trusted release provenance scripts before asset provenance checks"

grep -Fq 'scripts/resolve-release-source-ref.sh' .github/workflows/release.yml ||
  fail "release.yml existing-tag path must resolve requested tags through trusted provenance scripts"

grep -Fq 'scripts/checkout-release-source.sh' .github/workflows/release.yml ||
  fail "release.yml existing-tag path must checkout the requested tag source through trusted provenance scripts"

grep -Fq 'GH_BIN="${RUNNER_TEMP}/facetheory-gh-disabled"' .github/workflows/release.yml ||
  fail "release.yml existing-tag source resolver must not perform repo-script GitHub API lookups"

grep -Fq 'checkout-release-source.sh" "${source_ref}" "${source_commit}"' .github/workflows/release.yml ||
  fail "release.yml existing-tag path must checkout the resolved immutable tag source"

grep -Fq 'verify-release-draft-target.sh" "${TAG_NAME}" "${RELEASE_SOURCE_COMMIT}"' .github/workflows/release.yml ||
  fail "release.yml existing-tag path must compare draft target identity to the checked-out source commit"

if grep -Fq 'verify-release-draft-target.sh" "${TAG_NAME}" "${{ github.sha }}"' .github/workflows/release.yml; then
  fail "release.yml existing-tag path must not compare draft target identity to workflow github.sha"
fi

if grep -Fq 'verify-release-draft-target.sh" "${TAG_NAME}" HEAD' .github/workflows/release.yml; then
  fail "release.yml existing-tag path must not verify draft targets against mutable workspace HEAD"
fi

for workflow in .github/workflows/prerelease.yml .github/workflows/release.yml; do
  grep -Fq 'verify-release-draft-target.sh" "${{ needs.release-please.outputs.tag_name }}" "${{ github.sha }}"' "${workflow}" ||
    fail "${workflow} build-release-assets must compare draft target identity to github.sha"
done

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
  grep -Fq 'concurrency:' "${workflow}" ||
    fail "${workflow} must serialize release publishers"
  grep -Fq 'group: release-publisher-${{ github.repository }}' "${workflow}" ||
    fail "${workflow} must use the shared release-publisher concurrency group"
  grep -Fq 'cancel-in-progress: false' "${workflow}" ||
    fail "${workflow} must queue release publisher reruns instead of cancelling active publishers"
done

grep -Fq 'scripts/verify-release-publish-postcondition.sh prerelease' .github/workflows/prerelease.yml ||
  fail "prerelease.yml must fail closed when a generated RC release PR merge does not create an RC release"

grep -Fq 'scripts/verify-release-publish-postcondition.sh stable' .github/workflows/release.yml ||
  fail "release.yml must fail closed when a generated stable release PR merge does not create a stable release"

grep -Fq 'scripts/verify-release-pr-postcondition.sh prerelease' .github/workflows/prerelease-pr.yml ||
  fail "prerelease-pr.yml must fail closed when Release Please does not open an RC PR"

grep -Fq 'scripts/verify-release-pr-postcondition.sh stable' .github/workflows/release-pr.yml ||
  fail "release-pr.yml must fail closed when Release Please does not open a stable PR"

for workflow in .github/workflows/prerelease.yml .github/workflows/release.yml; do
  grep -Fq 'for attempt in $(seq 1 72); do' "${workflow}" ||
    fail "${workflow} must tolerate delayed GitHub draft release visibility"
  if grep -Fq 'ref: ${{ steps.source.outputs.source_ref }}' "${workflow}"; then
    fail "${workflow} must not use actions/checkout with a dynamic release source ref"
  fi
  if grep -Fq 'verify-release-draft-target.sh" "${{ needs.release-please.outputs.tag_name }}" HEAD' "${workflow}"; then
    fail "${workflow} must not verify draft targets against mutable workspace HEAD"
  fi
done

grep -Fq 'RELEASE_JSON: ${{ needs.resolve-draft-release.outputs.release_json }}' .github/workflows/prerelease.yml ||
  fail "prerelease.yml must pass control-plane draft metadata to verification without a token"

grep -Fq 'RELEASE_JSON: ${{ needs.resolve-draft-release.outputs.release_json }}' .github/workflows/release.yml ||
  fail "release.yml must pass control-plane draft metadata to verification without a token"

grep -Fq 'RELEASE_JSON: ${{ steps.metadata.outputs.release_json }}' .github/workflows/release.yml ||
  fail "release.yml existing-tag path must pass resolved release metadata without a token"

python3 - <<'PY' || fail "release metadata outputs must not be interpolated directly into workflow run blocks"
import re
from pathlib import Path

guarded_output_expressions = {
    output_name: re.compile(
        r"\$\{\{"
        r"[^}]*"
        rf"outputs\s*(?:\.\s*{output_name}|\[\s*['\"]{output_name}['\"]\s*\])"
        r"[^}]*"
        r"\}\}",
        re.S,
    )
    for output_name in ("release_json", "source_ref")
}


def run_blocks(lines: list[str]):
    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.lstrip(" ")
        indent = len(line) - len(stripped)
        if stripped.startswith("run:"):
            run_prefix = "run:"
        elif stripped.startswith("- run:"):
            run_prefix = "- run:"
        else:
            index += 1
            continue

        rest = stripped[len(run_prefix):].strip()
        start_line = index + 1
        if rest in {"|", "|-", "|+", ">", ">-", ">+"}:
            block_lines = []
            block_start_line = index + 2
            index += 1
            while index < len(lines):
                candidate = lines[index]
                candidate_indent = len(candidate) - len(candidate.lstrip(" "))
                if candidate.strip() and candidate_indent <= indent:
                    break
                block_lines.append(candidate)
                index += 1
            yield start_line, block_start_line, "\n".join(block_lines)
            continue

        index += 1
        yield start_line, start_line, rest


for workflow in (Path(".github/workflows/release.yml"), Path(".github/workflows/prerelease.yml")):
    lines = workflow.read_text(encoding="utf-8").splitlines()
    for run_line, block_line, script in run_blocks(lines):
        for output_name, expression in guarded_output_expressions.items():
            match = expression.search(script)
            if match is None:
                continue
            prefix = script[: match.start()]
            line_offset = prefix.count("\n")
            raise SystemExit(
                f"{workflow}:{block_line + line_offset} raw {output_name} expression "
                f"in run block opened at line {run_line}; pass it through env or action inputs"
            )
PY

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
    "      - name: Checkout release workflow scripts\n",
    "      - name: Stage trusted release provenance scripts\n",
    "RELEASE_JSON: ${{ needs.resolve-draft-release.outputs.release_json }}",
    "${RUNNER_TEMP}/facetheory-release-scripts/verify-release-draft-target.sh",
    'verify-release-draft-target.sh" "${{ needs.release-please.outputs.tag_name }}" "${{ github.sha }}"',
    "${RUNNER_TEMP}/facetheory-release-scripts/verify-release-branch.sh",
):
    if required not in build:
        raise SystemExit(f"missing build invariant {required!r} in {workflow}")
for forbidden in (
    "GH_TOKEN:",
    "GITHUB_TOKEN:",
    "secrets.RELEASE_PLEASE_TOKEN",
    "      - name: Resolve release source ref\n",
    "${RUNNER_TEMP}/facetheory-release-scripts/resolve-release-source-ref.sh",
    "      - name: Checkout release source\n",
    "${RUNNER_TEMP}/facetheory-release-scripts/checkout-release-source.sh",
    'verify-release-draft-target.sh" "${{ needs.release-please.outputs.tag_name }}" HEAD',
):
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

checkout_tmp="$(mktemp -d)"
trap 'rm -rf "${checkout_tmp}"' EXIT
(
  set -euo pipefail
  git init --bare "${checkout_tmp}/remote.git" >/dev/null
  git init "${checkout_tmp}/source" >/dev/null
  cd "${checkout_tmp}/source"
  git config user.email test@example.com
  git config user.name "Test User"
  printf 'release source\n' > README.md
  git add README.md
  git commit -m 'test release source' >/dev/null
  commit="$(git rev-parse HEAD)"
  git branch -M main
  git remote add origin "${checkout_tmp}/remote.git"
  git push --quiet origin main >/dev/null
  git clone "${checkout_tmp}/remote.git" "${checkout_tmp}/work" >/dev/null 2>&1
  cd "${checkout_tmp}/work"
  GIT_REMOTE=origin "${repo_root}/scripts/checkout-release-source.sh" "${commit}" >/dev/null
  [[ "$(git rev-parse HEAD)" == "${commit}" ]]
  if GIT_REMOTE=origin "${repo_root}/scripts/checkout-release-source.sh" refs/heads/main >/dev/null 2>&1; then
    echo "checkout-release-source accepted mutable branch" >&2
    exit 1
  fi
) || fail "checkout-release-source.sh must detach immutable commits and reject mutable branches"

echo "test-release-workflow-changelog-preservation: PASS"
