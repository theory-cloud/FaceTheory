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

grep -Fq 'scripts/check-release-baseline-ready.sh .release-please-manifest.premain.json' .github/workflows/prerelease-pr.yml ||
  fail "prerelease-pr.yml must verify the current premain prerelease baseline before generating the next RC PR"

grep -Fq "needs.check-baseline.outputs.ready == 'true'" .github/workflows/prerelease-pr.yml ||
  fail "prerelease-pr.yml must gate Release Please PR generation on combined baseline readiness"

grep -Fq 'scripts/check-release-baseline-ready.sh .release-please-manifest.premain.json' .github/workflows/release-pr.yml ||
  fail "release-pr.yml must verify the premain RC baseline before generating an aligned stable release PR"

grep -Fq 'steps.version.outputs.release_as }}" != "" &&' .github/workflows/release-pr.yml ||
  fail "release-pr.yml must fail closed when an aligned stable release depends on an unpublished premain RC"

echo "test-release-workflow-changelog-preservation: PASS"
