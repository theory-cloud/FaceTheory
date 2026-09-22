#!/usr/bin/env bash
# Purpose: fail when a FaceTheory lockfile dependency declares engines.node
# outside the repository Node floor, or when a project declares a floor below it.
#
# The checker owns the scope, the floor, and the range matcher. This wrapper
# deliberately accepts no arguments and always runs the checker's self-test
# before the scan, so no caller can narrow the scan or waive a package.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "node-engines-floor: BLOCKED (node not found)" >&2
  exit 2
fi
if [[ ! -f "ts/package.json" ]]; then
  echo "node-engines-floor: FAIL (missing ts/package.json)" >&2
  exit 1
fi
for lockfile in \
  "ts/package-lock.json" \
  "infra/apptheory-ssr-site/package-lock.json" \
  "infra/apptheory-ssg-isr-site/package-lock.json"; do
  if [[ ! -f "${lockfile}" ]]; then
    echo "node-engines-floor: FAIL (missing ${lockfile})" >&2
    exit 1
  fi
done
if [[ "$#" -ne 0 ]]; then
  echo "node-engines-floor: FAIL (this gate takes no arguments)" >&2
  exit 1
fi

node scripts/check-node-engines-floor.mjs --self-test
