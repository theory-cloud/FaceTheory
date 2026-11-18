#!/usr/bin/env bash
# Purpose: the TypeScript gate command. One command set, run under each tracked
# proof profile, so the recorded result is exactly what the profile ran.
#
# The gate owns its dependency install for the platform it runs on: a Node 22
# Linux floor installs its own tree instead of reusing the producing host's
# node_modules. A lockfile-hash stamp makes a repeat run a no-op.
#
# It deliberately calls npm and the repository scripts directly rather than
# `make`, so the same command works on the macOS producing host and inside the
# digest-pinned Linux floor container.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

ts_deps() {
  local lock_hash stamp
  lock_hash="$(shasum -a 256 ts/package-lock.json 2>/dev/null | awk '{print $1}' || true)"
  if [[ -z "${lock_hash}" ]]; then
    lock_hash="$(sha256sum ts/package-lock.json | awk '{print $1}')"
  fi
  stamp="ts/node_modules/.facetheory-evidence-lock"
  if [[ -d ts/node_modules ]] && [[ -f "${stamp}" ]] && [[ "$(cat "${stamp}")" == "${lock_hash}" ]]; then
    return 0
  fi
  echo "ts-suite: installing ts dependencies for this platform from ts/package-lock.json"
  (cd ts && npm ci --ignore-scripts --no-audit --no-fund)
  printf '%s\n' "${lock_hash}" > "${stamp}"
}

ts_deps

echo "ts-suite: typecheck"
(cd ts && npm run typecheck)

echo "ts-suite: lint"
(cd ts && npm run lint)

echo "ts-suite: format check"
(cd ts && npm run format:check)

echo "ts-suite: example READMEs"
(cd ts && npm run verify:examples:readmes)

echo "ts-suite: docs export map"
bash scripts/verify-docs-export-map.sh

echo "ts-suite: unit tests"
(cd ts && npm test)

echo "ts-suite: coverage"
(cd ts && npm run coverage)

echo "ts-suite: node dependency engines floor"
bash scripts/verify-node-engines-floor.sh

echo "ts-suite: deprecated Lambda runtimes"
bash scripts/verify-lambda-runtime-deprecations.sh

echo "ts-suite: PASS"
